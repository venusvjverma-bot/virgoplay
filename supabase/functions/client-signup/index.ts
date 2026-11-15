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

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { email, mode } = await req.json() as { email?: string; mode?: string };
    if (!email || typeof email !== "string" || !email.trim()) {
      return respond({ error: "Email is required" }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const isSignIn = mode === "signin";

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return respond({ error: "Please enter a valid email address" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

    // Check if a client with this email already exists
    const { data: existing } = await admin
      .from("clients")
      .select("id, email_verified")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (isSignIn) {
      // Sign In mode — account must exist and be verified
      if (!existing) {
        return respond({ error: "No account found for this email. Please create an account first." }, 404);
      }
      if (!existing.email_verified) {
        return respond({ error: "This email has not been verified yet. Please create your account first." }, 403);
      }
      // Verified account — generate a sign-in code
      const { error } = await admin
        .from("clients")
        .update({
          verification_code: code,
          verification_expires_at: expiresAt,
        })
        .eq("id", existing.id);
      if (error) {
        console.error("[client-signup] signin update error:", error.message);
        return respond({ error: "Could not send verification code. Please try again." }, 500);
      }
    } else {
      // Create Account mode
      if (existing?.email_verified) {
        // Already verified — tell them to sign in instead
        return respond({ error: "This email is already registered. Please use Sign In." }, 409);
      }

      if (existing) {
        // Exists but not verified — update with a new code
        const { error } = await admin
          .from("clients")
          .update({
            verification_code: code,
            verification_expires_at: expiresAt,
          })
          .eq("id", existing.id);
        if (error) {
          console.error("[client-signup] update error:", error.message);
          return respond({ error: "Could not send verification code. Please try again." }, 500);
        }
      } else {
        // Create a new unverified client
        const { error } = await admin
          .from("clients")
          .insert({
            email: normalizedEmail,
            email_verified: false,
            is_active: true,
            verification_code: code,
            verification_expires_at: expiresAt,
          });
        if (error) {
          console.error("[client-signup] insert error:", error.message);
          return respond({ error: "Could not create account. Please try again." }, 500);
        }
      }
    }

    // Send verification email via Resend
    const emailTitle = isSignIn ? "Sign in to Virgoplay" : "Verify your email";
    const emailBody = isSignIn
      ? "Enter this code to sign in to your account. The code expires in 15 minutes."
      : "Enter this code to confirm your email address. The code expires in 15 minutes.";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f0f12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f12;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="500" cellpadding="0" cellspacing="0" style="background-color:#1a1a20;border-radius:16px;overflow:hidden;max-width:500px;width:100%;">
          <tr>
            <td style="padding:32px 40px 0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
                <div style="width:36px;height:36px;border-radius:10px;background-color:#3b82f6;display:flex;align-items:center;justify-content:center;">
                  <span style="color:white;font-size:18px;font-weight:bold;">V</span>
                </div>
                <span style="color:#f5f5f5;font-size:18px;font-weight:600;">Virgoplay</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 8px;">
              <h1 style="color:#f5f5f5;font-size:24px;font-weight:bold;margin:0 0 8px;">${emailTitle}</h1>
              <p style="color:#a0a0b0;font-size:15px;line-height:1.5;margin:0 0 24px;">
                ${emailBody}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="text-align:center;background-color:#0f0f12;border:1px solid #2a2a30;border-radius:12px;padding:24px;margin-bottom:24px;">
                <span style="color:#3b82f6;font-size:36px;font-weight:bold;letter-spacing:8px;font-family:monospace;">${code}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="color:#555562;font-size:13px;line-height:1.5;margin:0;border-top:1px solid #2a2a30;padding-top:20px;">
                If you didn't request this code, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
        <p style="color:#444450;font-size:12px;margin-top:24px;">&copy; 2026 Virgoplay. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "noreply@virgoplay.net",
        to: normalizedEmail,
        subject: `${emailTitle} — Virgoplay`,
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error("[client-signup] Resend API error:", resendResponse.status, errText);
      return respond({ error: "Could not send verification email. Please try again." }, 500);
    }

    return respond({ success: true, message: "Verification code sent." });
  } catch (err) {
    console.error("[client-signup] Unhandled error:", (err as Error).message);
    return respond({ error: "An unexpected error occurred." }, 500);
  }
});
