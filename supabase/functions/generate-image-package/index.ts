import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
import type {
  GenerationSnapshot,
  ProviderConfig,
} from "../_shared/generation-types.ts";

// ── STORYBOARD IMAGE PACKAGE GENERATION (Generation Engine V2) ───────────────
//
// Generates a single storyboard image for the MT-BEG-001 narrative sequence.
// Text-to-image by default; image-to-image when a reference_image_url is supplied
// (reference guides composition only — identity and clothing come from the prompt).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Storyboard prompts for MT-IMG-001 through MT-IMG-010 ─────────────────────
const MT_PROMPTS: Record<string, string> = {
  "MT-IMG-001":
    "Full-body photograph of a professional Asian massage therapist standing at a luxury spa reception desk, " +
    "photographed from a slight low angle so the full figure is visible from head to toe. " +
    "She stands upright with confident, open posture — shoulders back, body facing directly toward the camera, " +
    "weight balanced evenly, feet slightly apart in a grounded welcoming stance. " +
    "Both hands rest softly at her sides or one is extended forward in a gentle open-palm welcoming gesture. " +
    "She wears an elegant soft-toned linen spa uniform — clean, well-fitted, professional. " +
    "Her expression is warm, genuine, and inviting — a natural welcoming smile, warm almond-shaped eyes. " +
    "The spa reception behind her is luxurious and serene: " +
    "a polished stone or marble reception counter, tall fresh orchid or white flower arrangements, " +
    "warm ambient pendant lighting, neutral cream and stone tones, a calm minimalist aesthetic, " +
    "polished stone flooring extending into the background, spa branding subtly visible. " +
    "Camera: centered wide shot, slight upward angle, generous headroom and full leg clearance. " +
    "The mood is: you are expected, completely welcome, in expert hands. " +
    "Photorealistic full-body photography. Soft natural diffused studio lighting. High resolution, editorial quality.",

  "MT-IMG-002":
    "A professional Asian massage therapist seated in a quiet, elegant spa consultation room, " +
    "leaning slightly forward in a composed and attentive listening posture. " +
    "She has a small notepad or tablet in one hand, the other resting open on her knee. " +
    "Her expression is warm, genuinely engaged, professionally focused. " +
    "The consultation room has two soft chairs facing each other, a low side table with a glass of water, " +
    "muted warm tones, soft diffused lighting, and minimal decor. " +
    "The mood is: I am here to understand exactly what you need. " +
    "Photorealistic interior photography. Soft warm lighting. High resolution, professional quality.",

  "MT-IMG-003":
    "A professional Asian massage therapist in a spa consultation room, " +
    "gently indicating a simple anatomical diagram on a small printed card or clipboard, " +
    "pointing to the neck and shoulder region with a professional, precise gesture. " +
    "Her posture is upright and confident, expression calm and expert. " +
    "She wears clean spa attire. The room is quiet and professional — " +
    "neutral tones, warm ambient lighting, a small desk with reference materials. " +
    "The mood is: I understand where you are holding tension, and I know how to help. " +
    "Photorealistic portrait photography. Soft diffused lighting. High resolution, professional quality.",

  "MT-IMG-004":
    "A professional Asian massage therapist arranging a pristine spa treatment room — " +
    "adjusting soft ambient lighting to a warm, low glow, placing a small candle on a wooden side table, " +
    "straightening a rolled white towel at the foot of the massage table. " +
    "Her movements are careful and deliberate, her expression focused and calm. " +
    "The treatment room: cream walls, wooden accents, a single orchid plant, white linens, " +
    "soft floor lighting, and a relaxing, hushed atmosphere. " +
    "The mood is: this space has been prepared entirely for your comfort. " +
    "Photorealistic interior photography. Warm soft ambient lighting. High resolution, professional quality.",

  "MT-IMG-005":
    "A professional Asian massage therapist carefully smoothing and folding fresh white linen " +
    "over a premium padded massage table in a calm, well-appointed spa treatment room. " +
    "Her hands are precise, her posture focused — she is giving this task her full care. " +
    "A small towel stack, a bottle of massage oil, and a low diffuser sit on a side table. " +
    "The room has warm neutral tones, soft overhead lighting, a bamboo plant, subtle earthy decor. " +
    "The mood is: everything is clean, ready, and prepared with intention just for you. " +
    "Photorealistic interior photography. Soft warm lighting. High resolution, professional quality.",

  "MT-IMG-006":
    "A professional Asian massage therapist standing at the head of a prepared massage table, " +
    "hands resting gently on the table's edge, posture composed and calm, eyes forward. " +
    "She wears clean spa attire. Her expression is present, focused, and warmly professional — " +
    "the quiet confidence of someone beginning meaningful work. " +
    "The treatment room behind her: soft warm lighting, white linens, minimal elegant spa decor, " +
    "a diffuser releasing a faint mist, calm and hushed. " +
    "The mood is: we begin now, you are completely safe in my care. " +
    "Photorealistic portrait photography. Soft diffused warm lighting. High resolution, professional quality.",

  "MT-IMG-007":
    "A professional Asian massage therapist demonstrating expert neck and shoulder technique — " +
    "hands positioned with precision on the upper trapezius and neck area, " +
    "applying careful, deliberate therapeutic pressure. " +
    "Her expression is concentrated and professional, fully focused on the treatment. " +
    "The image is close and intimate: clean white linens, therapist's uniform, " +
    "the warm ambient glow of the treatment room, soft bokeh spa background. " +
    "The mood is: skilled, attentive, expert care applied with complete focus. " +
    "Photorealistic close-up photography. Soft warm diffused lighting. High resolution, professional quality.",

  "MT-IMG-008":
    "A professional Asian massage therapist mid-session, hands in a slow, flowing movement " +
    "along the upper back. Her expression is serene, calm, and completely present. " +
    "The treatment room is quiet and deeply peaceful — " +
    "warm amber candlelight, soft background music implied by the stillness of the scene, " +
    "white linens, a faint mist from the diffuser, gentle shadows. " +
    "The mood is: this is deep rest, you are entirely held and safe. " +
    "Photorealistic photography. Very soft, warm, intimate ambient lighting. High resolution, professional quality.",

  "MT-IMG-009":
    "A professional Asian massage therapist at the end of a session, " +
    "seated beside the massage table, one hand resting lightly on the edge in a caring gesture, " +
    "leaning forward with a gentle, attentive expression — checking in with warmth and genuine concern. " +
    "The room: calm post-treatment atmosphere, soft warm lighting, white linens slightly rumpled, " +
    "a glass of water on the side table, a sense of quiet completion. " +
    "The mood is: how are you feeling? I am right here, take all the time you need. " +
    "Photorealistic portrait photography. Soft warm ambient lighting. High resolution, professional quality.",

  "MT-IMG-010":
    "A professional Asian massage therapist at the spa reception or exit area, " +
    "holding a small printed aftercare card and a small complimentary tea or water, " +
    "offering both with a warm, genuine, glowing farewell smile. " +
    "Her expression communicates pride, care, and genuine warmth — " +
    "the satisfaction of having given someone something meaningful. " +
    "The spa exit: bright yet soft lighting, a clean minimal reception desk, " +
    "fresh white flowers, warm neutral tones, a calm and welcoming farewell atmosphere. " +
    "The mood is: you are leaving better than you arrived — please come back. " +
    "Photorealistic portrait photography. Soft natural lighting. High resolution, professional quality.",
};

