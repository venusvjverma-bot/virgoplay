import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  createGeneration,
  GenerationLifecycle,
  getLatestVersion,
} from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
import type {
  GenerationSnapshot,
  GenerationRow,
  ProviderConfig,
} from "../_shared/generation-types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── ROLE IMAGE GENERATION PIPELINE (Generation Engine V2) ──────────────────────
//
// This edge function is the PRE-DISPATCH layer for role-image generation.
// It resolves all business data (identity, layers, dress, accessories, blueprint),
// builds the scene prompt, constructs an immutable Generation Snapshot, creates
// a Generation record, and executes the image worker.
//
// After successful generation, it updates the role_image_library business table
// with the output URL, storage path, and generation_id.
//
// On failure, the Generation record and snapshot are preserved. The business
// table is NOT updated. Nothing is lost.
//
// The pipeline stages are:
//   Step 1 │ Master AI Identity     — selected by creator (master_ai_identities)
//   Step 2 │ Canonical Body Asset   — AI-XXXX-A (ai_identity_layers, is_canonical_body=true)
//   Step 3 │ Base Clothing          — AI-XXXX-B (ai_identity_layers, base_clothing)
//   Step 4 │ APR Face + BT Body     — source images for face-swap composition
//   Step 5 │ Dress Layer            — DR-XXX from ai_dress_library (REQUIRED per blueprint)
//   Step 6 │ Accessory Layers       — ACC-XXX from ai_accessory_library (optional per blueprint)
//   Step 7 │ Role Blueprint         — environment / pose / camera / expression / lighting
//   Step 8 │ Generation Engine      — immutable snapshot → generation record → image worker
//   Step 9 │ Final Image            — stored in generation-outputs bucket, linked to business table

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Build scene prompt from blueprint + dress data ────────────────────────────
// Constructs a scene prompt using the role blueprint's environment, pose,
// camera, and expression specs together with the dress description.
function buildScenePrompt(params: {
  aprName:             string;
  btName:              string;
  dressName:           string;
  dressDescription:    string | null;
  dressPromptFragment: string | null;
  environment:         Record<string, string> | null;
  pose:                Record<string, string> | null;
  camera:              Record<string, string> | null;
  expression:          Record<string, string> | null;
}): string {
  const { dressDescription, dressPromptFragment, environment, pose, camera, expression } = params;

  const dressPart = dressPromptFragment
    ?? dressDescription?.slice(0, 200)
    ?? "luxury spa wrap robe, warm beige premium cotton terry";

  const envSetting  = environment?.setting  ?? "professional luxury spa";
  const envLighting = environment?.lighting  ?? "warm soft ambient lighting";
  const envBg       = environment?.background ?? "clean elegant spa reception";

  const poseStance = pose?.stance ?? "standing professional";
  const poseBody   = pose?.body   ?? "upright professional posture";

  const exprMood  = expression?.mood        ?? "calm professional";
  const exprSmile = expression?.smile       ?? "warm welcoming smile";
  const exprEye   = expression?.eye_contact ?? "warm direct eye contact";

  const camAngle   = camera?.angle    ?? "medium shot";
  const camFraming = camera?.framing  ?? "professional portrait";

  return [
    "Full-length professional portrait photograph,",
    "complete figure visible from head to feet.",
    "Beautiful young woman, warm skin tone, natural body proportions.",
    `Wearing: ${dressPart}.`,
    `Pose: ${poseStance}, ${poseBody}, hands relaxed, welcoming presence.`,
    `Expression: ${exprSmile}, ${exprMood}, ${exprEye}.`,
    `Setting: ${envSetting}, ${envBg}.`,
    `Lighting: ${envLighting}.`,
    `Camera: ${camFraming}, ${camAngle}, vertical portrait.`,
    "Warm luxury lighting, professional commercial photography,",
    "high-end wellness branding, photorealistic.",
  ].join(" ");
}

const PHASE_LABEL: Record<string, string> = {
  beginning: "Beginning",
  middle:    "Middle",
  ending:    "Ending",
};

