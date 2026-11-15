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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Missing authorization header" }, 401);

    const { password } = await req.json() as { password?: string };
    if (!password || typeof password !== "string") {
      return respond({ error: "Password is required" }, 400);
    }

    // ── 1. Identify the caller from their JWT ──────────────────────────
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return respond({ error: "Invalid session" }, 401);

    const creatorId = user.id;

    // ── 2. Verify the creator is a child creator (not mother, not admin) ──
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: creator, error: creatorErr } = await admin
      .from("creators")
      .select("email, is_content_master, is_super_admin, verification_status")
      .eq("id", creatorId)
      .maybeSingle();

    if (creatorErr || !creator) {
      return respond({ error: "Creator not found" }, 404);
    }
    if (creator.is_content_master) {
      return respond({ error: "Mother Creator accounts cannot be reset from this page." }, 403);
    }
    if (creator.is_super_admin) {
      return respond({ error: "Admin accounts cannot be reset from this page." }, 403);
    }

    // ── 3. Verify the password by attempting a sign-in ──────────────────
    const verifyClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: signInErr } = await verifyClient.auth.signInWithPassword({
      email: creator.email,
      password,
    });
    if (signInErr) {
      return respond({ error: "Incorrect password. Please try again." }, 403);
    }

    // ── 4. Remove Chat Library listings (before deleting role data) ────
    await admin.from("chat_library_listings").delete().eq("creator_id", creatorId);

    // ── 5. Delete workspace data in dependency-safe order ─────────────
    // Order matters: children before parents to avoid FK constraint violations.

    // 5a. Scene image productions (child's generated scene images/videos)
    await admin.from("scene_image_productions").delete().eq("creator_id", creatorId);

    // 5b. Role image productions (child's generated role images)
    await admin.from("role_image_productions").delete().eq("creator_id", creatorId);

    // 5c. Role image library entries (child's library, before generations)
    await admin.from("role_image_library").delete().eq("creator_id", creatorId);

    // 5d. Generations (cascades to generation_history)
    await admin.from("generations").delete().eq("creator_id", creatorId);

    // 5e. Companion test sessions (cascades to companion_test_messages)
    await admin.from("companion_test_sessions").delete().eq("creator_id", creatorId);

    // 5f. Character role selections (before character_roles — NO ACTION FK)
    await admin.from("character_role_selections").delete().eq("creator_id", creatorId);

    // 5g. Character roles created by this child (cascades to role_scenarios → scenario_scenes)
    await admin.from("character_roles").delete().eq("creator_id", creatorId);

    // 5h. My AI overrides (child's custom image selections)
    await admin.from("character_studio_v2_my_ai_overrides").delete().eq("creator_id", creatorId);

    // 5i. Character selections (which shared character the child selected)
    await admin.from("character_studio_v2_selections").delete().eq("creator_id", creatorId);

    // 5j. Appearance profiles and uniform library (child's own presets)
    await admin.from("creator_appearance_profiles").delete().eq("creator_id", creatorId);
    await admin.from("creator_uniform_library").delete().eq("creator_id", creatorId);

    // ── 6. Clean up storage files (NOT verification-docs) ────────────────
    const bucketsToClean = ["generation-outputs", "character_identities_v2"];
    for (const bucket of bucketsToClean) {
      try {
        const { data: objects, error: listErr } = await admin
          .storage
          .from(bucket)
          .list(creatorId, { limit: 1000 });

        if (!listErr && objects && objects.length > 0) {
          const paths = objects.map((o) => `${creatorId}/${o.name}`);
          await admin.storage.from(bucket).remove(paths);
        }
      } catch (storageErr) {
        console.error(`[reset-child-account] Storage cleanup error for ${bucket}:`, (storageErr as Error).message);
      }
    }

    // ── 7. Re-backfill scene recipes from mother creator ────────────────
    try {
      await admin.rpc("backfill_scene_recipes_for_creator", { p_child_creator_id: creatorId });
    } catch (backfillErr) {
      console.error("[reset-child-account] Backfill error:", (backfillErr as Error).message);
    }

    return respond({ success: true });
  } catch (err) {
    console.error("[reset-child-account] Unhandled error:", (err as Error).message);
    return respond({ error: "An unexpected error occurred during account reset." }, 500);
  }
});
