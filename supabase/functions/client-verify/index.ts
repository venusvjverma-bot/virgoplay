import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { email, code, mode } = await req.json() as { email?: string; code?: string; mode?: string };
    if (!email || !code) {
      return respond({ error: "Email and verification code are required" }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();
    const isSignIn = mode === "signin";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: client, error } = await admin
      .from("clients")
      .select("id, email, email_verified, is_active, verification_code, verification_expires_at")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (error || !client) {
      return respond({ error: "No account found for this email. Please sign up first." }, 404);
    }

    if (!client.is_active) {
      return respond({ error: "This account has been deactivated. Please contact support." }, 403);
    }

    if (isSignIn) {
      // Sign In mode — account must already be verified
      if (!client.email_verified) {
        return respond({ error: "This email has not been verified yet. Please create your account first." }, 403);
      }
    } else {
      // Create Account mode — if already verified, tell them to sign in
      if (client.email_verified) {
        return respond({ error: "This email is already verified. Please use Sign In." }, 409);
      }
    }

    if (!client.verification_code || !client.verification_expires_at) {
      return respond({ error: "No verification code found. Please request a new one." }, 400);
    }

    if (new Date(client.verification_expires_at) < new Date()) {
      return respond({ error: "This verification code has expired. Please request a new one." }, 410);
    }

    if (client.verification_code !== trimmedCode) {
      return respond({ error: "Incorrect verification code. Please try again." }, 400);
    }

    if (isSignIn) {
      // Sign in — just clear the code, no verification status change needed
      const { error: updateError } = await admin
        .from("clients")
        .update({
          verification_code: null,
          verification_expires_at: null,
        })
        .eq("id", client.id);

      if (updateError) {
        console.error("[client-verify] signin update error:", updateError.message);
        return respond({ error: "Could not complete sign in. Please try again." }, 500);
      }
    } else {
      // Create Account — mark email as verified, clear the code, grant initial free credits
      const FREE_CREDITS = 10;
      const { error: updateError } = await admin
        .from("clients")
        .update({
          email_verified: true,
          verification_code: null,
          verification_expires_at: null,
          credit_balance: FREE_CREDITS,
        })
        .eq("id", client.id);

      if (updateError) {
        console.error("[client-verify] update error:", updateError.message);
        return respond({ error: "Could not verify your email. Please try again." }, 500);
      }

      // Record the free credit grant in transaction history
      const { error: txError } = await admin
        .from("client_spending_history")
        .insert({
          client_id: client.id,
          credits: FREE_CREDITS,
          transaction_type: "grant",
          description: "Welcome bonus — free credits",
        });

      if (txError) {
        console.error("[client-verify] transaction insert error:", txError.message);
      }
    }

    // ── Issue a session token ─────────────────────────────────────────────
    const { data: sessionToken, error: sessionError } = await admin
      .rpc("create_client_session", { p_client_id: client.id });

    if (sessionError || !sessionToken) {
      console.error("[client-verify] session token error:", sessionError?.message);
      return respond({ error: "Could not create session. Please try again." }, 500);
    }

    return respond({
      success: true,
      client_id: client.id,
      session_token: sessionToken,
      message: isSignIn ? "Signed in successfully." : "Email verified successfully.",
    });
  } catch (err) {
    console.error("[client-verify] Unhandled error:", (err as Error).message);
    return respond({ error: "An unexpected error occurred." }, 500);
  }
});
