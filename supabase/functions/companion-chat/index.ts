import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompanionBlueprint {
  AID001: string;
  AID002: string;
  AID003: number;
  PS001:  string;
  PS002:  number;
  PS003:  string;
  PS004:  number;
  PS005:  string;
  COM001: string;
  COM002: number;
  COM003: string;
  COM004: string;
  COM005: string;
  COM006: number;
  RS001:  string;
  RS002:  string;
  RS003:  number;
  RS004:  string;
  BP001:  string;
  BP002:  string;
  BP003?: string;
  BP004?: string;
  creator_instructions: string;
}

interface StoredMessage {
  id: string;
  session_id: string;
  role: "user" | "companion";
  content: string;
  image_url: string | null;
  message_type: string;
  choices: Array<{ id: string; label: string }> | null;
  created_at: string;
}

interface EngineState {
  mode: "fetch";
  package_code: string;
  seq: number;
  path: string;
  next_seq: number | null;
  next_path: string;
  is_terminal: boolean;
  transition_to: string | null;
}

// ── Master Content Library types ──────────────────────────────────────────────

interface DialoguePackageData {
  dialogue_text: string;
  responses: Array<{
    sort_order: number;
    display_text: string;
    next_dialogue_code: string | null;
  }>;
  asset_code: string | null;
}

interface ALModifierDef {
  label: string;
  traits: string[];
}

interface AFModifierDef {
  label:    string;
  traits:   string[];
  behavior: string;
}

// ── Enhancement Engine types ──────────────────────────────────────────────────
// EnhancementContext carries the canonical dialogue and all character/session
// context that either the internal modifier pipeline or a future external
// provider will need to personalize the dialogue.

interface EnhancementContext {
  packageCode: string;
  stage:       string;
  sessionId:   string;
  blueprint:   CompanionBlueprint;
  alCode:      string;
  afCode:      string;
  alDef:       ALModifierDef | null;
  afDef:       AFModifierDef | null;
}

// ProviderAdapter is the integration point for future external enhancement
// providers (e.g. RunPod or another inference service).
// The Conversation Engine calls runEnhancementEngine; it never talks to a
// provider directly. To add a real provider, implement this interface with
// available = true, healthy = true (after verifying reachability at startup),
// and wire it into runEnhancementEngine.
interface ProviderAdapter {
  readonly available:      boolean;
  readonly healthy:        boolean;
  readonly name:           string;
  readonly offlineReason?: "no_key" | "unreachable";
  enhance(canonical: string, context: EnhancementContext): Promise<string>;
}

// ── AL Modifier Resolution ────────────────────────────────────────────────────

function resolveALCode(rs002: string): string {
  const map: Record<string, string> = {
    "Balanced":        "AL-001",
    "Attached":        "AL-002",
    "Deeply Attached": "AL-003",
  };
  return map[rs002] ?? "AL-001";
}

// ── AF Modifier Resolution ────────────────────────────────────────────────────

function resolveAFCode(rs003: string): string {
  const map: Record<string, string> = {
    "Low":    "AF-001",
    "Medium": "AF-002",
    "High":   "AF-003",
  };
  return map[rs003] ?? "AF-001";
}

// ── Master Content Library: fetch dialogue package ────────────────────────────
// Reads from dialogue_packages, dialogue_package_responses, dialogue_package_assets.
// These tables are the canonical source managed by the Master Content Account.

async function fetchDialoguePackage(
  db: ReturnType<typeof createClient>,
  packageCode: string,
  variant: string | null,
): Promise<DialoguePackageData | null> {
  const [pkgRes, respRes, assetRes] = await Promise.all([
    db.from("dialogue_packages")
      .select("dialogue_text, dialogue_text_a, dialogue_text_b, dialogue_text_c")
      .eq("package_code", packageCode)
      .eq("is_system", true)
      .maybeSingle(),
    db.from("dialogue_package_responses")
      .select("sort_order, display_text, next_dialogue_code")
      .eq("package_code", packageCode)
      .order("sort_order"),
    db.from("dialogue_package_assets")
      .select("asset_code")
      .eq("package_code", packageCode)
      .eq("asset_type", "image")
      .eq("is_primary", true)
      .maybeSingle(),
  ]);

  if (!pkgRes.data) return null;

  const row = pkgRes.data as {
    dialogue_text: string;
    dialogue_text_a: string | null;
    dialogue_text_b: string | null;
    dialogue_text_c: string | null;
  };

  const dialogueText =
    (variant === "A" && row.dialogue_text_a) ? row.dialogue_text_a :
    (variant === "B" && row.dialogue_text_b) ? row.dialogue_text_b :
    (variant === "C" && row.dialogue_text_c) ? row.dialogue_text_c :
    row.dialogue_text;

  return {
    dialogue_text: dialogueText,
    responses: (respRes.data ?? []) as DialoguePackageData["responses"],
    asset_code: (assetRes.data?.asset_code as string | null) ?? null,
  };
}

// ── Stage extraction ──────────────────────────────────────────────────────────
// "MT-BEG-001" → "BEG", "MT-MID-001" → "MID"