// ── Upload generated image to Supabase Storage ────────────────────────────────
async function storeInSupabase(
  generatedUrl: string,
  creatorId:     string,
  packageCode:   string,
  supabaseUrl:   string,
  serviceKey:    string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const imgRes = await fetch(generatedUrl);
  if (!imgRes.ok) throw new Error(`Failed to download generated image: ${imgRes.status}`);

  const bytes       = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext         = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const storagePath = `${creatorId}/${packageCode}/image.${ext}`;

  const adminDb = createClient(supabaseUrl, serviceKey);
  const { error } = await adminDb.storage
    .from("image-packages")
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: { publicUrl } } = adminDb.storage
    .from("image-packages")
    .getPublicUrl(storagePath);

  return { publicUrl, storagePath };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const v = {
    prompt_ready:              false,
    image_generation_called:   false,
    ai_image_generated:        false,
    image_stored_successfully: false,
    package_record_updated:    false,
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Resolve provider config via the Generation Engine loader ──────────────
    const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
    if (!providerConfig) {
      return respond({
        error: "No image provider configured. Add one in the Provider Configuration page.",
        verification: v,
      }, 422);
    }

    const userDb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userDb.auth.getUser();
    if (authErr || !user) return respond({ error: "Unauthorized" }, 401);
    const creatorId = user.id;

    const { packageCode = "MT-IMG-001", force = false, reference_image_url = null } =
      await req.json() as { packageCode?: string; force?: boolean; reference_image_url?: string | null };

    // Validate package code
    const prompt = MT_PROMPTS[packageCode];
    if (!prompt) {
      return respond({ error: `Unknown package code: ${packageCode}`, verification: v }, 400);
    }

    // Derive trigger_seq from package code (MT-IMG-001 → 1, MT-IMG-010 → 10)
    const seqMatch   = packageCode.match(/MT-IMG-0*(\d+)$/);
    const triggerSeq = seqMatch ? parseInt(seqMatch[1], 10) : 1;

    // ── Return early if package is already active (unless force=true) �────────
    const { data: existing } = await userDb
      .from("engine_image_packages")
      .select("image_url, is_active")
      .eq("creator_id", creatorId)
      .eq("package_code", packageCode)
      .maybeSingle();

    if (!force && existing?.is_active && existing?.image_url) {
      return respond({
        image_url:      existing.image_url,
        package_code:   packageCode,
        already_exists: true,
        verification: {
          prompt_ready:              true,
          image_generation_called:   true,
          ai_image_generated:        true,
          image_stored_successfully: true,
          package_record_updated:    true,
        },
      });
    }

    // ── Stage 1: Prompt ready ─────────────────────────────────────────────────
    v.prompt_ready = true;

    // ── Build the effective prompt (business logic: composition-copy prefix for img2img)
    const effectivePrompt = reference_image_url
      ? "Use the reference image ONLY for camera angle, framing, body pose, and scene composition layout. " +
        "Do NOT copy the person, face, skin tone, hair, or clothing from the reference. " +
        prompt
      : prompt;

    // ── Stage 2: Build immutable Generation Snapshot ──────────────────────────
    const snapshot: GenerationSnapshot = {
      prompt: effectivePrompt,
      ...(reference_image_url
        ? { inputAssets: { referenceImageUrl: reference_image_url } }
        : {}),
      providerParameters: {
        ...(reference_image_url ? { strength: 0.55 } : {}),
      },
      sceneContext: {
        imageCode: packageCode,
      },
      providerMetadata: {
        package_code:      packageCode,
        parent_code:       "MT-BEG-001",
        role_code:         "MT-001",
        trigger_seq:       triggerSeq,
        source_reference:  reference_image_url ? "img2img_reference" : "generic",
      },
    };

    // ── Create Generation record ──────────────────────────────────────────────
    const generationId = await createGeneration(
      createClient(supabaseUrl, serviceKey),
      {
        creator_id: creatorId,
        asset_type: "image",
        asset_subtype: "storyboard_image",
        business_ref_type: "engine_image_packages",
        provider_id: providerConfig.id,
        provider_name: providerConfig.provider_name,
        provider_model: providerConfig.generation_endpoint || undefined,
        snapshot: snapshot as Record<string, unknown>,
      },
    );

    if (!generationId) throw new Error("Failed to create generation record");

    // ── Stage 3: Hand execution to the image worker ───────────────────────────
    v.image_generation_called = true;
    const result = await imageWorker.execute({ generationId, snapshot, providerConfig });

    if (result.status !== "completed" || !result.outputUrl) {
      throw new Error(result.error ?? "Generation failed");
    }
    v.ai_image_generated = true;

    // ── Stage 4: Store in image-packages bucket ───────────────────────────────
    const stored = await storeInSupabase(result.outputUrl, creatorId, packageCode, supabaseUrl, serviceKey);
    v.image_stored_successfully = true;

    // ── Stage 5: Upsert engine_image_packages record ───────────────────────────
    const now = new Date().toISOString();
    const { error: upsertErr } = await userDb
      .from("engine_image_packages")
      .upsert({
        creator_id:       creatorId,
        package_code:     packageCode,
        parent_code:      "MT-BEG-001",
        role_code:        "MT-001",
        trigger_seq:      triggerSeq,
        image_url:        stored.publicUrl,
        storage_path:     stored.storagePath,
        source_reference: reference_image_url ? "img2img_reference" : "generic",
        prompt,
        generated_at:     now,
        is_active:        true,
        updated_at:       now,
      }, { onConflict: "creator_id,package_code" });

    if (upsertErr) throw new Error(`Package upsert failed: ${upsertErr.message}`);
    v.package_record_updated = true;

    return respond({
      image_url:        stored.publicUrl,
      package_code:     packageCode,
      already_exists:   false,
      reference_mode:   reference_image_url ? "img2img" : "text2img",
      verification:     v,
      generation_id:    generationId,
    });

  } catch (e) {
    return respond({ error: (e as Error).message, verification: v }, 500);
  }
});