// ── Reference-guided generation config ────────────────────────────────────────
const IMAGE_REFERENCE_CONFIG: Record<string, { reference_code: string; action_prompt: string }> = {
  "MT-IMG-009": {
    reference_code: "MT-IMG-008",
    action_prompt:  "Identical composition, framing, face position, and expression as the reference image. Face centered, fully illuminated, unobstructed, looking directly into camera. Only change: both hands are lowered to waist level, fingers gently touching the robe belt. Everything else — head angle, lighting, background, robe, expression — remains exactly the same.",
  },
};

// ── Per-image-code scene prompt overrides ─────────────────────────────────────
const SCENE_PROMPT_OVERRIDES: Record<string, string> = {
  "MT-IMG-003": [
    "Photorealistic premium commercial photography, soft depth of field, sharp facial details.",
    "Beautiful young woman seated comfortably on a chair in a luxury spa consultation room,",
    "captured from the client's point of view sitting directly opposite her.",
    "Eye-level camera. Frame from head down to approximately the middle of the small consultation table between client and model.",
    "She wears an elegant luxury spa wrap robe with a wider, open neckline,",
    "premium soft cotton fabric, tasteful and slightly generous décolletage, spa-resort styling.",
    "Relaxed seated posture, leaning slightly forward in engaged natural conversation.",
    "One hand resting gently on the table surface, other hand relaxed in her lap.",
    "Direct warm eye contact with the viewer, warm welcoming smile, laughing naturally mid-conversation,",
    "friendly approachable confident expression.",
    "Small consultation table between her and the viewer holds: a coffee cup and a small spa brochure.",
    "Table surface is clean and minimal.",
    "Background: premium luxury spa interior, soft warm ambient lighting, lit candles,",
    "natural wooden furniture, lush green plants, neatly folded white towels,",
    "wellness décor, high-end relaxing atmosphere.",
    "Warm soft bokeh background, realistic natural lighting, photorealistic.",
  ].join(" "),

  "MT-IMG-004": [
    "Photorealistic premium commercial photography, soft depth of field, sharp facial details.",
    "Beautiful young woman seated comfortably on a chair in a luxury spa consultation room,",
    "captured from approximately 20 to 30 degrees to the client's left — a natural three-quarter angle, not straight-on.",
    "Eye-level camera, slight side angle. Frame from head down to approximately the middle of the small consultation table.",
    "She wears an elegant luxury spa wrap robe with a noticeably wider open V neckline,",
    "generous décolletage revealing the upper chest area, similar in coverage to a tasteful swimwear neckline,",
    "premium soft cotton fabric, spa-resort styling, sophisticated and professional.",
    "Relaxed seated posture, body angled naturally toward the camera, leaning slightly forward.",
    "One hand resting gently on the table surface, other hand relaxed in her lap.",
    "Warm subtly flirty smile, soft playful expression, direct confident eye contact toward the camera.",
    "A client's hand rests naturally visible in the near foreground on the consultation table edge,",
    "as if belonging to the viewer seated at the table.",
    "Small consultation table holds: a coffee cup and a small spa brochure. Table surface is clean and minimal.",
    "Background: premium luxury spa interior, soft warm ambient lighting, lit candles,",
    "natural wooden furniture, lush green plants, neatly folded white towels,",
    "wellness décor, high-end relaxing atmosphere.",
    "Warm soft bokeh background, realistic natural lighting, photorealistic.",
  ].join(" "),

  "MT-IMG-005": [
    "Photorealistic premium commercial photography, soft depth of field, sharp facial details.",
    "Beautiful young woman standing face-to-face with the viewer at close proximity,",
    "captured from first-person client POV — camera at natural eye level, direct front-facing.",
    "Full figure visible, natural relaxed stance, welcoming body language.",
    "She wears a luxury spa wrap robe, warm beige premium cotton terry,",
    "neckline slightly loosened in a natural relaxed way, soft fabric draping gently.",
    "Expression: genuine shy laugh — eyes slightly crinkled with warmth, spontaneous and authentic,",
    "slightly nervous playful energy, endearing and inviting.",
    "Hands relaxed at sides or lightly clasped in front, natural comfortable posture.",
    "Setting: premium luxury spa reception or corridor, soft warm ambient lighting,",
    "clean elegant interior, warm bokeh background.",
    "Mood: playful, welcoming, slightly nervous — the first intimate moment of connection.",
    "Warm soft natural lighting, photorealistic, high-end wellness branding.",
  ].join(" "),

  "MT-IMG-006": [
    "Photorealistic premium commercial photography, soft depth of field, sharp facial details.",
    "Beautiful young woman gently holding and guiding the client's hand, leading him forward,",
    "captured from a three-quarter or side angle — her body partially turned, in natural walking movement.",
    "She wears a luxury spa wrap robe, warm beige premium cotton terry, fabric flowing naturally with gentle movement.",
    "Her hand is clearly visible, fingers interlaced with or cupping the client's hand,",
    "the client's hand visible in the lower foreground of the frame.",
    "Expression: warm confident smile, reassuring and inviting — she leads with ease and calm authority.",
    "Background: spa transition area — soft hint of a massage room doorway or corridor in the background,",
    "warm ambient lighting, clean minimalist spa interior.",
    "Mood: intimate, guiding, trusting — a moment of gentle leading.",
    "Soft natural lighting, warm bokeh, photorealistic.",
  ].join(" "),

  "MT-IMG-007": [
    "Photorealistic premium commercial photography, soft depth of field, sharp facial details.",
    "Beautiful young woman captured from first-person client POV — camera at natural eye level.",
    "She is seated or gently leaning against the edge of a massage bed,",
    "body relaxed, posture open and attentive.",
    "She wears a luxury spa wrap robe, warm beige premium cotton terry, properly and elegantly worn.",
    "Expression: deep, attentive eye contact — head slightly tilted in genuine listening,",
    "empathetic and fully present, brow gently soft, expression warm and connected.",
    "Background: massage bed clearly visible in the frame — fresh crisp white linens,",
    "premium spa room setting, soft warm ambient lighting, candles, calm spa décor.",
    "Mood: connected, intimate, therapeutic — fully focused on the client.",
    "Warm natural lighting, soft bokeh background, photorealistic.",
  ].join(" "),

  "MT-IMG-008": [
    "Photorealistic premium commercial photography, soft depth of field, sharp facial details.",
    "Beautiful young woman extending both arms forward toward the viewer,",
    "offering a neatly folded fresh white spa towel — captured from first-person client POV.",
    "Camera at natural eye level. Arms and towel fill the lower-center of the frame.",
    "She wears a luxury spa wrap robe, warm beige premium cotton terry.",
    "Expression: professional caring smile, warm service-oriented expression,",
    "attentive and nurturing, eyes soft and direct.",
    "Background: massage bed fully visible in the frame — fresh white linens, spa room setting,",
    "warm ambient lighting, premium wellness décor.",
    "Mood: professional, nurturing, preparatory — a moment of thoughtful hospitality.",
    "Clean soft natural lighting, warm bokeh, photorealistic.",
  ].join(" "),

  "MT-IMG-009": [
    "Photorealistic intimate portrait photography, soft focus background, sharp facial details.",
    "Exact same frontal portrait composition, head angle, and face position as MT-IMG-008.",
    "Client POV, medium close-up, face centered and dominant in frame.",
    "Beautiful young woman facing the camera directly, looking straight into the lens.",
    "Face fully illuminated by warm soft spa lighting, completely unobstructed — no shadows, no hair covering the face.",
    "Expression: warm professional smile, identical to MT-IMG-008.",
    "She wears the Classic Massage Robe DR-MT-001, falling naturally from the shoulders, collar relaxed.",
    "Only change: both hands lowered to waist level, fingers gently touching the robe belt.",
    "Nothing in her hands. She is not holding or extending anything toward the viewer.",
    "Warm ambient spa lighting from the front, face evenly lit.",
    "Background: private massage room, soft focus, massage bed with fresh white linens clearly visible.",
    "Photorealistic, natural warm lighting, soft bokeh background.",
  ].join(" "),
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return respond({ error: "Unauthorized. Valid JWT required." }, 401);
  const creatorId = user.id;

  // ── Parse input ────────────────────────────────────────────────────────────
  let imageCode:         string;
  let roleCode:          string;
  let roleBlueprintId:   string;
  let phase:             string;
  let sequence:          number;
  let masterIdentityId:  string;
  let dressCodeOverride: string | null;
  let accessoryCodesOverride: string[] | null;

  try {
    const body             = await req.json();
    imageCode             = body.image_code              ?? "";
    roleCode              = body.role_code               ?? "";
    roleBlueprintId       = body.role_blueprint_id       ?? "";
    phase                 = body.phase                   ?? "";
    sequence              = Number(body.sequence         ?? 0);
    masterIdentityId      = body.master_ai_identity_id  ?? "";
    dressCodeOverride     = body.dress_code              ?? null;
    accessoryCodesOverride = Array.isArray(body.accessory_codes) ? body.accessory_codes : null;
  } catch {
    return respond({ error: "Request body must be valid JSON." }, 400);
  }

  if (!imageCode || !roleCode || !roleBlueprintId || !phase || !sequence || !masterIdentityId) {
    return respond({
      error: "Required fields: image_code, role_code, role_blueprint_id, phase, sequence, master_ai_identity_id.",
    }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const now   = new Date().toISOString();

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Master AI Identity
  // ══════════════════════════════════════════════════════════════════════════
  const { data: identity, error: identErr } = await admin
    .from("master_ai_identities")
    .select("id, identity_code, apr_code, apr_name, bt_code, bt_name, generation_status")
    .eq("id", masterIdentityId)
    .eq("creator_id", creatorId)
    .maybeSingle();

  if (identErr || !identity) {
    return respond({
      error:      "Master AI Identity not found or does not belong to this creator.",
      step_failed: 1,
    }, 404);
  }
  if (identity.generation_status !== "completed") {
    return respond({
      error:      `Master AI Identity ${identity.identity_code} is not completed (status: ${identity.generation_status}). Generate a completed identity in AP-001 before generating role images.`,
      step_failed: 1,
    }, 422);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEPS 2 + 3 — Canonical Body Asset + Base Clothing
  // ══════════════════════════════════════════════════════════════════════════
  const { data: layers } = await admin
    .from("ai_identity_layers")
    .select("id, layer_code, layer_type, is_canonical_body, source_ref")
    .eq("identity_id", masterIdentityId)
    .in("layer_type", ["body", "base_clothing"]);

  const bodyLayer     = layers?.find(l => l.is_canonical_body === true) ?? null;
  const clothingLayer = layers?.find(l => l.layer_type === "base_clothing") ?? null;

  if (!bodyLayer) {
    return respond({
      error:       `Canonical Body Asset (AI-XXXX-A) not found for identity ${identity.identity_code}. The identity layers may not be fully initialised.`,
      step_failed: 2,
    }, 422);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 4 — Source asset images (APR face + BT body)
  // ══════════════════════════════════════════════════════════════════════════
  const [faceRes, bodyRes] = await Promise.all([
    admin.from("engine_appearance_preset_assets")
      .select("preset_name, image_url").eq("preset_id", identity.apr_code).maybeSingle(),
    admin.from("engine_body_type_preset_assets")
      .select("body_type_name, image_url").eq("preset_id", identity.bt_code).maybeSingle(),
  ]);

  if (!faceRes.data?.image_url) {
    return respond({
      error:       `APR preset ${identity.apr_code} has no image. Seed appearance previews first.`,
      step_failed: 4,
    }, 422);
  }
  if (!bodyRes.data?.image_url) {
    return respond({
      error:       `BT preset ${identity.bt_code} has no image. Seed body type previews first.`,
      step_failed: 4,
    }, 422);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 5 — Role Blueprint (fetch dress_code + accessory_codes)
  // ══════════════════════════════════════════════════════════════════════════
  const { data: blueprint, error: bpErr } = await admin
    .from("ai_role_blueprints")
    .select("id, role_code, role_name, dress_code, accessory_codes, environment, camera, pose, expression, generation_prompt_fragment")
    .eq("id", roleBlueprintId)
    .maybeSingle();

  if (bpErr || !blueprint) {
    return respond({
      error:       `Role Blueprint ${roleBlueprintId} not found.`,
      step_failed: 5,
    }, 404);
  }

  const effectiveDressCode = dressCodeOverride ?? blueprint.dress_code ?? null;

  if (!effectiveDressCode) {
    return respond({
      error:       `Role outfit not configured. Blueprint ${blueprint.role_code} (${blueprint.role_name}) has no dress_code. Update the role blueprint to set a required outfit before generating images.`,
      step_failed: 5,
      resolution:  "Set dress_code on the ai_role_blueprints record for this role.",
    }, 422);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 5b — Dress Layer (resolve DR-XXX → ai_dress_library record)
  // ══════════════════════════════════════════════════════════════════════════
  const { data: dress, error: dressErr } = await admin
    .from("ai_dress_library")
    .select("id, dress_code, dress_name, description, image_url, generation_prompt_fragment")
    .eq("dress_code", effectiveDressCode)
    .eq("is_active", true)
    .maybeSingle();

  if (dressErr || !dress) {
    return respond({
      error:       `Dress ${effectiveDressCode} not found in ai_dress_library or is inactive. Verify the dress code on the role blueprint.`,
      step_failed: 5,
      dress_code:  effectiveDressCode,
    }, 422);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 6 — Accessory Layers
  // ══════════════════════════════════════════════════════════════════════════
  const effectiveAccessoryCodes: string[] =
    accessoryCodesOverride ?? (blueprint.accessory_codes as string[] ?? []);

  let resolvedAccessories: { id: string; accessory_code: string; accessory_name: string }[] = [];

  if (effectiveAccessoryCodes.length > 0) {
    const { data: accessories, error: accErr } = await admin
      .from("ai_accessory_library")
      .select("id, accessory_code, accessory_name")
      .in("accessory_code", effectiveAccessoryCodes)
      .eq("is_active", true);

    if (accErr) {
      return respond({
        error:       `Accessory lookup failed: ${accErr.message}`,
        step_failed: 6,
      }, 500);
    }

    resolvedAccessories = accessories ?? [];

    const foundCodes  = new Set(resolvedAccessories.map(a => a.accessory_code));
    const missingCodes = effectiveAccessoryCodes.filter(c => !foundCodes.has(c));
    if (missingCodes.length > 0) {
      return respond({
        error:         `Accessories not found in ai_accessory_library or inactive: ${missingCodes.join(", ")}`,
        step_failed:   6,
        missing_codes: missingCodes,
      }, 422);
    }
  }

  const accessoryIds   = resolvedAccessories.map(a => a.id);
  const accessoryNames = resolvedAccessories.map(a => a.accessory_name);

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 7 — Build scene prompt
  // ══════════════════════════════════════════════════════════════════════════
  const scenePrompt = SCENE_PROMPT_OVERRIDES[imageCode] ?? buildScenePrompt({
    aprName:             identity.apr_name ?? faceRes.data.preset_name,
    btName:              identity.bt_name  ?? bodyRes.data.body_type_name,
    dressName:           dress.dress_name,
    dressDescription:    dress.description,
    dressPromptFragment: dress.generation_prompt_fragment,
    environment:         blueprint.environment as Record<string, string> | null,
    pose:                blueprint.pose        as Record<string, string> | null,
    camera:              blueprint.camera      as Record<string, string> | null,
    expression:          blueprint.expression  as Record<string, string> | null,
  });

  // ── Resolve reference image for Redux-guided generation ────────────────────
  const refConfig = IMAGE_REFERENCE_CONFIG[imageCode] ?? null;
  let referenceImageUrl: string | null = null;
  if (refConfig) {
    const { data: refRecord } = await admin
      .from("role_image_library")
      .select("image_url")
      .eq("creator_id", creatorId)
      .eq("image_code", refConfig.reference_code)
      .eq("generation_status", "generated")
      .maybeSingle();
    referenceImageUrl = refRecord?.image_url ?? null;
  }

  // Effective prompt: Redux action prompt if reference available, else scene prompt
  const effectivePrompt = (referenceImageUrl && refConfig)
    ? refConfig.action_prompt
    : scenePrompt;

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 8 — Build immutable Generation Snapshot + create Generation record
  // ══════════════════════════════════════════════════════════════════════════
  const renderTechnique = "identity_lock_pipeline";

  const layerSnapshot = {
    generation_technique:  "identity_lock_pipeline",
    identity_code:         identity.identity_code,
    apr_code:              identity.apr_code,
    apr_name:              identity.apr_name ?? faceRes.data.preset_name,
    bt_code:               identity.bt_code,
    bt_name:               identity.bt_name ?? bodyRes.data.body_type_name,
    role_code:             blueprint.role_code,
    role_name:             blueprint.role_name,
    phase_label:           PHASE_LABEL[phase] ?? phase,
    sequence,
    dress_code:            dress.dress_code,
    dress_name:            dress.dress_name,
    dress_description:     dress.description,
    dress_prompt_fragment: dress.generation_prompt_fragment,
    accessory_codes:       effectiveAccessoryCodes,
    accessory_names:       accessoryNames,
    render_base:           renderTechnique,
    render_base_note:      "Stage 1: text-to-image generates clothed scene (outfit + environment via prompt). " +
      "Stage 2: face-swap locks identity face onto the scene.",
    blueprint_environment: blueprint.environment,
    blueprint_camera:      blueprint.camera,
    blueprint_pose:        blueprint.pose,
    blueprint_expression:  blueprint.expression,
    composition_notes:     "Two-stage pipeline: text-to-image → face-swap identity lock.",
    scene_prompt_snippet:  scenePrompt.slice(0, 120) + "...",
  };

  const snapshot: GenerationSnapshot = {
    prompt: effectivePrompt,
    renderTechnique,
    inputAssets: {
      faceImageUrl: faceRes.data.image_url,
      ...(referenceImageUrl ? { referenceImageUrl } : {}),
    },
    identityContext: {
      identityId: masterIdentityId,
      identityCode: identity.identity_code,
      aprCode: identity.apr_code,
      aprName: identity.apr_name ?? faceRes.data.preset_name,
      btCode: identity.bt_code,
      btName: identity.bt_name ?? bodyRes.data.body_type_name,
    },
    dressContext: {
      dressId: dress.id,
      dressCode: dress.dress_code,
      dressName: dress.dress_name,
      dressDescription: dress.description,
      dressPromptFragment: dress.generation_prompt_fragment,
    },
    accessoryContext: resolvedAccessories.map(a => ({
      accessoryId: a.id,
      accessoryCode: a.accessory_code,
      accessoryName: a.accessory_name,
    })),
    roleContext: {
      roleBlueprintId,
      roleCode: blueprint.role_code,
      roleName: blueprint.role_name,
      environment: blueprint.environment as Record<string, string> | undefined,
      camera: blueprint.camera as Record<string, string> | undefined,
      pose: blueprint.pose as Record<string, string> | undefined,
      expression: blueprint.expression as Record<string, string> | undefined,
    },
    sceneContext: {
      imageCode,
      phase,
      sequence,
    },
    providerParameters: {
      imageSize: { width: 768, height: 1280 },
    },
    providerMetadata: {
      layerSnapshot,
      imageCode,
      roleCode,
      roleBlueprintId,
      phase,
      sequence,
      masterIdentityId,
      bodyAssetLayerId: bodyLayer.id,
      baseClothingLayerId: clothingLayer?.id ?? null,
      dressId: dress.id,
      accessoryIds,
    },
  };

  // ── Resolve provider config ───────────────────────────────────────────────
  const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
  if (!providerConfig) {
    return respond({ error: "No image provider configured. Add one in the Provider Configuration page." }, 422);
  }

  // ── Determine version ──────────────────────────────────────────────────────
  const currentVersion = await (async () => {
    const { data: existing } = await admin
      .from("role_image_library")
      .select("version")
      .eq("creator_id", creatorId)
      .eq("image_code", imageCode)
      .maybeSingle();
    return existing?.version ?? 0;
  })();

  // ── Create Generation record ──────────────────────────────────────────────
  const generationId = await createGeneration(admin, {
    creator_id: creatorId,
    asset_type: "image",
    asset_subtype: "role_image",
    business_ref_type: "role_image_library",
    business_ref_id: `${creatorId}:${imageCode}`,
    provider_id: providerConfig.id,
    provider_name: providerConfig.provider_name,
    provider_model: providerConfig.generation_endpoint || undefined,
    snapshot: snapshot as Record<string, unknown>,
    version: currentVersion + 1,
  });

  if (!generationId) {
    return respond({ error: "Failed to create generation record" }, 500);
  }

  // ── Mark slot as generating in business table ──────────────────────────────
  await admin.from("role_image_library").upsert({
    creator_id:             creatorId,
    image_code:             imageCode,
    role_blueprint_id:      roleBlueprintId,
    role_code:              roleCode,
    phase,
    sequence,
    version:                currentVersion + 1,
    master_ai_identity_id:  masterIdentityId,
    body_asset_layer_id:    bodyLayer.id,
    base_clothing_layer_id: clothingLayer?.id ?? null,
    dress_id:               dress.id,
    accessory_ids:          accessoryIds,
    generation_status:      "generating",
    error_message:          null,
    updated_at:             now,
    metadata:               layerSnapshot,
    generation_id:          generationId,
  }, { onConflict: "creator_id,image_code" });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 9 — Execute image worker
  // ══════════════════════════════════════════════════════════════════════════
  try {
    const result = await imageWorker.execute({
      generationId,
      snapshot,
      providerConfig,
    });

    if (result.status !== "completed") {
      // Generation failed — update business table with failure status
      // The Generation record and snapshot are preserved (not deleted)
      await admin.from("role_image_library").update({
        generation_status: "failed",
        error_message:     result.error ?? "Generation failed",
        updated_at:        new Date().toISOString(),
      }).eq("creator_id", creatorId).eq("image_code", imageCode);

      return respond({
        error:       "Image generation failed.",
        detail:      result.error ?? "Generation failed",
        image_code:  imageCode,
        step_failed: 9,
        generation_id: generationId,
        diagnosis: "The generation engine recorded this failure. The snapshot is preserved for retry. " +
          "Check the Provider Configuration page or try regenerating.",
      }, 500);
    }

    // ── Success: update business table with completed generation ────────────
    const finalMetadata = { ...layerSnapshot, generated_at: now };

    const { data: finalRecord } = await admin
      .from("role_image_library")
      .update({
        image_url:         result.outputUrl!,
        storage_path:      result.outputMetadata?.storagePath as string ?? null,
        generation_status: "generated",
        error_message:     null,
        updated_at:        new Date().toISOString(),
        metadata:          finalMetadata,
        generation_id:      generationId,
      })
      .eq("creator_id", creatorId)
      .eq("image_code", imageCode)
      .select()
      .maybeSingle();

    return respond({
      status:        "success",
      image_code:    imageCode,
      image_url:     result.outputUrl,
      version:       currentVersion + 1,
      generation_id: generationId,

      layer_snapshot: {
        step_1_identity: {
          id:   masterIdentityId,
          code: identity.identity_code,
        },
        step_2_body_asset: {
          id:   bodyLayer.id,
          code: bodyLayer.layer_code,
        },
        step_3_base_clothing: {
          id:   clothingLayer?.id ?? null,
          code: clothingLayer?.layer_code ?? null,
        },
        step_4_dress: {
          id:                  dress.id,
          code:                dress.dress_code,
          name:                dress.dress_name,
          layer_type:          "clothing_asset",
          asset_url_available: !!dress.image_url,
        },
        step_5_accessories: resolvedAccessories.map(a => ({
          id:   a.id,
          code: a.accessory_code,
          name: a.accessory_name,
        })),
        step_6_blueprint: {
          id:   roleBlueprintId,
          code: blueprint.role_code,
          name: blueprint.role_name,
        },
        step_7_pipeline: {
          stage_1: referenceImageUrl
            ? `reference_variation (reference: ${refConfig?.reference_code})`
            : "text_to_image (scene generation)",
          stage_2: "face_swap (identity lock)",
          reference_image: referenceImageUrl ?? null,
        },
      },

      render_base:      renderTechnique,
      render_base_note: layerSnapshot.render_base_note,

      record_id:    finalRecord?.id ?? null,
      storage_path: result.outputMetadata?.storagePath as string ?? null,
    });
  } catch (e) {
    const msg = (e as Error).message;

    // Update business table with failure
    await admin.from("role_image_library").update({
      generation_status: "failed",
      error_message:     msg,
      updated_at:        new Date().toISOString(),
    }).eq("creator_id", creatorId).eq("image_code", imageCode);

    return respond({
      error:       "Image generation failed.",
      detail:      msg,
      image_code:  imageCode,
      step_failed: 9,
      generation_id: generationId,
      diagnosis: "Unexpected error from the generation engine. The snapshot is preserved for retry.",
    }, 500);
  }
});
