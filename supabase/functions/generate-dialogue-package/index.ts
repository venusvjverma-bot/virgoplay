import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptApiKey } from "../_shared/crypto.ts";

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

// ── Deployment Task 002 — Development-only dialogue generation pipeline ────────
//
// Gate: Mother Creator (test.test@gmail.com) or super admin only.
// No database writes. Temporary test output only.
// The existing Dialogue Library → Chat connection is completely untouched.

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    // ── Verify caller identity ─────────────────────────────────────────────
    const userDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await userDb.auth.getUser();
    if (userErr || !user) throw new Error("Authentication failed");

    const { data: isSuperAdmin } = await userDb.rpc("is_super_admin");
    const isMotherCreator = user.email === "test.test@gmail.com";

    if (!isSuperAdmin && !isMotherCreator) {
      return respond(
        { error: "Access denied — restricted to Mother Creator development account" },
        403,
      );
    }

    // ── Parse request body ─────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { prompt } = body as { prompt?: string };
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return respond({ error: "prompt is required and must be a non-empty string" }, 400);
    }

    // ── Load active provider configuration ─────────────────────────────────
    const adminDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: config, error: configErr } = await adminDb
      .from("provider_configurations")
      .select("id, provider_name, provider_url, api_key_enc, api_key_configured")
      .eq("is_active", true)
      .maybeSingle();

    if (configErr) throw new Error(configErr.message);

    if (!config) {
      return respond({ error: "No active provider configuration found. Configure a provider in the admin panel." }, 503);
    }
    if (!config.provider_url) {
      return respond({ error: "Provider URL not configured." }, 503);
    }
    if (!config.api_key_configured || !config.api_key_enc) {
      return respond({ error: "Provider API key not configured. Add an API key via Provider Configuration." }, 503);
    }

    // ── Decrypt API key ────────────────────────────────────────────────────
    const encSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let apiKey: string;
    try {
      apiKey = await decryptApiKey(config.api_key_enc as string, encSecret);
    } catch {
      return respond({ error: "API key decryption failed. Re-save the provider configuration." }, 503);
    }

    // ── Send assembled prompt to RunPod ────────────────────────────────────
    // No database writes. This is a temporary pipeline verification only.
    const t0 = performance.now();

    let runpodResponse: Response;
    try {
      runpodResponse = await fetch(config.provider_url as string, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            prompt: prompt.trim(),
            max_new_tokens: 2000,
            temperature: 0.7,
            do_sample: true,
          },
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (fetchErr) {
      const e = fetchErr as Error;
      const timed_out = e.name === "TimeoutError" || e.name === "AbortError";
      return respond({
        status: "error",
        generation_time_ms: Math.round(performance.now() - t0),
        output: null,
        error: timed_out
          ? "Request timed out after 90 seconds. The provider may be cold-starting."
          : `Network error: ${e.message}`,
        provider_name: config.provider_name,
      });
    }

    const generation_time_ms = Math.round(performance.now() - t0);
    const rawText = await runpodResponse.text();

    if (!runpodResponse.ok) {
      return respond({
        status: "error",
        generation_time_ms,
        output: null,
        error: `Provider returned HTTP ${runpodResponse.status}: ${rawText.slice(0, 600)}`,
        provider_name: config.provider_name,
      });
    }

    // ── Parse provider response ────────────────────────────────────────────
    // Handle common RunPod serverless response shapes.
    let output: string = rawText;
    try {
      const parsed = JSON.parse(rawText);
      if (typeof parsed.output === "string") {
        output = parsed.output;
      } else if (typeof parsed.output?.text === "string") {
        output = parsed.output.text;
      } else if (Array.isArray(parsed.output)) {
        output = (parsed.output as string[]).join("\n");
      } else if (typeof parsed.choices?.[0]?.text === "string") {
        output = parsed.choices[0].text;
      } else if (typeof parsed.choices?.[0]?.message?.content === "string") {
        output = parsed.choices[0].message.content;
      } else {
        output = JSON.stringify(parsed, null, 2);
      }
    } catch {
      // rawText is not JSON — use as-is
    }

    // ── Return test output — no database writes ────────────────────────────
    return respond({
      status: "success",
      generation_time_ms,
      output,
      provider_name: config.provider_name,
    });

  } catch (err) {
    return respond({ error: (err as Error).message }, 400);
  }
});
