import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encryptApiKey } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Safe columns — never includes api_key_enc.
const SAFE_COLUMNS =
  "id, provider_name, base_url, api_key_configured, default_model, " +
  "temperature, max_tokens, status, reasoning_level, created_at, updated_at";

const VALID_STATUSES = ["Active", "Disabled"];
const VALID_REASONING_LEVELS = ["none", "low", "medium", "high"] as const;

/**
 * Query Venice /v1/models for a model's reasoning-effort capabilities.
 * Returns null when the model is not found; capabilities fields are null when absent.
 */
async function fetchReasoningCaps(baseUrl: string, apiKey: string, model: string) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models?type=text`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Could not verify model capabilities (Venice /models returned HTTP ${res.status})`);
  const json = await res.json();
  const target = (json.data ?? []).find((m: { id: string }) => m.id === model);
  if (!target) throw new Error(`Model "${model}" was not found on Venice — cannot verify reasoning support.`);
  const caps = target.model_spec?.capabilities ?? {};
  return {
    supportsReasoningEffort: caps.supportsReasoningEffort === true,
    reasoningEffortOptions: (caps.reasoningEffortOptions ?? null) as string[] | null,
  };
}

/**
 * Validate the requested reasoning level against the model's live capabilities.
 * - "none" always allowed (Venice-level reasoning.enabled=false toggle).
 * - low/medium/high require the model to support effort levels AND list the value.
 */
async function validateReasoningLevel(
  baseUrl: string,
  apiKey: string,
  model: string,
  level: string,
): Promise<void> {
  if (level === "none") return;
  const caps = await fetchReasoningCaps(baseUrl, apiKey, model);
  if (!caps.supportsReasoningEffort) {
    throw new Error(
      `Model "${model}" does not support reasoning effort levels (Venice reports supportsReasoningEffort: false). ` +
      `Only "None" can be selected for this model. Low/Medium/High were rejected rather than sending an unsupported parameter.`
    );
  }
  if (caps.reasoningEffortOptions && !caps.reasoningEffortOptions.includes(level)) {
    throw new Error(
      `Model "${model}" does not support reasoning effort "${level}". ` +
      `Supported values: ${caps.reasoningEffortOptions.join(", ")}.`
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    // Verify the caller is an authenticated super admin.
    const userDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: isSuperAdmin } = await userDb.rpc("is_super_admin");
    if (!isSuperAdmin) return respond({ error: "Access denied — super admin only" }, 403);

    const body = await req.json() as {
      action?: string;
      provider_name?: string;
      base_url?: string;
      api_key?: string;
      default_model?: string;
      temperature?: number;
      max_tokens?: number;
      status?: string;
      reasoning_level?: string | null;
    };

    const action = body.action ?? "save";
    const adminDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const encSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Load: return current config (without api_key_enc) ────────────────
    if (action === "load") {
      const { data, error } = await adminDb
        .from("llm_chat_config")
        .select(SAFE_COLUMNS)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return respond({ config: data });
    }

    // ── Save (insert or update) ──────────────────────────────────────────
    if (!body.provider_name?.trim()) throw new Error("provider_name is required");
    if (!body.base_url?.trim()) throw new Error("base_url is required");

    const status = body.status?.trim() || "Active";
    if (!VALID_STATUSES.includes(status))
      throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`);

    const temperature = body.temperature ?? 0.8;
    const maxTokens = body.max_tokens ?? 300;
    if (typeof temperature !== "number" || temperature < 0 || temperature > 2)
      throw new Error("temperature must be between 0 and 2");
    if (typeof maxTokens !== "number" || maxTokens < 1 || maxTokens > 4096)
      throw new Error("max_tokens must be between 1 and 4096");

    // Resolve + validate reasoning level against the model's live capabilities.
    // NULL/undefined = not set (kept as NULL; no parameter sent to Venice).
    const reasoningLevel = body.reasoning_level?.trim() ? body.reasoning_level.trim().toLowerCase() : null;
    if (reasoningLevel !== null && !VALID_REASONING_LEVELS.includes(reasoningLevel as typeof VALID_REASONING_LEVELS[number])) {
      throw new Error(`Invalid reasoning_level. Must be one of: ${VALID_REASONING_LEVELS.join(", ")}, or empty/omitted for not set.`);
    }

    const effectiveModel = body.default_model?.trim() || "venice-uncensored-1-2";
    const effectiveBaseUrl = body.base_url.trim();
    if (reasoningLevel) {
      const apiKeyForValidation = body.api_key?.trim() ?? "";
      // Load the existing encrypted key when the caller did not supply a new one,
      // so capability validation can always run with a real Venice key.
      const apiKey = apiKeyForValidation || await (async () => {
        const { data: keyRow } = await adminDb
          .from("llm_chat_config")
          .select("api_key_enc")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!keyRow?.api_key_enc) throw new Error("Cannot validate reasoning level: no Venice API key is configured.");
        return await decryptApiKey(keyRow.api_key_enc, encSecret);
      })();
      await validateReasoningLevel(effectiveBaseUrl, apiKey, effectiveModel, reasoningLevel);
    }

    // Check if a config row already exists (single-row table).
    const { data: existing } = await adminDb
      .from("llm_chat_config")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      provider_name: body.provider_name.trim(),
      base_url: effectiveBaseUrl,
      default_model: effectiveModel,
      temperature,
      max_tokens: maxTokens,
      status,
      reasoning_level: reasoningLevel,
      updated_at: new Date().toISOString(),
    };

    if (body.api_key?.trim()) {
      payload.api_key_enc = await encryptApiKey(body.api_key.trim(), encSecret);
      payload.api_key_configured = true;
    }

    let configId: string;

    if (existing?.id) {
      const { error: err } = await adminDb
        .from("llm_chat_config")
        .update(payload)
        .eq("id", existing.id);
      if (err) throw new Error(err.message);
      configId = existing.id;
    } else {
      // Insert — api_key required for first-time setup.
      if (!body.api_key?.trim()) throw new Error("api_key is required for initial configuration");
      payload.api_key_configured = true;
      const { data, error: err } = await adminDb
        .from("llm_chat_config")
        .insert(payload)
        .select("id")
        .single();
      if (err) throw new Error(err.message);
      configId = data.id;
    }

    // Return the saved config without any key material.
    const { data: saved, error: selErr } = await adminDb
      .from("llm_chat_config")
      .select(SAFE_COLUMNS)
      .eq("id", configId)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);

    return respond({ config: saved });

  } catch (err) {
    return respond({ error: (err as Error).message }, 400);
  }
});
