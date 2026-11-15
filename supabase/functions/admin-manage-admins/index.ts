import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
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
    // ── Authenticate the caller using their JWT ───────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

    // Caller client — respects RLS, used only to verify identity
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthenticated." }, 401);

    // Service-role client — bypasses RLS for privileged operations
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Verify caller is Super Admin ─────────────────────────────────────────
    const { data: callerRow, error: callerErr } = await svc
      .from("creators")
      .select("id, email, is_super_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (callerErr || !callerRow) return json({ error: "Caller record not found." }, 403);
    if (!callerRow.is_super_admin) {
      return json({ error: "Forbidden. Only the Super Admin can manage admin accounts." }, 403);
    }

    const body = await req.json();
    const { action } = body;

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: create
    // ════════════════════════════════════════════════════════════════════════
    if (action === "create") {
      const { username, email, password } = body as {
        username: string;
        email: string;
        password: string;
      };

      if (!username || !email || !password) {
        return json({ error: "username, email, and password are required." }, 400);
      }

      // Reject if email already exists in creators
      const { data: existingByEmail } = await svc
        .from("creators")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (existingByEmail) return json({ error: "An account with that email already exists." }, 409);

      // Reject if username already taken
      const { data: existingByUsername } = await svc
        .from("creators")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (existingByUsername) return json({ error: "That username is already taken." }, 409);

      // Create auth user (email confirmed immediately, no confirmation email)
      const { data: newUser, error: createErr } = await svc.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr || !newUser.user) {
        return json({ error: createErr?.message ?? "Failed to create auth user." }, 500);
      }

      const newUserId = newUser.user.id;

      // Insert creators row with role = 'admin', is_super_admin = false
      const { error: insertErr } = await svc.from("creators").insert({
        id: newUserId,
        email,
        username,
        country: "",
        role: "admin",
        is_super_admin: false,
        verification_status: "approved",
      });

      if (insertErr) {
        // Rollback auth user creation if the creators insert fails
        await svc.auth.admin.deleteUser(newUserId);
        return json({ error: insertErr.message }, 500);
      }

      // Audit log
      await svc.from("admin_audit_log").insert({
        admin_id: callerRow.id,
        creator_id: newUserId,
        target_email: email,
        action: "admin_created",
      });

      return json({ success: true, adminId: newUserId });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: remove
    // ════════════════════════════════════════════════════════════════════════
    if (action === "remove") {
      const { targetId } = body as { targetId: string };
      if (!targetId) return json({ error: "targetId is required." }, 400);

      // Block self-removal
      if (targetId === callerRow.id) {
        return json({ error: "You cannot remove your own account." }, 400);
      }

      // Fetch target row
      const { data: target, error: targetErr } = await svc
        .from("creators")
        .select("id, email, role, is_super_admin")
        .eq("id", targetId)
        .maybeSingle();

      if (targetErr || !target) return json({ error: "Target admin account not found." }, 404);

      // Block removal of any Super Admin account
      if (target.is_super_admin) {
        return json({ error: "Super Admin accounts are protected and cannot be removed." }, 403);
      }

      // Block if target is not an admin
      if (target.role !== "admin") {
        return json({ error: "Target is not an admin account." }, 400);
      }

      // Guard: cannot remove the last admin
      const { count } = await svc
        .from("creators")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");

      if ((count ?? 0) <= 1) {
        return json({ error: "Cannot remove the last admin account." }, 400);
      }

      const targetEmail = target.email;

      // Delete creators row first (FK cascade handles related rows)
      const { error: deleteCreatorErr } = await svc
        .from("creators")
        .delete()
        .eq("id", targetId);

      if (deleteCreatorErr) return json({ error: deleteCreatorErr.message }, 500);

      // Delete auth user
      const { error: deleteAuthErr } = await svc.auth.admin.deleteUser(targetId);
      if (deleteAuthErr) {
        // Auth user deletion failed — log but don't surface as fatal since creators row is gone
        console.error("Failed to delete auth user:", deleteAuthErr.message);
      }

      // Audit log — store email directly since the row is now gone
      await svc.from("admin_audit_log").insert({
        admin_id: callerRow.id,
        creator_id: null,
        target_email: targetEmail,
        action: "admin_removed",
      });

      return json({ success: true });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTION: list
    // ════════════════════════════════════════════════════════════════════════
    if (action === "list") {
      const { data: admins, error: listErr } = await svc
        .from("creators")
        .select("id, email, username, role, is_super_admin, created_at")
        .eq("role", "admin")
        .order("created_at", { ascending: true });

      if (listErr) return json({ error: listErr.message }, 500);
      return json({ admins });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (err: unknown) {
    console.error("admin-manage-admins error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Internal server error." },
      500,
    );
  }
});
