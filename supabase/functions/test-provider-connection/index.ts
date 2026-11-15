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

/**
 * Builds the auth headers for a provider based on its auth_method.
 */
function buildAuthHeaders(authMethod: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {};
  switch (authMethod) {
    case "bearer":    headers["Authorization"] = `Bearer ${apiKey}`; break;
    case "key":       headers["Authorization"] = `Key ${apiKey}`;    break;
    case "token":     headers["Authorization"] = `Token ${apiKey}`;   break;
    case "x-api-key": headers["x-api-key"]     = apiKey;             break;
    case "none":      break;
  }
  return headers;
}

/**
 * Resolves the probe URL dynamically from the stored test_endpoint.
 *
 * The old approach hardcoded paths per provider name (a switch statement that
 * grew with every new provider). The new approach reads `test_endpoint` from
 * the database row, so adding a new provider requires only configuration — no
 * source code changes.
 *
 * Fallback: if test_endpoint is empty, we use the base URL root (legacy
 * Fal.ai behaviour) so existing providers without an explicit test_endpoint
 * keep working.
 */
function resolveProbeUrl(baseUrl: string, testEndpoint: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  if (!testEndpoint || !testEndpoint.trim()) return normalizedBase;
  const normalizedEndpoint = testEndpoint.startsWith("/") ? testEndpoint : `/${testEndpoint}`;
  return `${normalizedBase}${normalizedEndpoint}`;
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

    const body = await req.json().catch(() => ({})) as { config_id?: string };
    const adminDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Read the requested config row, or fall back to the active chat provider.
    let query = adminDb
      .from("provider_configurations")
      .select("id, provider_name, provider_url, api_key_enc, auth_method, test_endpoint, service_type");

    if (body.config_id) query = query.eq("id", body.config_id);
    else query = query.eq("service_type", "chat").eq("is_active", true);

    const { data: config, error: configErr } = await query.maybeSingle();
    if (configErr) throw new Error(configErr.message);

    if (!config || !config.provider_url) {
      return respond({
        provider_name:     "Disabled",
        connection_status: "offline",
        last_health_check: null,
        debug: {
          request_url:   null,
          http_status:   null,
          response_body: null,
          error_message: "No provider configuration found in the database.",
          timed_out:     false,
          duration_ms:   0,
        },
      });
    }

    const encSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let apiKey: string;
    if (!config.api_key_enc) {
      return respond({
        provider_name:     config.provider_name,
        connection_status: "offline",
        last_health_check: null,
        debug: {
          request_url:   null,
          http_status:   null,
          response_body: null,
          error_message: "No API key configured. Edit the provider configuration to add one.",
          timed_out:     false,
          duration_ms:   0,
        },
      });
    }
    try {
      apiKey = await decryptApiKey(config.api_key_enc as string, encSecret);
    } catch {
      return respond({
        provider_name:     config.provider_name,
        connection_status: "offline",
        last_health_check: null,
        debug: {
          request_url:   null,
          http_status:   null,
          response_body: null,
          error_message: "API key decryption failed. Re-save the configuration to re-encrypt.",
          timed_out:     false,
          duration_ms:   0,
        },
      });
    }

    const serviceType = (config.service_type as string) ?? "chat";
    const probeUrl = resolveProbeUrl(
      config.provider_url as string,
      (config.test_endpoint as string) ?? "",
    );

    // Hive V3 Service API Keys use Bearer auth, even though the stored
    // auth_method may say "token" (a V2 convention). For moderation
    // providers targeting the V3 chat-completions endpoint, always use
    // Bearer so the key is accepted.
    const effectiveAuthMethod = serviceType === "moderation" ? "bearer" : (config.auth_method as string ?? "bearer");

    const headers: Record<string, string> = {
      ...buildAuthHeaders(effectiveAuthMethod, apiKey),
      "Accept": "application/json",
    };

    let connectionStatus: string;
    let httpStatus:   number | null = null;
    let responseBody: string | null = null;
    let responseContentType: string | null = null;
    let jsonParseResult:  string | null = null;
    let bodyPreview:      string | null = null;
    let errorMessage: string | null = null;
    let timedOut = false;
    const t0 = performance.now();

    // Moderation providers (e.g. Hive V3) use a chat-completions endpoint
    // that accepts JSON with a model name and messages array containing
    // an image URL. A minimal test request validates credentials.
    const isModeration = serviceType === "moderation";
    const TEST_IMAGE_URL = "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400";

    try {
      const fetchOptions: RequestInit & { signal: AbortSignal } = {
        method:  isModeration ? "POST" : "GET",
        headers,
        signal:  AbortSignal.timeout(30_000),
      };
      if (isModeration) {
        headers["Content-Type"] = "application/json";
        fetchOptions.body = JSON.stringify({
          model: "hive/vision-language-model",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Moderate this image." },
                { type: "image_url", image_url: { url: TEST_IMAGE_URL } },
              ],
            },
          ],
        });
      }
      const res = await fetch(probeUrl, fetchOptions);
      httpStatus = res.status;
      responseContentType = res.headers.get("Content-Type") ?? res.headers.get("content-type");

      let fullText: string;
      try {
        fullText = await res.text();
      } catch {
        fullText = "";
        responseBody = "(could not read response body)";
      }

      // Truncate only for display/debug — parse the FULL text, not the slice.
      responseBody = fullText.slice(0, 500);
      bodyPreview  = fullText.slice(0, 100);

      if (res.status === 401 || res.status === 403) {
        connectionStatus = "offline";
        errorMessage = `Authentication failed (HTTP ${res.status}). The API key may be invalid or revoked.`;
        console.log(`[test-provider] auth failed (HTTP ${res.status}) → ${config.provider_name} Offline`);
      } else if (res.status === 200) {
        // Detect JSON by attempting JSON.parse() on the FULL response text.
        // We do NOT rely on the Content-Type header — some providers return
        // text/plain or omit the header entirely while sending valid JSON.
        if (fullText) {
          try {
            JSON.parse(fullText);
            jsonParseResult = "success";
            connectionStatus = "connected";
            console.log(`[test-provider] reachable (HTTP ${res.status}, valid JSON) → ${config.provider_name} Connected`);
          } catch (parseErr) {
            jsonParseResult = `failed: ${(parseErr as Error).message}`;
            connectionStatus = "offline";
            errorMessage = `HTTP ${res.status} returned non-JSON body (JSON.parse failed on full response). The endpoint may be returning an HTML challenge page.`;
            console.log(`[test-provider] non-JSON body (HTTP ${res.status}) → ${config.provider_name} Offline`);
            return finalize();
          }
        } else {
          // Empty body on 200 — treat as connected (some APIs return 200 with no body).
          jsonParseResult = "empty body (skipped)";
          connectionStatus = "connected";
          console.log(`[test-provider] reachable (HTTP ${res.status}, empty body) → ${config.provider_name} Connected`);
        }
      } else {
        // Unexpected status — treat as offline with diagnostic.
        connectionStatus = "offline";
        errorMessage = `Unexpected HTTP ${res.status} from API endpoint.`;
        console.log(`[test-provider] unexpected (HTTP ${res.status}) → ${config.provider_name} Offline`);
      }
    } catch (err) {
      connectionStatus = "offline";
      const e = err as Error;
      timedOut     = e.name === "TimeoutError" || e.name === "AbortError";
      errorMessage = timedOut ? "Request timed out after 30 seconds." : e.message;
      console.log(`[test-provider] unreachable: ${e.message} → Offline`);
    }

    return finalize();

    async function finalize() {
      const durationMs = Math.round(performance.now() - t0);
      const now        = new Date().toISOString();

      await adminDb
        .from("provider_configurations")
        .update({
          connection_status: connectionStatus,
          health_status:     "n/a",
          last_health_check: now,
        })
        .eq("id", config.id);

      return respond({
        provider_name:     config.provider_name,
        connection_status: connectionStatus,
        last_health_check: now,
        debug: {
          request_url:         probeUrl,
          http_status:          httpStatus,
          response_body:        responseBody,
          response_content_type: responseContentType,
          body_preview:         bodyPreview,
          json_parse_result:    jsonParseResult,
          error_message:        errorMessage,
          timed_out:            timedOut,
          duration_ms:          durationMs,
        },
      });
    }

  } catch (err) {
    return respond({ error: (err as Error).message }, 400);
  }
});
