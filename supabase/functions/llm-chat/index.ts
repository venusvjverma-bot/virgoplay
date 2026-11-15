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

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    // Verify the caller is an authenticated user (super admin or authenticated backend).
    const userDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await userDb.auth.getUser();
    if (authErr || !user) return respond({ success: false, error: "Access denied — authentication required" }, 403);

    // Parse request body.
    const body = await req.json() as {
      system_prompt?: string;
      messages?: IncomingMessage[];
    };

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      throw new Error("messages array is required and must not be empty");
    }

    for (const msg of body.messages) {
      if (!msg.role || !msg.content) {
        throw new Error("Each message must have role and content");
      }
      if (msg.role !== "user" && msg.role !== "assistant") {
        throw new Error(`Invalid role "${msg.role}" — must be "user" or "assistant"`);
      }
    }

    // Read Active LLM Chat Config from database.
    const adminDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: config, error: cfgErr } = await adminDb
      .from("llm_chat_config")
      .select("id, base_url, api_key_enc, api_key_configured, default_model, temperature, max_tokens, status, reasoning_level")
      .eq("status", "Active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (cfgErr) throw new Error(cfgErr.message);
    if (!config) throw new Error("No active LLM Chat Config found. Super Admin must configure one first.");
    if (!config.api_key_configured || !config.api_key_enc) {
      throw new Error("API key not configured in LLM Chat Config.");
    }

    // Decrypt the API key server-side.
    const encSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = await decryptApiKey(config.api_key_enc, encSecret);

    // Build Venice request messages.
    const veniceMessages: Array<{ role: string; content: string }> = [];
    if (body.system_prompt?.trim()) {
      veniceMessages.push({ role: "system", content: body.system_prompt.trim() });
    }
    for (const msg of body.messages) {
      veniceMessages.push({ role: msg.role, content: msg.content });
    }

    // Call Venice chat completions endpoint.
    const endpoint = `${config.base_url.replace(/\/$/, "")}/chat/completions`;
    const requestBody: Record<string, unknown> = {
      model: config.default_model,
      messages: veniceMessages,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
    };

    // Apply the admin-configured Reasoning Level to every outgoing request.
    // "none" → Venice-level disable toggle (reasoning.enabled: false).
    // low/medium/high → official top-level reasoning_effort parameter
    // (verified against the model's reasoningEffortOptions at save time).
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
      return respond({ success: false, error: errMsg });
    }

    // Parse the successful response.
    let replyText = "";
    try {
      const chatJson = JSON.parse(rawBody);
      replyText = chatJson.choices?.[0]?.message?.content?.trim() ?? "";
      if (!replyText) replyText = "(empty reply from model)";
    } catch {
      replyText = "(could not parse response)";
    }

    return respond({ success: true, reply: replyText });

  } catch (err) {
    return respond({ success: false, error: (err as Error).message }, 400);
  }
});
