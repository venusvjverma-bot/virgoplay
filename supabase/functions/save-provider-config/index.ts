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
  "id, provider_name, provider_url, api_key_configured, service_type, provider_type, auth_method, " +
  "test_endpoint, asset_upload_endpoint, generation_endpoint, generation_status_endpoint, generation_result_endpoint, " +
  "video_generation_endpoint, " +
  "connection_status, health_status, is_active, last_health_check, created_at, updated_at";

const VALID_SERVICE_TYPES = ["image", "chat", "video", "voice", "moderation", "other"];
const VALID_AUTH_METHODS  = ["bearer", "key", "token", "x-api-key", "none"];
const VALID_PROVIDER_TYPES = ["image", "video", "image+video", "chat", "audio", "multi-modal"];

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
      config_id?:                    string;
      provider_name:                 string;
      provider_url:                  string;
      api_key?:                      string;
      service_type?:                 string;
      provider_type?:                string;
      auth_method?:                  string;
      is_active?:                    boolean;
      test_endpoint?:                string;
      asset_upload_endpoint?:        string;
      generation_endpoint?:          string;
      generation_status_endpoint?:   string;
      generation_result_endpoint?:  string;
      video_generation_endpoint?:    string;
    };

    if (!body.provider_name?.trim()) throw new Error("provider_name is required");
    if (!body.provider_url?.trim())  throw new Error("provider_url is required");

    const serviceType  = body.service_type?.trim()  || "image";
    const authMethod   = body.auth_method?.trim()   || "bearer";
    const providerType = body.provider_type?.trim() || "image";

    if (!VALID_SERVICE_TYPES.includes(serviceType))
      throw new Error(`Invalid service_type. Must be one of: ${VALID_SERVICE_TYPES.join(", ")}`);
    if (!VALID_AUTH_METHODS.includes(authMethod))
      throw new Error(`Invalid auth_method. Must be one of: ${VALID_AUTH_METHODS.join(", ")}`);
    if (!VALID_PROVIDER_TYPES.includes(providerType))
      throw new Error(`Invalid provider_type. Must be one of: ${VALID_PROVIDER_TYPES.join(", ")}`);

    const adminDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const encSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Shared endpoint payload — used for both INSERT and UPDATE.
    const endpointFields: Record<string, string> = {
      provider_type:                 providerType,
      test_endpoint:                 body.test_endpoint?.trim()               ?? "",
      asset_upload_endpoint:         body.asset_upload_endpoint?.trim()       ?? "",
      generation_endpoint:           body.generation_endpoint?.trim()         ?? "",
      generation_status_endpoint:    body.generation_status_endpoint?.trim()  ?? "",
      generation_result_endpoint:    body.generation_result_endpoint?.trim()  ?? "",
      video_generation_endpoint:     body.video_generation_endpoint?.trim()    ?? "",
    };

    if (body.config_id) {
      // UPDATE — only overwrite the encrypted key when a new one was supplied.
      const payload: Record<string, unknown> = {
        provider_name: body.provider_name.trim(),
        provider_url:  body.provider_url.trim(),
        service_type:  serviceType,
        auth_method:   authMethod,
        updated_at:    new Date().toISOString(),
        ...endpointFields,
      };
      if (body.is_active !== undefined) payload.is_active = body.is_active;
      if (body.api_key?.trim()) {
        payload.api_key_enc = await encryptApiKey(body.api_key.trim(), encSecret);
      }
      const { error: err } = await adminDb
        .from("provider_configurations")
        .update(payload)
        .eq("id", body.config_id);
      if (err) throw new Error(err.message);
    } else {
      // INSERT — api_key required for new records.
      if (!body.api_key?.trim()) throw new Error("api_key is required for new configurations");
      const enc = await encryptApiKey(body.api_key.trim(), encSecret);
      const insertPayload: Record<string, unknown> = {
        provider_name: body.provider_name.trim(),
        provider_url:  body.provider_url.trim(),
        api_key_enc:   enc,
        service_type:  serviceType,
        auth_method:   authMethod,
        is_active:     body.is_active !== undefined ? body.is_active : true,
        ...endpointFields,
      };
      const { error: err } = await adminDb
        .from("provider_configurations")
        .insert(insertPayload);
      if (err) throw new Error(err.message);
    }

    // Return the saved config without any key material.
    let saved;
    if (body.config_id) {
      const r = await adminDb
        .from("provider_configurations")
        .select(SAFE_COLUMNS)
        .eq("id", body.config_id)
        .maybeSingle();
      saved = r.data;
    } else {
      const r = await adminDb
        .from("provider_configurations")
        .select(SAFE_COLUMNS)
        .eq("service_type", serviceType)
        .eq("is_active", true)
        .maybeSingle();
      saved = r.data;
    }

    return respond({ config: saved });

  } catch (err) {
    return respond({ error: (err as Error).message }, 400);
  }
});
