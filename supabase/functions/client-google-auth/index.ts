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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return respond({ error: "Missing authorization header." }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the Google OAuth session by calling getUser with the user's JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return respond({ error: "Invalid or expired Google session." }, 401);
    }

    const googleUser = userData.user;
    const email = googleUser.email?.trim().toLowerCase();
    if (!email) {
      return respond({ error: "Google account did not provide an email address." }, 400);
    }

    // Use service-role client to look up / create the client record
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existing, error: lookupError } = await admin
      .from("clients")
      .select("id, email, email_verified, is_active")
      .eq("email", email)
      .maybeSingle();

    if (lookupError) {
      console.error("[client-google-auth] lookup error:", lookupError.message);
      return respond({ error: "Could not verify account. Please try again." }, 500);
    }

    if (existing) {
      // Existing client — check active status
      if (!existing.is_active) {
        return respond({ error: "This account has been deactivated. Please contact support." }, 403);
      }

      // If the client was created via email-code but not yet verified,
      // Google has now verified the email — mark it verified and grant welcome credits.
      if (!existing.email_verified) {
        const FREE_CREDITS = 10;
        const { error: updateError } = await admin
          .from("clients")
          .update({
            email_verified: true,
            verification_code: null,
            verification_expires_at: null,
            credit_balance: FREE_CREDITS,
          })
          .eq("id", existing.id);

        if (updateError) {
          console.error("[client-google-auth] verify-on-link update error:", updateError.message);
          return respond({ error: "Could not complete sign in. Please try again." }, 500);
        }

        const { error: txError } = await admin
          .from("client_spending_history")
          .insert({
            client_id: existing.id,
            credits: FREE_CREDITS,
            transaction_type: "grant",
            description: "Welcome bonus — free credits (Google sign-in)",
          });

        if (txError) {
          console.error("[client-google-auth] welcome credit insert error:", txError.message);
        }
      }

      // Issue session token
      const { data: sessionToken, error: sessionError } = await admin
        .rpc("create_client_session", { p_client_id: existing.id });
      if (sessionError || !sessionToken) {
        console.error("[client-google-auth] session token error:", sessionError?.message);
        return respond({ error: "Could not create session. Please try again." }, 500);
      }
      return respond({ success: true, client_id: existing.id, session_token: sessionToken });
    }

    // No existing client — create a new verified one with welcome credits
    const FREE_CREDITS = 10;
    const { data: newClient, error: insertError } = await admin
      .from("clients")
      .insert({
        email,
        email_verified: true,
        is_active: true,
        credit_balance: FREE_CREDITS,
        full_name: googleUser.user_metadata?.full_name ?? null,
      })
      .select("id")
      .single();

    if (insertError) {
      // Handle race condition: another request may have created the client
      // between our lookup and insert. Try to find it now.
      if (insertError.code === "23505") {
        const { data: raceClient, error: raceError } = await admin
          .from("clients")
          .select("id, is_active, email_verified")
          .eq("email", email)
          .maybeSingle();

        if (raceError || !raceClient) {
          console.error("[client-google-auth] race-condition retry failed:", raceError?.message);
          return respond({ error: "Could not create account. Please try again." }, 500);
        }

        if (!raceClient.is_active) {
          return respond({ error: "This account has been deactivated. Please contact support." }, 403);
        }

        // Issue session token for race-condition client
        const { data: raceToken, error: raceTokenError } = await admin
          .rpc("create_client_session", { p_client_id: raceClient.id });
        if (raceTokenError || !raceToken) {
          console.error("[client-google-auth] race session token error:", raceTokenError?.message);
          return respond({ error: "Could not create session. Please try again." }, 500);
        }
        return respond({ success: true, client_id: raceClient.id, session_token: raceToken });
      }

      console.error("[client-google-auth] insert error:", insertError.message);
      return respond({ error: "Could not create account. Please try again." }, 500);
    }

    // Record the free credit grant
    const { error: txError } = await admin
      .from("client_spending_history")
      .insert({
        client_id: newClient.id,
        credits: FREE_CREDITS,
        transaction_type: "grant",
        description: "Welcome bonus — free credits (Google sign-in)",
      });

    if (txError) {
      console.error("[client-google-auth] welcome credit insert error:", txError.message);
    }

    // Issue session token for new client
    const { data: newToken, error: newTokenError } = await admin
      .rpc("create_client_session", { p_client_id: newClient.id });
    if (newTokenError || !newToken) {
      console.error("[client-google-auth] new client session token error:", newTokenError?.message);
      return respond({ error: "Could not create session. Please try again." }, 500);
    }
    return respond({ success: true, client_id: newClient.id, session_token: newToken });
  } catch (err) {
    console.error("[client-google-auth] Unhandled error:", (err as Error).message);
    return respond({ error: "An unexpected error occurred." }, 500);
  }
});
