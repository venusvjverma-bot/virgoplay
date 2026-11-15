import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
import type {
  GenerationSnapshot,
  ProviderConfig,
} from "../_shared/generation-types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface MasterAiCharacter {
  name: string;
  age: number;
  ethnicity: string;
  gender: string;
  hair: string;
  eyes: string;
  face_shape: string;
  skin_tone: string;
  height: string;
  body_figure: string;
  bust: string;
  waist: string;
  hips: string;
  personality: string;
  fashion_style: string;
  default_outfit: string;
  makeup: string;
  accessories: string;
  pose_preference: string;
  lighting_preference: string;
}

interface SceneOverride {
  outfit?: string;
  pose?: string;
  location?: string;
  lighting?: string;
  expression?: string;
  extra_prompt?: string;
  negative_prompt?: string;
  style?: string;
}

function buildPrompt(c: MasterAiCharacter, scene?: SceneOverride): string {
  const parts: string[] = [];

  const fragments: string[] = [];
  if (c.age) fragments.push(`${c.age}-year-old`);
  if (c.ethnicity) fragments.push(c.ethnicity);
  if (c.gender) fragments.push(c.gender);
  const body: string[] = [];
  if (c.body_figure) body.push(c.body_figure);
  if (c.height) body.push(c.height);
  if (c.bust && c.waist && c.hips) {
    body.push(`${c.bust}-${c.waist}-${c.hips} measurements`);
  } else {
    if (c.bust) body.push(c.bust);
    if (c.waist) body.push(c.waist);
    if (c.hips) body.push(c.hips);
  }
  if (body.length) fragments.push(body.join(' '));
  if (c.face_shape) fragments.push(c.face_shape);
  if (c.skin_tone) fragments.push(c.skin_tone);
  if (c.fashion_style) fragments.push(`${c.fashion_style} style`);
  const subject = c.name ? `a woman named ${c.name}` : 'a woman';
  parts.push(`${subject}, ${fragments.join(', ')}`);

  if (c.hair) parts.push(c.hair);
  if (c.eyes) parts.push(c.eyes);
  if (c.makeup) parts.push(c.makeup);
  if (c.accessories) parts.push(c.accessories);

  const outfit = scene?.outfit ?? c.default_outfit;
  if (outfit) parts.push(`wearing ${outfit}`);

  const pose = scene?.pose ?? c.pose_preference;
  if (pose) parts.push(pose);

  if (scene?.expression) parts.push(scene.expression);
  if (scene?.location) parts.push(`in ${scene.location}`);

  const lighting = scene?.lighting ?? c.lighting_preference;
  if (lighting) parts.push(lighting);

  if (scene?.extra_prompt) parts.push(scene.extra_prompt);
  if (c.personality) parts.push(`expressing a ${c.personality} mood`);

  return parts.filter(Boolean).join(', ');
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return respond({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userDb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userDb.auth.getUser();
    if (authError || !user) return respond({ error: 'Invalid or expired session' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // ── Parse request ─────────────────────────────────────────────────────────
    const reqBody = await req.json();
    const { character_id, scene_override, save_as_identity, test_payload, scene_generation, reference_image_url } = reqBody as {
      character_id: string;
      scene_override?: SceneOverride;
      save_as_identity?: boolean;
      test_payload?: { model: string; positive_prompt: string; ratio?: string; batch_size?: number; negative_prompt?: string };
      scene_generation?: boolean;
      reference_image_url?: string;
    };

    if (!character_id && !test_payload) return respond({ error: 'character_id is required' }, 400);

    // ── Load the Master AI Character ──────────────────────────────────────────
    let charRow: Record<string, unknown> | null = null;
    let character: MasterAiCharacter | null = null;
    if (character_id) {
      const { data: row, error: charError } = await userDb
        .from('master_ai_characters')
        .select('*')
        .eq('id', character_id)
        .eq('creator_id', user.id)
        .maybeSingle();

      if (charError) return respond({ error: `DB error: ${charError.message}` }, 500);
      if (!row) return respond({ error: 'Character not found' }, 404);
      charRow = row;
      character = row.character_data as MasterAiCharacter;
    }

    const seed = (charRow?.seed as number) ?? -1;
    const styleFilter = scene_override?.style ?? (charRow?.style_filter as string) ?? 'Cinematic';

    // ── Resolve provider via the Generation Engine loader ─────────────────────
    const providerConfig: ProviderConfig | null = await loadProviderConfig('image');
    if (!providerConfig) {
      return respond({ error: 'No active image provider configured. Add one on the Provider Configuration page.' }, 422);
    }

    // ── Build the prompt (provider-neutral text-to-image) ──────────────────────
    let prompt: string;
    let negativePrompt: string | undefined;
    let providerParameters: Record<string, unknown>;
    let renderTechnique: string = 'text_to_image';
    let inputAssets: Record<string, unknown> = {};

    if (test_payload) {
      prompt = test_payload.positive_prompt;
      negativePrompt = test_payload.negative_prompt;
      providerParameters = {
        model: test_payload.model,
        ratio: test_payload.ratio ?? '1:1',
        imageSize: '512x768',
      };
      console.log('[generate-character-image] TEST PAYLOAD mode — bypassing dynamic prompt builder');

      // Scene generation: use image_editor tool with character's identity image as reference
      if (scene_generation && reference_image_url) {
        renderTechnique = 'image_editor';
        inputAssets = { referenceImageUrl: reference_image_url };
        providerParameters = {
          ...providerParameters,
          batch_size: test_payload.batch_size ?? 1,
        };
        console.log('[generate-character-image] SCENE GENERATION mode — using image_editor with reference image');
      }
    } else {
      prompt = buildPrompt(character!, scene_override);
      negativePrompt = scene_override?.negative_prompt;
      providerParameters = {
        seed,
        style: styleFilter,
        quality: 'Ultra',
        creativity: 50,
        imageSize: '512x768',
        restoreFaces: true,
      };
    }

    // ── Build immutable Generation Snapshot ────────────────────────────────────
    const snapshot: GenerationSnapshot = {
      prompt,
      negativePrompt,
      promptBuilderName: scene_generation ? 'scene_image_editor' : 'character_text_to_image',
      inputAssets,
      providerParameters,
      renderTechnique: renderTechnique as GenerationSnapshot['renderTechnique'],
      providerMetadata: {
        character_id: character_id ?? null,
        save_as_identity: save_as_identity === true,
        style_filter: styleFilter,
        seed,
        scene_generation: scene_generation === true,
      },
    };

    // ── Create Generation record ──────────────────────────────────────────────
    const generationId = await createGeneration(admin, {
      creator_id: user.id,
      asset_type: 'image',
      asset_subtype: 'character_identity',
      business_ref_type: 'master_ai_characters',
      business_ref_id: character_id,
      provider_id: providerConfig.id,
      provider_name: providerConfig.provider_name,
      provider_model: providerConfig.generation_endpoint || undefined,
      snapshot: snapshot as Record<string, unknown>,
      version: 1,
    });

    if (!generationId) {
      return respond({ error: 'Failed to create generation record' }, 500);
    }

    // ── Log pending generation in generated_images ─────────────────────────────
    const { data: imgRow } = await admin
      .from('generated_images')
      .insert({
        creator_id: user.id,
        character_id,
        provider_name: providerConfig.provider_name,
        prompt_used: prompt,
        seed_used: seed,
        status: 'pending',
      })
      .select()
      .single();

    // ── Execute via the Image Worker ────────────────────────────────────────────
    let result;
    try {
      result = await imageWorker.execute({ generationId, snapshot, providerConfig });
    } catch (e) {
      const msg = (e as Error).message;
      if (imgRow) await admin.from('generated_images').update({ status: 'error' }).eq('id', imgRow.id);
      return respond({ error: 'Image generation failed.', detail: msg, generation_id: generationId }, 500);
    }

    if (result.status !== 'completed' || !result.outputUrl) {
      if (imgRow) await admin.from('generated_images').update({ status: 'error' }).eq('id', imgRow.id);
      return respond({
        error: 'Image generation failed.',
        detail: result.error ?? 'Generation failed',
        generation_id: generationId,
      }, 500);
    }

    const publicUrl = result.outputUrl;

    // ── Update generated_images row ─────────────────────────────────────────────
    if (imgRow) {
      await admin.from('generated_images').update({
        image_url: publicUrl,
        seed_used: seed,
        status: 'completed',
      }).eq('id', imgRow.id);
    }

    // ── Optionally save as the character's locked identity ─────────────────────
    if (save_as_identity) {
      await admin.from('master_ai_characters').update({
        identity_image_url: publicUrl,
        identity_image_path: result.outputMetadata?.storagePath as string ?? null,
        provider_metadata: {
          provider_name: providerConfig.provider_name,
          style: styleFilter,
          seed_used: seed,
          generation_id: generationId,
        },
        identity_saved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', character_id);
    }

    return respond({
      success: true,
      image_url: publicUrl,
      provider_name: providerConfig.provider_name,
      generation_id: generationId,
      seed_used: seed,
      prompt_used: prompt,
      identity_saved: save_as_identity === true,
      provider_metadata: {
        provider_name: providerConfig.provider_name,
        style: styleFilter,
        seed_used: seed,
        generation_id: generationId,
      },
    });

  } catch (err) {
    return respond({ error: (err as Error).message }, 500);
  }
});