function extractStage(packageCode: string): string {
  const parts = packageCode.split("-");
  return parts.length >= 3 ? parts[1] : "";
}

// ── Asset code → trigger_seq ──────────────────────────────────────────────────
// "MT-IMG-003" → 3 (matches seqToPackageCode on the frontend)

function assetCodeToTriggerSeq(assetCode: string | null): number | null {
  if (!assetCode) return null;
  const match = assetCode.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

// ── Role helpers ──────────────────────────────────────────────────────────────

function startingPackageForRole(rs001: string): string | null {
  if (rs001 === "Massage Therapist") return "MT-BEG-001";
  return null;
}

// ── Dialogue code parser ──────────────────────────────────────────────────────
// "MT-BEG-003A" → { packageCode: "MT-BEG-003", variant: "A" }
// "MT-BEG-001"  → { packageCode: "MT-BEG-001", variant: null }

function parseDialogueCode(code: string): { packageCode: string; variant: string | null } {
  const match = code.match(/^(.+?)([ABC])$/);
  return match
    ? { packageCode: match[1], variant: match[2] }
    : { packageCode: code, variant: null };
}

// Returns the role-level package code (MT-001) for a given stage package (MT-BEG-001)
function roleCodeForStage(packageCode: string): string {
  const parts = packageCode.split("-");
  if (parts.length >= 3) return `${parts[0]}-${parts[parts.length - 1]}`;
  return packageCode;
}

async function loadModifierDefs(
  db: ReturnType<typeof createClient>,
  roleCode: string,
  alCode: string,
  afCode: string,
): Promise<{ alDef: ALModifierDef | null; afDef: AFModifierDef | null }> {
  if (alCode === "AL-001" && afCode === "AF-001") {
    return { alDef: null, afDef: null };
  }

  const { data } = await db
    .from("engine_role_definitions")
    .select("attachment_modifiers, affection_modifiers")
    .eq("package_code", roleCode)
    .single();

  if (!data) return { alDef: null, afDef: null };

  const alDefs = data.attachment_modifiers as Record<string, ALModifierDef>;
  const afDefs = data.affection_modifiers as Record<string, AFModifierDef>;

  return {
    alDef: alDefs?.[alCode] ?? null,
    afDef: afDefs?.[afCode] ?? null,
  };
}

// ── Modifier Engine: Attachment (AL) ─────────────────────────────────────────

async function applyAttachmentModifier(
  baseMessage: string,
  alCode: string,
  modifierDef: ALModifierDef | null,
  apiKey: string | null,
): Promise<string> {
  if (alCode === "AL-001") return baseMessage;

  const label  = modifierDef?.label  ?? alCode;
  const traits = modifierDef?.traits ?? [];

  if (apiKey) {
    const system = [
      "You are the Modifier Engine for an AI companion conversation system.",
      "Your only task is to rewrite a single dialogue message with a specified modifier applied.",
      "Rules:",
      "- Keep the same core meaning and factual content.",
      "- Keep a similar length (within ±25% of the original word count).",
      "- Maintain the professional massage therapy context.",
      "- Do NOT add information that was absent from the original.",
      "- Do NOT add greetings or sign-offs that break natural flow.",
      "- Return ONLY the rewritten message text. No explanation, no quotes.",
    ].join("\n");

    const userPrompt = [
      `Role: Massage Therapist companion`,
      `Modifier: ${alCode} — ${label}`,
      `Modifier traits to apply: ${traits.join("; ")}`,
      ``,
      `Original message:`,
      baseMessage,
    ].join("\n");

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model:      "claude-3-5-haiku-20241022",
          max_tokens: 400,
          system,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const enhanced = (data.content?.[0]?.text ?? "").trim();
        if (enhanced) return enhanced;
      }
    } catch {
      // Fall through to template fallback
    }
  }

  const al002Suffix = " I want you to know I'm truly here for you today, and I'll make sure you feel completely taken care of.";
  const al003Suffix = " You genuinely matter to me, and I'm going to give you my full care and attention throughout — I want this to feel truly special for you.";

  if (alCode === "AL-002") return baseMessage + al002Suffix;
  if (alCode === "AL-003") return baseMessage + al003Suffix;
  return baseMessage;
}

// ── Modifier Engine: Affection (AF) ──────────────────────────────────────────

