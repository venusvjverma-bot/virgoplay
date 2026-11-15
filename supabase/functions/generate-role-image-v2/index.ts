// Customize AI T2I support
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
import type { GenerationSnapshot, ProviderConfig } from "../_shared/generation-types.ts";

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

// ── Role Image Generation V2 (image_editor with character identity reference) ──
//
// Works for BOTH the Mother Creator and verified Child Creators:
//
// Mother Creator:
//   - Loads the role row she owns.
//   - Writes the generated image back to character_roles.role_image_url
//     (the master source).
//
// Child Creator (verified, not the master):
//   - Reads the shared role row (master's data — read-only for the child).
//   - Writes the generated image to role_image_productions (per-account table)
//     so the Mother's image on character_roles is never overwritten.
//   - Uses the character identity from the currently selected V2 character
//     (which itself comes from the master via csv2_select_master_for_verified).

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userDb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userDb.auth.getUser();
    if (authErr || !user) return respond({ error: "Unauthorized" }, 401);
    const creatorId = user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    // ── Parse request ──────────────────────────────────────────────────────
    const body = await req.json() as {
      role_id?: string;
      character_id?: string | null;
      my_ai?: boolean;
      my_ai_child?: boolean;
      customize_ai?: boolean;
      prompt?: string;
      model?: string;
      ratio?: string;
      number_of_images?: number;
      lora_adapter?: string;
      seed?: number;
      randomize_seed?: boolean;
      guidance_scale?: number;
      steps?: number;
      atlas_size?: string;
      atlas_output_format?: string;
      atlas_thinking?: string;
      atlas_prompt_optimization_mode?: string;
    };

    const isMyAi = body.my_ai === true;
    const isMyAiChild = body.my_ai_child === true;
    const isCustomizeAi = body.customize_ai === true;

    // ── My AI branch: no role_id required ───────────────────────────────────
    // Uses the reserved My AI character_studio_v2 row directly. Only the
    // Mother Creator (who owns the row) may call this branch.
    if (isMyAi) {
      const characterId = body.character_id;
      if (!characterId) {
        return respond({ error: "character_id is required for My AI generation." }, 400);
      }

      // Load the My AI row (service-role to bypass RLS).
      const { data: myAiRow, error: myAiErr } = await admin
        .from("character_studio_v2")
        .select("id, creator_id, identity_image_url, my_ai_prompt, my_ai_gen_model, my_ai_gen_ratio, my_ai_gen_num_images, my_ai_gen_output_format, my_ai_gen_thinking, my_ai_gen_prompt_optimization_mode")
        .eq("id", characterId)
        .eq("is_my_ai", true)
        .maybeSingle();

      if (myAiErr || !myAiRow) {
        return respond({ error: "My AI character not found." }, 404);
      }
      if (myAiRow.creator_id !== creatorId) {
        return respond({ error: "Access denied." }, 403);
      }

      const identityImageUrl = myAiRow.identity_image_url;
      if (!identityImageUrl) {
        return respond({
          error: "The My AI character has no identity image. Upload an identity image first.",
        }, 422);
      }

      const prompt = (body.prompt ?? myAiRow.my_ai_prompt ?? "").trim();
      const model = body.model ?? myAiRow.my_ai_gen_model ?? "FLUX_KLEIN_NSFW";
      const ratio = body.ratio ?? myAiRow.my_ai_gen_ratio ?? "9:16";
      const batchSize = Math.max(1, body.number_of_images ?? myAiRow.my_ai_gen_num_images ?? 1);

      // Atlas Cloud parameters: prefer body overrides, fall back to DB values.
      const atlasSize = body.atlas_size ?? myAiRow.my_ai_gen_ratio ?? undefined;
      const atlasOutputFormat = body.atlas_output_format ?? myAiRow.my_ai_gen_output_format ?? undefined;
      const atlasThinking = body.atlas_thinking ?? myAiRow.my_ai_gen_thinking ?? undefined;
      const atlasPromptOpt = body.atlas_prompt_optimization_mode ?? myAiRow.my_ai_gen_prompt_optimization_mode ?? undefined;

      if (!prompt) {
        return respond({ error: "My AI prompt is empty. Save a prompt before generating." }, 422);
      }

      const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
      if (!providerConfig) {
        return respond({ error: "No active image provider configured. Add one on the Provider Configuration page." }, 422);
      }

      const snapshot: GenerationSnapshot = {
        prompt,
        renderTechnique: "image_editor",
        inputAssets: { referenceImageUrl: identityImageUrl },
        providerParameters: {
          model,
          ratio,
          batch_size: batchSize,
          ...(atlasSize !== undefined ? { atlas_size: atlasSize } : {}),
          ...(atlasOutputFormat !== undefined ? { atlas_output_format: atlasOutputFormat } : {}),
          ...(atlasThinking !== undefined ? { atlas_thinking: atlasThinking } : {}),
          ...(atlasPromptOpt !== undefined ? { atlas_prompt_optimization_mode: atlasPromptOpt } : {}),
        },
        providerMetadata: {
          character_id: characterId,
          gen_tool: "image_editor",
          my_ai: true,
        },
      };

      const generationId = await createGeneration(admin, {
        creator_id: creatorId,
        asset_type: "image",
        asset_subtype: "my_ai_image",
        business_ref_type: "character_studio_v2",
        business_ref_id: characterId,
        provider_id: providerConfig.id,
        provider_name: providerConfig.provider_name,
        provider_model: providerConfig.generation_endpoint || undefined,
        snapshot: snapshot as Record<string, unknown>,
        version: 1,
      });

      if (!generationId) {
        return respond({ error: "Failed to create generation record" }, 500);
      }

      // Mark as Processing
      await admin.from("character_studio_v2").update({
        my_ai_image_status: "Processing",
        updated_at: new Date().toISOString(),
      }).eq("id", characterId);

      // Execute
      let result;
      try {
        result = await imageWorker.execute({ generationId, snapshot, providerConfig });
      } catch (e) {
        await admin.from("character_studio_v2").update({
          my_ai_image_status: "Failed",
          updated_at: new Date().toISOString(),
        }).eq("id", characterId);
        return respond({ error: "Image generation failed.", detail: (e as Error).message, generation_id: generationId }, 500);
      }

      if (result.status !== "completed" || !result.outputUrl) {
        await admin.from("character_studio_v2").update({
          my_ai_image_status: "Failed",
          updated_at: new Date().toISOString(),
        }).eq("id", characterId);
        return respond({
          error: "Image generation failed.",
          detail: result.error ?? "Generation failed",
          generation_id: generationId,
        }, 500);
      }

      const assetId = (result.outputMetadata?.asset_ids as string[] | undefined)?.[0] ?? null;

      await admin.from("character_studio_v2").update({
        my_ai_image_url: result.outputUrl,
        my_ai_image_asset_id: assetId,
        my_ai_image_status: "Ready",
        updated_at: new Date().toISOString(),
      }).eq("id", characterId);

      return respond({
        success: true,
        image_url: result.outputUrl,
        asset_id: assetId,
        generation_id: generationId,
        status: "Ready",
        target_table: "character_studio_v2",
      });
    }

    // ── My AI Child Creator branch ──────────────────────────────────────────
    // Uses the Mother Creator's saved My AI configuration (prompt, model,
    // ratio, num_images) as the single source of truth, but swaps in the
    // Child Creator's own uploaded identity image. The generated result
    // is stored in the Child Creator's own override row — never in the
    // shared character_studio_v2 table.
    if (isMyAiChild) {
      const characterId = body.character_id;
      if (!characterId) {
        return respond({ error: "character_id is required for My AI generation." }, 400);
      }

      // Load the Mother Creator's My AI configuration (shared row).
      const { data: myAiConfig, error: configErr } = await admin
        .from("character_studio_v2")
        .select("id, creator_id, my_ai_prompt, my_ai_gen_model, my_ai_gen_ratio, my_ai_gen_num_images, my_ai_gen_output_format, my_ai_gen_thinking, my_ai_gen_prompt_optimization_mode")
        .eq("id", characterId)
        .eq("is_my_ai", true)
        .maybeSingle();

      if (configErr || !myAiConfig) {
        return respond({ error: "My AI configuration not found." }, 404);
      }

      // Load the Child Creator's own override (uploaded identity image).
      const { data: override, error: overrideErr } = await admin
        .from("character_studio_v2_my_ai_overrides")
        .select("creator_id, image_url")
        .eq("creator_id", creatorId)
        .eq("character_id", characterId)
        .maybeSingle();

      if (overrideErr || !override) {
        return respond({ error: "Upload your own My AI image before generating." }, 422);
      }

      const identityImageUrl = override.image_url;
      if (!identityImageUrl) {
        return respond({ error: "Upload your own My AI image before generating." }, 422);
      }

      // Use the Mother's locked configuration — never the Child's input.
      const prompt = (myAiConfig.my_ai_prompt ?? "").trim();
      const model = myAiConfig.my_ai_gen_model ?? "FLUX_KLEIN_NSFW";
      const ratio = myAiConfig.my_ai_gen_ratio ?? "9:16";
      const batchSize = Math.max(1, myAiConfig.my_ai_gen_num_images ?? 1);

      // Atlas Cloud parameters from the Mother's saved config.
      const atlasSize = myAiConfig.my_ai_gen_ratio ?? undefined;
      const atlasOutputFormat = myAiConfig.my_ai_gen_output_format ?? undefined;
      const atlasThinking = myAiConfig.my_ai_gen_thinking ?? undefined;
      const atlasPromptOpt = myAiConfig.my_ai_gen_prompt_optimization_mode ?? undefined;

      if (!prompt) {
        return respond({ error: "My AI prompt is empty. The Mother Creator must save a prompt first." }, 422);
      }

      const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
      if (!providerConfig) {
        return respond({ error: "No active image provider configured. Add one on the Provider Configuration page." }, 422);
      }

      const snapshot: GenerationSnapshot = {
        prompt,
        renderTechnique: "image_editor",
        inputAssets: { referenceImageUrl: identityImageUrl },
        providerParameters: {
          model,
          ratio,
          batch_size: batchSize,
          ...(atlasSize !== undefined ? { atlas_size: atlasSize } : {}),
          ...(atlasOutputFormat !== undefined ? { atlas_output_format: atlasOutputFormat } : {}),
          ...(atlasThinking !== undefined ? { atlas_thinking: atlasThinking } : {}),
          ...(atlasPromptOpt !== undefined ? { atlas_prompt_optimization_mode: atlasPromptOpt } : {}),
        },
        providerMetadata: {
          character_id: characterId,
          gen_tool: "image_editor",
          my_ai_child: true,
        },
      };

      const generationId = await createGeneration(admin, {
        creator_id: creatorId,
        asset_type: "image",
        asset_subtype: "my_ai_child_image",
        business_ref_type: "character_studio_v2_my_ai_overrides",
        business_ref_id: characterId,
        provider_id: providerConfig.id,
        provider_name: providerConfig.provider_name,
        provider_model: providerConfig.generation_endpoint || undefined,
        snapshot: snapshot as Record<string, unknown>,
        version: 1,
      });

      if (!generationId) {
        return respond({ error: "Failed to create generation record" }, 500);
      }

      // Mark as Processing in the Child Creator's override row
      await admin.from("character_studio_v2_my_ai_overrides").update({
        generated_image_status: "Processing",
        generated_generation_id: generationId,
        updated_at: new Date().toISOString(),
      }).eq("creator_id", creatorId).eq("character_id", characterId);

      let result;
      try {
        result = await imageWorker.execute({ generationId, snapshot, providerConfig });
      } catch (e) {
        await admin.from("character_studio_v2_my_ai_overrides").update({
          generated_image_status: "Failed",
          updated_at: new Date().toISOString(),
        }).eq("creator_id", creatorId).eq("character_id", characterId);
        return respond({ error: "Image generation failed.", detail: (e as Error).message, generation_id: generationId }, 500);
      }

      if (result.status !== "completed" || !result.outputUrl) {
        await admin.from("character_studio_v2_my_ai_overrides").update({
          generated_image_status: "Failed",
          updated_at: new Date().toISOString(),
        }).eq("creator_id", creatorId).eq("character_id", characterId);
        return respond({
          error: "Image generation failed.",
          detail: result.error ?? "Generation failed",
          generation_id: generationId,
        }, 500);
      }

      const assetId = (result.outputMetadata?.asset_ids as string[] | undefined)?.[0] ?? null;

      await admin.from("character_studio_v2_my_ai_overrides").update({
        generated_image_url: result.outputUrl,
        generated_image_status: "Ready",
        selected_image_url: result.outputUrl,
        updated_at: new Date().toISOString(),
      }).eq("creator_id", creatorId).eq("character_id", characterId);

      return respond({
        success: true,
        image_url: result.outputUrl,
        asset_id: assetId,
        generation_id: generationId,
        status: "Ready",
        target_table: "character_studio_v2_my_ai_overrides",
      });
    }

    // ── Customize AI branch ────────────────────────────────────────────────
    // Each creator (Mother or Child) has their own appearance data and
    // generated prompt stored in customize_ai_overrides. The Mother's
    // shared generation configuration (model, ratio, etc.) is read from
    // the shared character_studio_v2 row. No reference image is used —
    // this is a text-to-image generation (by_prompt), not image_editor.
    if (isCustomizeAi) {
      const characterId = body.character_id;
      if (!characterId) {
        return respond({ error: "character_id is required for Customize AI generation." }, 400);
      }

      // Load the shared Customize AI slot for the Mother's generation config.
      const { data: sharedRow, error: sharedErr } = await admin
        .from("character_studio_v2")
        .select("id, creator_id, customize_ai_gen_model, customize_ai_gen_ratio, customize_ai_gen_num_images, customize_ai_gen_output_format, customize_ai_gen_thinking, customize_ai_gen_prompt_optimization_mode")
        .eq("id", characterId)
        .eq("is_customize_ai", true)
        .maybeSingle();

      if (sharedErr || !sharedRow) {
        return respond({ error: "Customize AI slot not found." }, 404);
      }

      // Load the calling creator's own override (appearance data + prompt).
      const { data: override, error: overrideErr } = await admin
        .from("customize_ai_overrides")
        .select("creator_id, generated_prompt")
        .eq("creator_id", creatorId)
        .eq("character_id", characterId)
        .maybeSingle();

      if (overrideErr || !override) {
        return respond({ error: "Save your appearance selections before generating." }, 422);
      }

      const prompt = (override.generated_prompt ?? "").trim();
      if (!prompt) {
        return respond({ error: "No generated prompt found. Save your appearance selections first." }, 422);
      }

      const model = sharedRow.customize_ai_gen_model ?? "FLUX_KLEIN_NSFW";
      const ratio = sharedRow.customize_ai_gen_ratio ?? "9:16";
      const batchSize = Math.max(1, sharedRow.customize_ai_gen_num_images ?? 1);
      const atlasSize = sharedRow.customize_ai_gen_ratio ?? undefined;
      const atlasOutputFormat = sharedRow.customize_ai_gen_output_format ?? undefined;
      const atlasThinking = sharedRow.customize_ai_gen_thinking ?? undefined;
      const atlasPromptOpt = sharedRow.customize_ai_gen_prompt_optimization_mode ?? undefined;

      const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
      if (!providerConfig) {
        return respond({ error: "No active image provider configured." }, 422);
      }

      const snapshot: GenerationSnapshot = {
        prompt,
        renderTechnique: "by_prompt",
        inputAssets: {},
        providerParameters: {
          model,
          ratio,
          batch_size: batchSize,
          ...(atlasSize !== undefined ? { atlas_size: atlasSize } : {}),
          ...(atlasOutputFormat !== undefined ? { atlas_output_format: atlasOutputFormat } : {}),
          ...(atlasThinking !== undefined ? { atlas_thinking: atlasThinking } : {}),
          ...(atlasPromptOpt !== undefined ? { atlas_prompt_optimization_mode: atlasPromptOpt } : {}),
        },
        providerMetadata: {
          character_id: characterId,
          gen_tool: "by_prompt",
          customize_ai: true,
        },
      };

      const generationId = await createGeneration(admin, {
        creator_id: creatorId,
        asset_type: "image",
        asset_subtype: "customize_ai_image",
        business_ref_type: "customize_ai_overrides",
        business_ref_id: characterId,
        provider_id: providerConfig.id,
        provider_name: providerConfig.provider_name,
        provider_model: providerConfig.generation_endpoint || undefined,
        snapshot: snapshot as Record<string, unknown>,
        version: 1,
      });

      if (!generationId) {
        return respond({ error: "Failed to create generation record" }, 500);
      }

      await admin.from("customize_ai_overrides").update({
        generated_image_status: "Processing",
        generated_generation_id: generationId,
        updated_at: new Date().toISOString(),
      }).eq("creator_id", creatorId).eq("character_id", characterId);

      let result;
      try {
        result = await imageWorker.execute({ generationId, snapshot, providerConfig });
      } catch (e) {
        await admin.from("customize_ai_overrides").update({
          generated_image_status: "Failed",
          updated_at: new Date().toISOString(),
        }).eq("creator_id", creatorId).eq("character_id", characterId);
        return respond({ error: "Image generation failed.", detail: (e as Error).message, generation_id: generationId }, 500);
      }

      if (result.status !== "completed" || !result.outputUrl) {
        await admin.from("customize_ai_overrides").update({
          generated_image_status: "Failed",
          updated_at: new Date().toISOString(),
        }).eq("creator_id", creatorId).eq("character_id", characterId);
        return respond({
          error: "Image generation failed.",
          detail: result.error ?? "Generation failed",
          generation_id: generationId,
        }, 500);
      }

      const assetId = (result.outputMetadata?.asset_ids as string[] | undefined)?.[0] ?? null;

      await admin.from("customize_ai_overrides").update({
        generated_image_url: result.outputUrl,
        generated_image_status: "Ready",
        selected_image_url: result.outputUrl,
        updated_at: new Date().toISOString(),
      }).eq("creator_id", creatorId).eq("character_id", characterId);

      // Only the Mother Creator's generation writes to the shared row.
      // Child Creators' images stay isolated in their own override.
      if (sharedRow.creator_id === creatorId) {
        await admin.from("character_studio_v2").update({
          identity_image_url: result.outputUrl,
          identity_asset_id: assetId,
          updated_at: new Date().toISOString(),
        }).eq("id", characterId);
      }

      return respond({
        success: true,
        image_url: result.outputUrl,
        asset_id: assetId,
        generation_id: generationId,
        status: "Ready",
        target_table: "customize_ai_overrides",
      });
    }

    // ── Role Image branch (unchanged) ───────────────────────────────────────
    const roleId = body.role_id;
    if (!roleId) return respond({ error: "role_id is required" }, 400);

    // ── Load the role row ───────────────────────────────────────────────────
    // Use the service-role client so we can read the role regardless of
    // whether the caller is the Mother Creator or a verified Child Creator.
    const { data: role, error: roleErr } = await admin
      .from("character_roles")
      .select("*")
      .eq("id", roleId)
      .maybeSingle();

    if (roleErr || !role) {
      return respond({ error: "Role not found." }, 404);
    }

    // ── Determine if the caller is the Mother Creator or a Child Creator ────
    const { data: callerCreator } = await admin
      .from("creators")
      .select("id, is_content_master, verification_status")
      .eq("id", creatorId)
      .maybeSingle();

    if (!callerCreator) {
      return respond({ error: "Creator profile not found." }, 403);
    }

    const isMotherCreator = callerCreator.is_content_master === true;
    const isVerifiedChild =
      !isMotherCreator && callerCreator.verification_status === "approved";

    // Authorization: the caller must either own the role OR be a verified
    // child reading a master's role.
    if (role.creator_id !== creatorId && !isVerifiedChild) {
      return respond({ error: "Role not found or access denied." }, 403);
    }

    // For verified children, verify the role belongs to a master creator
    if (isVerifiedChild) {
      const { data: roleOwner } = await admin
        .from("creators")
        .select("is_content_master")
        .eq("id", role.creator_id)
        .maybeSingle();

      if (!roleOwner?.is_content_master) {
        return respond({ error: "Role not found or access denied." }, 403);
      }
    }

    // ── Resolve the character for identity ──────────────────────────────────
    const characterId = body.character_id ?? role.character_id;
    if (!characterId) {
      return respond({
        error: "No character selected. Select a character in Character Studio V2 before generating a Role Image.",
      }, 422);
    }

    // ── Load the linked character ──────────────────────────────────────────
    let identityImageUrl: string | null = null;

    const { data: v2Char } = await admin
      .from("character_studio_v2")
      .select("identity_image_url, is_customize_ai")
      .eq("id", characterId)
      .maybeSingle();

    if (v2Char?.is_customize_ai) {
      // Customize AI: each creator has their own image in customize_ai_overrides.
      // Never use the shared row's identity_image_url (the Mother's).
      const { data: customizeOverride } = await admin
        .from("customize_ai_overrides")
        .select("selected_image_url, generated_image_url")
        .eq("creator_id", creatorId)
        .eq("character_id", characterId)
        .maybeSingle();
      identityImageUrl = customizeOverride?.selected_image_url ?? customizeOverride?.generated_image_url ?? null;
    } else if (v2Char?.identity_image_url) {
      identityImageUrl = v2Char.identity_image_url;
    } else {
      const { data: legacyChar } = await admin
        .from("master_ai_characters")
        .select("identity_image_url")
        .eq("id", characterId)
        .maybeSingle();
      identityImageUrl = legacyChar?.identity_image_url ?? null;
    }

    // For a verified Child Creator whose selected character is the My AI
    // character, the identity image lives in the Child Creator's own
    // override row (selected_image_url), not the shared table.
    if (!identityImageUrl && isVerifiedChild) {
      const { data: override } = await admin
        .from("character_studio_v2_my_ai_overrides")
        .select("selected_image_url")
        .eq("creator_id", creatorId)
        .eq("character_id", characterId)
        .maybeSingle();
      if (override?.selected_image_url) {
        identityImageUrl = override.selected_image_url;
      }
    }

    if (!identityImageUrl) {
      return respond({
        error: "The selected character has no identity image. Generate and save an identity image in Character Studio first.",
      }, 422);
    }

    // ── Resolve provider ────────────────────────────────────────────────────
    const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
    if (!providerConfig) {
      return respond({ error: "No active image provider configured. Add one on the Provider Configuration page." }, 422);
    }

    // ── Build the Generation Snapshot ───────────────────────────────────────
    const prompt = role.role_prompt || "";
    const model = body.model ?? role.gen_model ?? "FLUX_KLEIN_NSFW";
    const ratio = body.ratio ?? role.gen_ratio ?? "9:16";
    const batchSize = Math.max(1, body.number_of_images ?? role.gen_number_of_images ?? 1);

    if (!prompt.trim()) {
      return respond({ error: "Role prompt is empty. Save a prompt before generating." }, 422);
    }

    const snapshot: GenerationSnapshot = {
      prompt,
      renderTechnique: "image_editor",
      inputAssets: {
        referenceImageUrl: identityImageUrl,
      },
      providerParameters: {
        model,
        ratio,
        batch_size: batchSize,
        ...(body.lora_adapter !== undefined ? { lora_adapter: body.lora_adapter } : {}),
        ...(body.seed !== undefined ? { seed: body.seed } : {}),
        ...(body.randomize_seed !== undefined ? { randomize_seed: body.randomize_seed } : {}),
        ...(body.guidance_scale !== undefined ? { guidance_scale: body.guidance_scale } : {}),
        ...(body.steps !== undefined ? { steps: body.steps } : {}),
        ...((body.atlas_size ?? role.gen_ratio) !== undefined ? { atlas_size: body.atlas_size ?? role.gen_ratio } : {}),
        ...((body.atlas_output_format ?? role.gen_output_format) !== undefined ? { atlas_output_format: body.atlas_output_format ?? role.gen_output_format } : {}),
        ...((body.atlas_thinking ?? role.gen_thinking) !== undefined ? { atlas_thinking: body.atlas_thinking ?? role.gen_thinking } : {}),
        ...((body.atlas_prompt_optimization_mode ?? role.gen_prompt_optimization_mode) !== undefined ? { atlas_prompt_optimization_mode: body.atlas_prompt_optimization_mode ?? role.gen_prompt_optimization_mode } : {}),
      },
      providerMetadata: {
        role_id: roleId,
        character_id: characterId,
        gen_tool: role.gen_tool || "image_editor",
      },
    };

    // ── Create Generation record ────────────────────────────────────────────
    const generationId = await createGeneration(admin, {
      creator_id: creatorId,
      asset_type: "image",
      asset_subtype: "role_image",
      business_ref_type: "character_roles",
      business_ref_id: roleId,
      provider_id: providerConfig.id,
      provider_name: providerConfig.provider_name,
      provider_model: providerConfig.generation_endpoint || undefined,
      snapshot: snapshot as Record<string, unknown>,
      version: 1,
    });

    if (!generationId) {
      return respond({ error: "Failed to create generation record" }, 500);
    }

    // ── Determine the target table for the generated image ──────────────────
    const targetTable = isMotherCreator ? "character_roles" : "role_image_productions";

    // ── Mark as Processing ───────────────────────────────────────────────────
    if (isMotherCreator) {
      await admin.from("character_roles").update({
        role_image_status: "Processing",
        role_image_generation_id: generationId,
        updated_at: new Date().toISOString(),
      }).eq("id", roleId);
    } else {
      const { data: existingProd } = await admin
        .from("role_image_productions")
        .select("id")
        .eq("creator_id", creatorId)
        .eq("role_id", roleId)
        .maybeSingle();

      if (existingProd) {
        await admin.from("role_image_productions").update({
          role_image_status: "Processing",
          role_image_generation_id: generationId,
          updated_at: new Date().toISOString(),
        }).eq("id", existingProd.id);
      } else {
        await admin.from("role_image_productions").insert({
          creator_id: creatorId,
          role_id: roleId,
          role_image_status: "Processing",
          role_image_generation_id: generationId,
        });
      }
    }

    // ── Execute the image worker ─────────────────────────────────────────────
    let result;
    try {
      result = await imageWorker.execute({ generationId, snapshot, providerConfig });
    } catch (e) {
      const msg = (e as Error).message;
      if (isMotherCreator) {
        await admin.from("character_roles").update({
          role_image_status: "Failed",
          updated_at: new Date().toISOString(),
        }).eq("id", roleId);
      } else {
        await admin.from("role_image_productions").update({
          role_image_status: "Failed",
          updated_at: new Date().toISOString(),
        }).eq("creator_id", creatorId).eq("role_id", roleId);
      }
      return respond({ error: "Image generation failed.", detail: msg, generation_id: generationId }, 500);
    }

    if (result.status !== "completed" || !result.outputUrl) {
      if (isMotherCreator) {
        await admin.from("character_roles").update({
          role_image_status: "Failed",
          updated_at: new Date().toISOString(),
        }).eq("id", roleId);
      } else {
        await admin.from("role_image_productions").update({
          role_image_status: "Failed",
          updated_at: new Date().toISOString(),
        }).eq("creator_id", creatorId).eq("role_id", roleId);
      }
      return respond({
        error: "Image generation failed.",
        detail: result.error ?? "Generation failed",
        generation_id: generationId,
      }, 500);
    }

    // ── Update with generated image ──────────────────────────────────────────
    const assetId = (result.outputMetadata?.asset_ids as string[] | undefined)?.[0] ?? null;
    const storagePath = (result.outputMetadata?.storagePath as string | undefined) ?? null;

    if (isMotherCreator) {
      await admin.from("character_roles").update({
        role_image_url: result.outputUrl,
        role_image_path: storagePath,
        role_image_asset_id: assetId,
        role_image_status: "Ready",
        updated_at: new Date().toISOString(),
      }).eq("id", roleId);
    } else {
      await admin.from("role_image_productions").update({
        role_image_url: result.outputUrl,
        role_image_path: storagePath,
        role_image_asset_id: assetId,
        role_image_status: "Ready",
        updated_at: new Date().toISOString(),
      }).eq("creator_id", creatorId).eq("role_id", roleId);
    }

    return respond({
      success: true,
      image_url: result.outputUrl,
      asset_id: assetId,
      generation_id: generationId,
      status: "Ready",
      target_table: targetTable,
    });
  } catch (err) {
    return respond({ error: (err as Error).message }, 500);
  }
});
