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

// ── Password Reset Email via Resend ──────────────────────────────────────────
//
// Flow:
//   1. Receives { email } from the Forgot Password page (public, no auth).
//   2. Uses the service-role key to call Supabase Auth's admin API to generate
//      a recovery link for that user.
//   3. Sends a custom HTML email through Resend containing the secure reset
//      link pointing to /reset-password (with the recovery token appended).
//   4. Returns { success: true } regardless of whether the email exists, to
//      avoid user enumeration.
//
// The recovery token is generated and validated by Supabase Auth — the
// existing /reset-password page already handles the PASSWORD_RECOVERY event
// and calls updateUser({ password }). This function only replaces the email
// delivery layer; the secure token logic is untouched.

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { email, redirect_url } = await req.json() as { email?: string; redirect_url?: string };
    if (!email || typeof email !== "string" || !email.trim()) {
      return respond({ error: "Email is required" }, 400);
    }
    if (!redirect_url || typeof redirect_url !== "string" || !redirect_url.trim()) {
      return respond({ error: "redirect_url is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Generate a recovery link for the user. Supabase returns a URL with the
    // recovery token in the hash (PKCE flow). We redirect to /reset-password.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: email.trim().toLowerCase(),
      options: {
        redirectTo: redirect_url,
      },
    });

    // If the user doesn't exist, return success to prevent enumeration.
    if (error || !data) {
      console.log("[send-password-reset] generateLink error or no user:", error?.message ?? "no data");
      return respond({ success: true });
    }

    // Use Supabase's action_link — it goes through the verify endpoint which
    // validates the token and redirects to our /reset-password page with the
    // session in the URL hash (PKCE flow). The existing ResetPasswordPage
    // already handles this via onAuthStateChange(PASSWORD_RECOVERY).
    //
    // Supabase may replace our redirect_to with the configured Site URL
    // (e.g. https://virgoplay.net) instead of the full path we passed. We fix
    // the redirect_to in the action_link to include /reset-password so the
    // user lands on the correct page.
    let resetLink: string | undefined = data.properties?.action_link;

    if (!resetLink) {
      console.error("[send-password-reset] No action_link in generateLink response");
      return respond({ success: true });
    }

    // Fix the redirect_to in the action_link to point to /reset-password.
    // The verify endpoint preserves the redirect_to query param, so we replace
    // whatever redirect_to Supabase set with our intended destination.
    try {
      const linkUrl = new URL(resetLink);
      linkUrl.searchParams.set("redirect_to", redirect_url);
      resetLink = linkUrl.toString();
    } catch {
      // If URL parsing fails, keep the original link
    }

    // ── Send the email via Resend ──────────────────────────────────────────
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
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
                <span style="color:#f5f5f5;font-size:18px;font-weight:600;">Creator Portal AI</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 8px;">
              <h1 style="color:#f5f5f5;font-size:24px;font-weight:bold;margin:0 0 8px;">Reset your password</h1>
              <p style="color:#a0a0b0;font-size:15px;line-height:1.5;margin:0 0 24px;">
                We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;">
              <a href="${resetLink}" style="display:inline-block;background-color:#3b82f6;color:white;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;">
                Reset Password
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="color:#666674;font-size:13px;line-height:1.5;margin:0;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="color:#666674;font-size:12px;line-height:1.5;margin:8px 0 0;word-break:break-all;">
                ${resetLink}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="color:#555562;font-size:13px;line-height:1.5;margin:0;border-top:1px solid #2a2a30;padding-top:20px;">
                If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
              </p>
            </td>
          </tr>
        </table>
        <p style="color:#444450;font-size:12px;margin-top:24px;">&copy; 2026 Virgoplay. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "noreply@virgoplay.net",
        to: email.trim().toLowerCase(),
        subject: "Reset your password — Creator Portal AI",
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error("[send-password-reset] Resend API error:", resendResponse.status, errText);
      return respond({ error: "Failed to send password reset email. Please try again." }, 500);
    }

    return respond({ success: true });
  } catch (err) {
    console.error("[send-password-reset] Unhandled error:", (err as Error).message);
    return respond({ error: "An unexpected error occurred." }, 500);
  }
});