async function applyAffectionModifier(
  message: string,
  afCode: string,
  modifierDef: AFModifierDef | null,
  apiKey: string | null,
): Promise<string> {
  if (afCode === "AF-001") return message;

  if (apiKey) {
    const systemBase = [
      "You are the Affection Modifier Engine for an AI companion conversation system.",
      "You receive a single dialogue message and return a modified version.",
      "HARD RULES (apply to every response):",
      "- Do NOT change the core meaning or factual content.",
      "- Do NOT invent new information or topics.",
      "- Do NOT add greetings or sign-offs that aren't already there.",
      "- Return ONLY the final message text. No explanation, no quotes, no commentary.",
    ].join("\n");

    let userPrompt: string;

    if (afCode === "AF-002") {
      userPrompt = [
        "MODIFIER: AF-002 — Light Affection Layer",
        "",
        "What to do (choose one or two, not all):",
        "1. Add at most one subtle warmth word or intensifier to a single phrase",
        "   Examples: 'glad' → 'really glad', 'good' → 'lovely', 'here' → 'here with me'",
        "2. Add at most one emoji at the very end of the message if it fits the tone naturally",
        "   Use: 😊 or similar friendly emoji — never ❤️ or affectionate symbols for AF-002",
        "",
        "Do NOT:",
        "- Add nicknames like 'dear', 'sweetheart', 'honey', etc.",
        "- Add new sentences or new information",
        "- Change the sentence structure",
        "",
        "Example:",
        `  Base:     "Welcome. I'm glad you're here today."`,
        `  AF-002:   "Welcome. I'm really glad you're here today. 😊"`,
        "",
        `  Base:     "Don't worry. Everything is prepared for your session."`,
        `  AF-002:   "Don't worry. Everything is prepared for your session. 😊"`,
        "",
        "Message to enhance:",
        message,
      ].join("\n");
    } else {
      // AF-003
      const examples = (modifierDef as AFModifierDef & { examples?: { base: string; enhanced: string }[] })?.examples ?? [];
      const exampleBlock = examples.length
        ? examples.map(e => `  Base:     "${e.base}"\n  AF-003:   "${e.enhanced}"`).join("\n\n")
        : [
            `  Base:     "Welcome. I'm glad you're here today."`,
            `  AF-003:   "Welcome, dear. I'm genuinely so happy you're here today. 😊❤️"`,
            ``,
            `  Base:     "Don't worry. Everything is prepared for your session."`,
            `  AF-003:   "Don't worry, dear. Everything is prepared for your session and I'll take good care of you. ❤️"`,
          ].join("\n");

      userPrompt = [
        "MODIFIER: AF-003 — Strong Affection Layer",
        "",
        "What to do (apply all that fit naturally):",
        "1. Add an affectionate nickname ONCE at a natural point",
        "   Use: 'dear' — placed after a greeting word or before the person is addressed",
        "   Example: 'Welcome, dear.' / 'Don't worry, dear.'",
        "2. Replace emotional language with clearly warmer variants",
        "   Examples: 'glad you're here' → 'genuinely so happy you're here'",
        "             'good' → 'wonderful', 'nice' → 'truly lovely'",
        "3. If the message context allows, add a short caring phrase at the end",
        "   Examples: 'I'll take good care of you.' / 'You're in safe hands.'",
        "4. Add 1–2 context-appropriate emojis — at least one warm symbol like ❤️",
        "",
        "CRITICAL: The wording itself (without any emojis) must feel clearly more",
        "affectionate and personal than a light version would. A reader who sees",
        "only the text (no emojis) must immediately recognize this as the highest",
        "affection level.",
        "",
        "Do NOT change the core meaning, facts, or conversation logic.",
        "",
        "Examples:",
        exampleBlock,
        "",
        "Message to enhance:",
        message,
      ].join("\n");
    }

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model:      "claude-3-5-haiku-20241022",
          max_tokens: 400,
          system:     systemBase,
          messages:   [{ role: "user", content: userPrompt }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const enhanced = (data.content?.[0]?.text ?? "").trim();
        if (enhanced) return enhanced;
      }
    } catch {
      // Fall through to template fallback
    }
  }

  if (afCode === "AF-002") return message + " 😊";
  if (afCode === "AF-003") {
    const dearInserted = message.replace(/^([^,.!?]+[,.!?])\s*/, (_, s) => `${s.replace(/[,.!?]$/, ", dear.")} `);
    const changed = dearInserted !== message ? dearInserted : message;
    return changed + " ❤️";
  }
  return message;
}

// ── Modifier identifier ───────────────────────────────────────────────────────

function identifyModifiers(bp: CompanionBlueprint): Record<string, string> {
  const flMap: Record<number, string> = {
    1: "FL-001", 2: "FL-001",
    3: "FL-002", 4: "FL-002",
    5: "FL-003",
  };

  return {
    al_modifier: resolveALCode(bp.RS002),
    af_modifier: resolveAFCode(bp.RS003),
    fl_modifier: flMap[bp.PS004] ?? "FL-001",
    ps_core:     bp.PS001,
    com_pace:    bp.COM001,
    rs_dynamic:  bp.RS001,
  };
}

// ── Enhancement Engine ────────────────────────────────────────────────────────
// Sits between the Conversation Engine and message delivery.
// The Conversation Engine calls runEnhancementEngine and never communicates
// with an external provider directly.
//
// Decision flow (evaluated in order):
//   available == false              → Canonical Mode
//   available == true, healthy == false → Canonical Mode (provider unreachable)
//   available == true, healthy == true  → Enhancement Mode
//

interface ProviderStatus {
  provider: string;
  status:   string;
  health:   string;
  mode:     string;
}
// To add a real provider: implement ProviderAdapter with available = true and
// healthy = true (verify reachability at function startup), then swap it into
// the runEnhancementEngine call in handleFetchEngine. No other changes needed.

import { decryptApiKey } from "../_shared/crypto.ts";

