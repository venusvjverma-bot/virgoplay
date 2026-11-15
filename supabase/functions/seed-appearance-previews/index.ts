import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
import type {
  GenerationSnapshot,
  ProviderConfig,
} from "../_shared/generation-types.ts";

// Platform setup function — generates static AI model preset preview images.
// verify_jwt is false; this only mutates platform-level preset assets.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Super admin creator used as the initiator for platform-level generations.
const PLATFORM_CREATOR_ID = "81037345-2a1b-4242-952d-d5087b737c27";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
  if (!providerConfig) {
    return respond({ error: "No image provider configured. Add one in the Provider Configuration page." }, 422);
  }

  let body: { preset_id?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* GET or empty body = generate all */ }

  const admin = createClient(supabaseUrl, serviceKey);

  let query = admin
    .from("engine_appearance_preset_assets")
    .select("preset_id, preset_name, generation_prompt, is_generated, image_url")
    .neq("generation_prompt", ""); // skip APR-008 (empty prompt)

  if (body.preset_id) {
    query = query.eq("preset_id", body.preset_id);
  } else if (!body.force) {
    query = query.eq("is_generated", false);
  }

  const { data: presets, error: fetchErr } = await query.order("sort_order");
  if (fetchErr) return respond({ error: fetchErr.message }, 500);
  if (!presets?.length) {
    return respond({ message: "All presets already generated (pass force:true to regenerate).", count: 0 });
  }

  const results: { preset_id: string; status: string; image_url?: string; error?: string }[] = [];

  for (const preset of presets) {
    try {
      const snapshot: GenerationSnapshot = {
        prompt: preset.generation_prompt,
        providerMetadata: {
          preset_id: preset.preset_id,
          preset_name: preset.preset_name,
        },
      };

      const generationId = await createGeneration(admin, {
        creator_id: PLATFORM_CREATOR_ID,
        asset_type: "image",
        asset_subtype: "appearance_preset",
        business_ref_type: "engine_appearance_preset_assets",
        provider_id: providerConfig.id,
        provider_name: providerConfig.provider_name,
        provider_model: providerConfig.generation_endpoint || undefined,
        snapshot: snapshot as Record<string, unknown>,
      });

      if (!generationId) throw new Error("Failed to create generation record");

      const result = await imageWorker.execute({
        generationId,
        snapshot,
        providerConfig,
      });

      if (result.status !== "completed" || !result.outputUrl) {
        throw new Error(result.error ?? "Generation failed");
      }

      const storagePath = result.outputMetadata?.storagePath as string ?? null;

      const { error: updateErr } = await admin
        .from("engine_appearance_preset_assets")
        .update({
          image_url:    result.outputUrl,
          storage_path: storagePath,
          is_generated: true,
          updated_at:   new Date().toISOString(),
        })
        .eq("preset_id", preset.preset_id);

      if (updateErr) throw new Error(updateErr.message);

      results.push({ preset_id: preset.preset_id, status: "generated", image_url: result.outputUrl });
    } catch (e) {
      results.push({ preset_id: preset.preset_id, status: "error", error: (e as Error).message });
    }
  }

  const succeeded = results.filter(r => r.status === "generated").length;
  return respond({ processed: results.length, succeeded, results });
});
