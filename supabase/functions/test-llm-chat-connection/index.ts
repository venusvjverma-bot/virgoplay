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

    // Read active LLM Chat Config from database.
    const adminDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: config, error: cfgErr } = await adminDb
      .from("llm_chat_config")
      .select("id, provider_name, base_url, api_key_enc, api_key_configured, default_model, temperature, max_tokens, status, reasoning_level")
      .eq("status", "Active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (cfgErr) throw new Error(cfgErr.message);
    if (!config) throw new Error("No active LLM Chat Config found. Save a configuration first.");
    if (!config.api_key_configured || !config.api_key_enc) {
      throw new Error("API key not configured. Save an API key before testing.");
    }

    // Decrypt the API key server-side.
    const encSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = await decryptApiKey(config.api_key_enc, encSecret);

    // Call Venice chat completions endpoint.
    const endpoint = `${config.base_url.replace(/\/$/, "")}/chat/completions`;
    const requestBody: Record<string, unknown> = {
      model: config.default_model,
      messages: [
        { role: "user", content: "Reply with exactly: Venice connection OK" },
      ],
      temperature: config.temperature,
      max_tokens: 50,
    };

    // Mirror the llm-chat function's reasoning behavior so Test Connection
    // exercises the exact same parameter set.
    if (config.reasoning_level === "none") {
      requestBody.reasoning = { enabled: false };
    } else if (config.reasoning_level) {
      requestBody.reasoning_effort = config.reasoning_level;
    }

    const veniceRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const rawBody = await veniceRes.text();

    if (!veniceRes.ok) {
      let errMsg = `Venice returned HTTP ${veniceRes.status}`;
      try {
        const errJson = JSON.parse(rawBody);
        if (errJson.error?.message) errMsg = errJson.error.message;
        else if (errJson.error) errMsg = typeof errJson.error === "string" ? errJson.error : JSON.stringify(errJson.error);
        else if (errJson.message) errMsg = errJson.message;
      } catch {
        if (rawBody) errMsg = rawBody.slice(0, 500);
      }
      return respond({
        success: false,
        status: veniceRes.status,
        error: errMsg,
        endpoint,
        model: config.default_model,
      });
    }

    // Parse the successful response.
    // `content` may be a string or an array of text parts. We never expose
    // `reasoning_content` — that is the model's internal thinking, not the reply.
    let replyText = "";
    try {
      const chatJson = JSON.parse(rawBody);
      const msg = chatJson.choices?.[0]?.message;

      if (msg) {
        if (typeof msg.content === "string" && msg.content.trim()) {
          replyText = msg.content.trim();
        } else if (Array.isArray(msg.content) && msg.content.length > 0) {
          replyText = msg.content
            .map((p: { text?: string }) => (typeof p.text === "string" ? p.text : ""))
            .join("")
            .trim();
        }
      }

      if (!replyText && typeof chatJson.choices?.[0]?.text === "string") {
        replyText = chatJson.choices[0].text.trim();
      }

      if (!replyText) replyText = "(empty reply from model)";
    } catch {
      replyText = "(could not parse response)";
    }

    return respond({
      success: true,
      status: veniceRes.status,
      reply: replyText,
      model: config.default_model,
      provider: config.provider_name,
      endpoint,
    });

  } catch (err) {
    return respond({ error: (err as Error).message }, 400);
  }
});