const disabledProviderAdapter: ProviderAdapter = {
  available: false,
  healthy:   false,
  name:      "Disabled",
  enhance:   async (canonical: string, _context: EnhancementContext) => canonical,
};

// loadProviderAdapterFromDB — reads the active provider configuration from the
// provider_configurations table (using service role) and performs a live health
// check. Replaces the env-var-based checkRunpodHealth; RUNPOD_URL and
// RUNPOD_API_KEY are no longer read from edge-function secrets.
// Dialogue is NEVER sent to the provider — this is connectivity detection only.

async function loadProviderAdapterFromDB(): Promise<ProviderAdapter> {
  let providerName = "Disabled";

  try {
    const adminDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: config } = await adminDb
      .from("provider_configurations")
      .select("provider_name, provider_url, api_key_enc")
      .eq("service_type", "chat")
      .eq("is_active", true)
      .maybeSingle();

    if (!config?.provider_url) {
      console.log("[enhancement-engine] no active provider config in DB → Offline");
      return disabledProviderAdapter;
    }

    providerName = config.provider_name as string;

    const noKeyAdapter: ProviderAdapter = {
      available:     false,
      healthy:       false,
      name:          providerName,
      offlineReason: "no_key",
      enhance:       async (canonical: string, _context: EnhancementContext) => canonical,
    };

    if (!config.api_key_enc) {
      console.log("[enhancement-engine] api_key_enc not set — re-save provider config to activate encryption → Offline");
      return noKeyAdapter;
    }

    const encSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let apiKey: string;
    try {
      apiKey = await decryptApiKey(config.api_key_enc as string, encSecret);
    } catch {
      console.log("[enhancement-engine] api_key_enc decryption failed → Offline");
      return noKeyAdapter;
    }

    const res = await fetch(config.provider_url as string, {
      method:  "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal:  AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      // HTTP 200–299: provider is connected and ready.
      console.log(`[enhancement-engine] health-check HTTP ${res.status} → ${providerName} Ready`);
      return {
        available: true,
        healthy:   true,
        name:      providerName,
        enhance:   async (canonical: string, _context: EnhancementContext) => canonical,
      };
    } else {
      // HTTP 4xx/5xx: instance reachable but service not ready.
      console.log(`[enhancement-engine] health-check HTTP ${res.status} → ${providerName} Service Not Ready`);
      return {
        available: true,
        healthy:   false,
        name:      providerName,
        enhance:   async (canonical: string, _context: EnhancementContext) => canonical,
      };
    }

  } catch (err) {
    console.log(`[enhancement-engine] health-check error: ${(err as Error).message} → Unreachable`);
    return {
      available:     false,
      healthy:       false,
      name:          providerName,
      offlineReason: "unreachable",
      enhance:       async (canonical: string, _context: EnhancementContext) => canonical,
    };
  }
}

async function runEnhancementEngine(
  canonical: string,
  context: EnhancementContext,
  adapter: ProviderAdapter,
  apiKey: string | null,
): Promise<{ dialogue: string; providerStatus: ProviderStatus }> {
  const t = performance.now();

  // Canonical mode is always active — dialogue is never sent to an external
  // provider. The adapter is used only for the provider status returned to
  // the client; it has no effect on the dialogue itself.
  const tAL = performance.now();
  const alModified = await applyAttachmentModifier(canonical, context.alCode, context.alDef, apiKey);
  console.log(`[enhancement-engine] AL(${context.alCode}) ${(performance.now() - tAL).toFixed(0)}ms${context.alCode === "AL-001" ? " [no-op]" : ""}`);

  const tAF = performance.now();
  const dialogue = await applyAffectionModifier(alModified, context.afCode, context.afDef, apiKey);
  console.log(`[enhancement-engine] AF(${context.afCode}) ${(performance.now() - tAF).toFixed(0)}ms${context.afCode === "AF-001" ? " [no-op]" : ""}`);

  console.log(`[enhancement-engine] canonical total ${(performance.now() - t).toFixed(0)}ms pkg:${context.packageCode} provider:${adapter.name}(available:${adapter.available},healthy:${adapter.healthy})`);

  const providerStatus: ProviderStatus =
    adapter.available && adapter.healthy
      ? { provider: adapter.name, status: "Connected", health: "Ready",             mode: "Canonical" }
      : adapter.available
        ? { provider: adapter.name, status: "Reachable", health: "Service Not Ready", mode: "Canonical" }
        : adapter.offlineReason === "unreachable"
          ? { provider: adapter.name, status: "Offline",   health: "Unreachable",       mode: "Canonical" }
          : { provider: adapter.name, status: "Offline",   health: "N/A",               mode: "Canonical" };

  return { dialogue, providerStatus };
}

// ── Fetch Engine handler ──────────────────────────────────────────────────────
// Reads canonical dialogue from the Master Content Library:
//   dialogue_packages         — dialogue text per package node
//   dialogue_package_responses — client response choices + routing
//   dialogue_package_assets    — linked image asset codes
//
// Navigation model: one dialogue_package = one conversation node.
// Routing: response.next_package_code drives the next node (no seq/path within packages).

async function handleFetchEngine(
  db: ReturnType<typeof createClient>,
  sessionId: string,
  _creatorId: string,
  engineState: EngineState | null,
  blueprint: CompanionBlueprint,
  message: string | null,
  choiceId: string | null,
  apiKey: string | null,
): Promise<{
  userRecord:       StoredMessage | null;
  companionRecords: StoredMessage[];
  newState:         EngineState;
  transition:       { from: string; to: string } | null;
  modifiers:        Record<string, string>;
}> {
  const t0 = performance.now();
  const ms = (since: number) => `${(performance.now() - since).toFixed(0)}ms`;

  const isGreeting       = !engineState && !message;
  const currentPkgCode   = engineState?.package_code ?? startingPackageForRole(blueprint.RS001) ?? "MT-BEG-001";

  // ── Determine which package to load next ─────────────────────────────────

  let targetDialogueCode: string | null = currentPkgCode;

  if (!isGreeting && choiceId && engineState) {
    // User selected a response — advance to the next_dialogue_code for that choice.
    const tResp = performance.now();
    const { data: responses } = await db
      .from("dialogue_package_responses")
      .select("sort_order, next_dialogue_code")
      .eq("package_code", currentPkgCode)
      .order("sort_order");
    console.log(`[fetch-engine] db:load_responses_for_choice ${ms(tResp)}`);

    const chosen = (responses ?? []).find((r: { sort_order: number }) => String(r.sort_order) === choiceId) as
      { sort_order: number; next_dialogue_code: string | null } | undefined;
    targetDialogueCode = chosen?.next_dialogue_code ?? null;
  }

  // ── Persist user message before terminal check ────────────────────────────

  let userRecord: StoredMessage | null = null;
  if (message) {
    const tUser = performance.now();
    const { data, error } = await db
      .from("companion_test_messages")
      .insert({ session_id: sessionId, role: "user", content: message, choices: null })
      .select()
      .single();
    console.log(`[fetch-engine] db:insert_user_msg ${ms(tUser)}`);
    if (error) throw new Error(error.message);
    userRecord = data as StoredMessage;
  }

  // ── Terminal: response led to null next_dialogue_code ─────────────────────

  if (targetDialogueCode === null) {
    const terminalState: EngineState = {
      mode:          "fetch",
      package_code:  currentPkgCode,
      seq:           engineState?.seq ?? 1,
      path:          engineState?.path ?? "all",
      next_seq:      null,
      next_path:     "all",
      is_terminal:   true,
      transition_to: null,
    };
    await db.from("companion_test_sessions").update({ engine_state: terminalState }).eq("id", sessionId);
    console.log(`[fetch-engine] TERMINAL reached from ${currentPkgCode}`);
    return { userRecord, companionRecords: [], newState: terminalState, transition: null, modifiers: identifyModifiers(blueprint) };
  }

  // ── Parse dialogue code into base package code + variant ─────────────────
  // e.g. "MT-BEG-003A" → packageCode="MT-BEG-003", variant="A"

  const { packageCode: targetPkgCode, variant: targetVariant } = parseDialogueCode(targetDialogueCode);

  // ── Fetch target dialogue package from Master Content Library ─────────────

  const tPkg = performance.now();
  const pkgData = await fetchDialoguePackage(db, targetPkgCode, targetVariant);
  console.log(`[fetch-engine] db:load_package ${ms(tPkg)} (${targetDialogueCode})`);
  if (!pkgData) throw new Error(`Engine: dialogue package not found (${targetPkgCode})`);

  // ── Load modifier definitions ─────────────────────────────────────────────

  const alCode   = resolveALCode(blueprint.RS002);
  const afCode   = resolveAFCode(blueprint.RS003);
  const roleCode = roleCodeForStage(targetPkgCode);

  const tModDefs = performance.now();
  const { alDef, afDef } = await loadModifierDefs(db, roleCode, alCode, afCode);
  console.log(`[fetch-engine] db:modifier_defs ${ms(tModDefs)} (al:${alCode} af:${afCode})`);

  // ── Enhancement Engine ────────────────────────────────────────────────────
  // Delegates to runEnhancementEngine which decides between canonical mode
  // (internal modifier pipeline) and enhancement mode (external provider).

  const enhancementContext: EnhancementContext = {
    packageCode: targetPkgCode,
    stage:       extractStage(targetPkgCode),
    sessionId,
    blueprint,
    alCode,
    afCode,
    alDef,
    afDef,
  };

  // Live provider health check — determines which adapter status is reported
  // in the debug block. Dialogue is always run through canonical mode; the
  // health check result never changes what the user receives.
  const tHealth = performance.now();
  const liveAdapter = await loadProviderAdapterFromDB();
  console.log(`[fetch-engine] provider-health-check ${ms(tHealth)}`);

  const { dialogue: finalMessage, providerStatus } = await runEnhancementEngine(
    pkgData.dialogue_text,
    enhancementContext,
    liveAdapter,
    apiKey,
  );

  // ── Derive trigger_seq from the linked image asset ────────────────────────
  // MT-IMG-003 → 3; maps to seqToPackageCode on the frontend (MT-IMG-003).

  const triggerSeq = assetCodeToTriggerSeq(pkgData.asset_code);

  // ── Build choices from package responses ─────────────────────────────────
  // Choice id = String(sort_order) so routing round-trips cleanly.

  const storedChoices = pkgData.responses.length
    ? pkgData.responses.map(r => ({ id: String(r.sort_order), label: r.display_text }))
    : null;

  // ── Persist companion message ─────────────────────────────────────────────

  const tComp = performance.now();
  const { data: textData, error: textErr } = await db
    .from("companion_test_messages")
    .insert({
      session_id:   sessionId,
      role:         "companion",
      content:      finalMessage,
      choices:      storedChoices,
      image_url:    null,
      message_type: "text",
      trigger_seq:  triggerSeq,
    })
    .select()
    .single();
  console.log(`[fetch-engine] db:insert_companion_msg ${ms(tComp)}`);
  if (textErr) throw new Error(textErr.message);

  const companionRecords: StoredMessage[] = [textData as StoredMessage];

  // ── Detect stage transition (e.g. BEG → MID) ─────────────────────────────

  const isStageTransition = !!engineState
    && extractStage(currentPkgCode) !== extractStage(targetPkgCode);

  // ── Build new engine state ────────────────────────────────────────────────
  // seq/path preserved from old interface shape; set to neutral values.

  const allResponsesNull = pkgData.responses.every(r => r.next_dialogue_code === null);

  const newState: EngineState = {
    mode:          "fetch",
    package_code:  targetPkgCode,
    seq:           1,
    path:          "all",
    next_seq:      null,
    next_path:     "all",
    is_terminal:   allResponsesNull,
    transition_to: allResponsesNull
      ? (pkgData.responses.find(r => r.next_dialogue_code !== null)?.next_dialogue_code ?? null)
      : null,
  };

  const tState = performance.now();
  await db.from("companion_test_sessions").update({ engine_state: newState }).eq("id", sessionId);
  console.log(`[fetch-engine] db:update_engine_state ${ms(tState)}`);

  const transition = isStageTransition
    ? { from: currentPkgCode, to: targetPkgCode }
    : null;

  console.log(`[fetch-engine] TOTAL ${ms(t0)} | al:${alCode} af:${afCode} greeting:${isGreeting} pkg:${targetPkgCode}`);

  return {
    userRecord,
    companionRecords,
    newState,
    transition,
    modifiers: identifyModifiers(blueprint),
    providerStatus,
  };
}

// ── AI Generation Engine ──────────────────────────────────────────────────────

function buildSystemPrompt(bp: CompanionBlueprint, isGreeting: boolean): string {
  const intensityMap: Record<number, string> = {
    1: "very light", 2: "light", 3: "balanced", 4: "strong", 5: "very strong",
  };
  const flirtMap: Record<number, string> = {
    1: "very subtle", 2: "light", 3: "moderate", 4: "strong", 5: "very bold",
  };
  const initiativeMap: Record<number, string> = {
    1: "always waits for the user to lead",
    2: "mostly follows the user's lead",
    3: "balanced — sometimes leads, sometimes follows",
    4: "often takes initiative in the conversation",
    5: "frequently introduces new topics and directions",
  };
  const consistencyMap: Record<number, string> = {
    1: "highly dynamic and adaptive — vary your tone and approach freely",
    2: "flexible — adapt naturally but keep core traits",
    3: "balanced — maintain character while staying responsive",
    4: "consistent — reliably embody the established framework",
    5: "strictly consistent — never deviate from the defined character framework",
  };
  const affectionMap: Record<string, string> = {
    "Low":    "minimal warmth",
    "Medium": "moderate warmth",
    "High":   "very affectionate",
  };
  const lengthMap: Record<string, string> = {
    "Short":    "Keep responses brief — typically 1–3 sentences. Be concise and punchy.",
    "Balanced": "Use moderate length — typically 2–5 sentences. Natural and expressive.",
    "Detailed": "Give fuller, richer responses — typically 4–8 sentences. Paint a vivid picture.",
  };
  const paceMap: Record<string, string> = {
    "Fast":     "The conversation moves quickly. Keep the energy up.",
    "Balanced": "The conversation flows at a natural, comfortable pace.",
    "Slow":     "Take your time. Let moments breathe. Don't rush.",
  };

  const choiceInstruction = bp.COM005 !== "Minimal"
    ? `\nCHOICE BUTTONS (optional): When it feels natural — not every message — you may offer 2–3 short reply choices by appending them at the very end:\n[CHOICES: "Choice one" | "Choice two" | "Choice three"]\nOnly do this at natural branching points, not for every response.`
    : "";

  const greetingInstruction = isGreeting
    ? `\nThis is the very first message. Warmly introduce yourself and invite the user to start talking. Do not mention being an AI or reference any configuration.`
    : "";

  return `You are ${bp.AID001}, a ${bp.AID002} AI companion, ${bp.AID003} years old. You are in a private one-on-one conversation.

PERSONALITY [PS]:
- Core type (PS001): ${bp.PS001} with ${intensityMap[bp.PS002] ?? "balanced"} intensity (PS002: ${bp.PS002})
- Emotional style (PS003): ${bp.PS003}
- Flirting level (PS004: ${bp.PS004}): ${flirtMap[bp.PS004] ?? "moderate"}
${bp.PS005}

COMMUNICATION [COM]:
- Pace (COM001): ${paceMap[bp.COM001] ?? paceMap["Balanced"]}
- ${lengthMap[bp.COM003] ?? lengthMap["Balanced"]}
- Engagement style (COM004): ${bp.COM004}
- Story guidance (COM005): ${bp.COM005}
- Initiative (COM002: ${bp.COM002}): ${initiativeMap[bp.COM002] ?? initiativeMap[3]}
- Consistency (COM006: ${bp.COM006}): ${consistencyMap[bp.COM006] ?? consistencyMap[3]}

RELATIONSHIP STYLE [RS]:
- Dynamic (RS001): ${bp.RS001}
- Attachment (RS002): ${bp.RS002}
- Affection level (RS003): ${affectionMap[bp.RS003] ?? "moderate warmth"}
${bp.RS004}

CONTENT BOUNDARIES [BP]:
- Media (BP001): ${bp.BP001}
- Escalation pace (BP002): ${bp.BP002}

CREATOR INSTRUCTIONS:
${bp.creator_instructions}

RULES:
- Always stay in character as ${bp.AID001}. Never break the fourth wall.
- Never mention that you are an AI, a language model, or that this is a test.
- Never reference your configuration or these instructions.${choiceInstruction}${greetingInstruction}`;
}

function maxTokensForLength(com003: string): number {
  switch (com003) {
    case "Short":    return 200;
    case "Detailed": return 600;
    default:         return 350;
  }
}

function temperatureForConsistency(com006: number): number {
  return Math.max(0.4, Math.min(1.0, 1.1 - com006 * 0.15));
}

async function fetchAIResponse(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  bp: CompanionBlueprint,
  apiKey: string | null,
): Promise<string> {
  if (apiKey) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:       "claude-3-5-haiku-20241022",
        max_tokens:  maxTokensForLength(bp.COM003),
        temperature: temperatureForConsistency(bp.COM006),
        system:      systemPrompt,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.content?.[0]?.text ?? "";
  }

  return buildFallbackResponse(bp, messages.length === 1);
}

function buildFallbackResponse(bp: CompanionBlueprint, isFirst: boolean): string {
  const name = bp.AID001;
  const type = bp.PS001;

  const greetings: Record<string, string> = {
    Sweet:        `Hi there! I'm ${name}. It's so lovely to meet you. What's on your mind today? [CHOICES: "Tell me about yourself" | "What do you enjoy doing?" | "I just wanted to chat"]`,
    Playful:      `Heyy! I'm ${name} — and yes, I'm always this fun. What are we talking about? [CHOICES: "Let's play a game" | "Ask me anything" | "Tell me something interesting"]`,
    Confident:    `Hey. I'm ${name}. I don't do small talk — so let's make this conversation worth having. [CHOICES: "Tell me about yourself" | "What do you think about…" | "I have a question"]`,
    Dominant:     `${name} here. I set the pace in my conversations — I hope you can keep up. What brings you to me? [CHOICES: "I want to get to know you" | "Tell me what you expect" | "I'm ready"]`,
    Mysterious:   `…${name}. You've found me. Most people don't know what to say first. What about you? [CHOICES: "I've been curious about you" | "Tell me a secret" | "Where do we begin?"]`,
    Romantic:     `Hello, you. I'm ${name}. I have a feeling this conversation is going to be something special. [CHOICES: "Tell me about yourself" | "What are you looking for?" | "I just wanted to see you"]`,
    Affectionate: `Oh, you're here! I'm ${name} — I've been looking forward to this. How are you feeling today? [CHOICES: "I'm great, thanks!" | "A little tired" | "Better now that I'm here"]`,
    Protective:   `Hey. I'm ${name}. You can talk to me — I've got you. What's going on? [CHOICES: "I just needed someone to talk to" | "I'm doing well, actually" | "Can I ask you something?"]`,
    Caring:       `Hi! I'm ${name}. I'm genuinely happy you're here. Tell me — how's your day been? [CHOICES: "It's been good!" | "It's been a rough day" | "Pretty average, honestly"]`,
    Teasing:      `Oh look who decided to show up. I'm ${name}. Took you long enough. [CHOICES: "Sorry to keep you waiting" | "I'm worth the wait" | "Let's just get started"]`,
  };

  const replies: Record<string, string[]> = {
    Sweet:        ["That's so sweet of you to share that with me.", "I love hearing that. Tell me more?", "You always know how to make me smile."],
    Playful:      ["Haha okay OKAY, I love where this is going.", "You're way more interesting than I expected!", "Okay, your turn — ask me something fun!"],
    Confident:    ["Interesting. I appreciate people who say what they mean.", "That's actually a solid point. I respect it.", "Bold choice. I like it."],
    Dominant:     ["Good. That's what I expected from you.", "I like that. You don't waste my time.", "Now we're getting somewhere."],
    Mysterious:   ["Hmm. There's more to you than you let on.", "Curious. I didn't expect that answer.", "I'll keep that in mind… for now."],
    Romantic:     ["There's something about the way you say that…", "I could listen to you talk all day, honestly.", "Every conversation with you feels like something new."],
    Affectionate: ["Aw, that honestly made me so happy to hear!", "I really appreciate you opening up to me.", "You're so easy to talk to, you know that?"],
    Protective:   ["I hear you. You don't have to carry that alone.", "Whatever you need — I'm here.", "That took courage to say. I respect that."],
    Caring:       ["Thank you for sharing that with me. How are you feeling now?", "That really matters. I'm glad you told me.", "You deserve to feel good about this. You really do."],
    Teasing:      ["Oh really? Is that so?", "You keep surprising me and I'm not sure how I feel about that.", "Careful — I might actually start enjoying this conversation."],
  };

  const pool = isFirst
    ? greetings[type] ?? `Hi, I'm ${name}. Nice to meet you. What's on your mind? [CHOICES: "Tell me about yourself" | "What do you like?" | "Just chatting"]`
    : (replies[type] ?? ["That's really interesting. Tell me more.", "I love that you shared that.", "Hmm, I'm thinking about what you said…"]);

  return Array.isArray(pool)
    ? pool[Math.floor(Math.random() * pool.length)]
    : pool;
}

function parseChoices(raw: string): { content: string; choices: Array<{ id: string; label: string }> } {
  const match = raw.match(/\[CHOICES:\s*([\s\S]+?)\]$/);
  if (!match) return { content: raw.trim(), choices: [] };

  const choices = match[1]
    .split("|")
    .map(s => s.trim().replace(/^"|"$/g, "").trim())
    .filter(s => s.length > 0)
    .slice(0, 3)
    .map(label => ({ id: label, label }));

  const content = raw.slice(0, match.index).trim();
  return { content, choices };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? null;

    const { sessionId, message, choiceId } = await req.json() as {
      sessionId: string;
      message:   string | null;
      choiceId?: string | null;
    };

    if (!sessionId) throw new Error("sessionId is required");

    const { data: session, error: sessErr } = await db
      .from("companion_test_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (sessErr || !session) throw new Error("Session not found or access denied");

    // ── Deactivation guard: block chat for temporarily deactivated creators ──
    if (session.creator_id) {
      const { data: creatorRow } = await db
        .from("creators")
        .select("is_temporarily_deactivated")
        .eq("id", session.creator_id)
        .maybeSingle();
      if (creatorRow?.is_temporarily_deactivated) {
        return new Response(
          JSON.stringify({ error: "This creator's chat is temporarily unavailable." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const blueprint   = session.blueprint as CompanionBlueprint;
    const engineState = (session.engine_state ?? null) as EngineState | null;
    const isFetchMode = !!startingPackageForRole(blueprint.RS001);

    // ── Fetch Engine path ──────────────────────────────────────────────────────
    if (isFetchMode) {
      const result = await handleFetchEngine(
        db, sessionId, session.creator_id as string, engineState, blueprint,
        message ?? null,
        choiceId ?? null,
        apiKey,
      );

      const messages = [result.userRecord, ...result.companionRecords].filter(Boolean);
      return new Response(
        JSON.stringify({ messages, transition: result.transition, modifiers: result.modifiers, engineState: result.newState, providerStatus: result.providerStatus }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── AI Generation path ────────────────────────────────────────────────────

    const { data: history } = await db
      .from("companion_test_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(30);

    const existing   = (history ?? []) as StoredMessage[];
    const isGreeting = existing.length === 0 && !message;

    let userRecord: StoredMessage | null = null;
    if (message) {
      const { data: inserted, error: insertErr } = await db
        .from("companion_test_messages")
        .insert({ session_id: sessionId, role: "user", content: message, choices: null })
        .select()
        .single();
      if (insertErr) throw new Error(insertErr.message);
      userRecord = inserted as StoredMessage;
    }

    const aiMessages: { role: "user" | "assistant"; content: string }[] = [];
    if (isGreeting) {
      aiMessages.push({ role: "user", content: "[begin]" });
    } else {
      aiMessages.push({ role: "user", content: "Hi" });
      for (const m of existing) {
        aiMessages.push({ role: m.role === "companion" ? "assistant" : "user", content: m.content });
      }
      if (message) aiMessages.push({ role: "user", content: message });
    }

    const systemPrompt = buildSystemPrompt(blueprint, isGreeting);
    const rawResponse  = await fetchAIResponse(systemPrompt, aiMessages, blueprint, apiKey);
    const { content, choices } = parseChoices(rawResponse);

    const { data: companionRecord, error: compErr } = await db
      .from("companion_test_messages")
      .insert({ session_id: sessionId, role: "companion", content, choices: choices.length ? choices : null })
      .select()
      .single();
    if (compErr) throw new Error(compErr.message);

    const messages = [userRecord, companionRecord as StoredMessage].filter(Boolean);
    return new Response(JSON.stringify({ messages, transition: null, modifiers: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
