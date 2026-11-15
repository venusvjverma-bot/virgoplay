import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptApiKey } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(401, 'Missing Authorization header');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonError(401, 'Invalid session');

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: provider } = await serviceClient
      .from('provider_configurations')
      .select('provider_name, provider_url, api_key_enc')
      .eq('service_type', 'image')
      .eq('is_active', true)
      .maybeSingle();

    if (!provider) return jsonError(500, 'No active provider');

    let apiKey = '';
    if (provider.api_key_enc) {
      apiKey = await decryptApiKey(provider.api_key_enc, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    }

    const baseUrl = provider.provider_url.replace(/\/+$/, '');

    // ── Chat WITH sexuality field (as the OpenAPI spec requires) ─────────────────
    const chatBody = {
      message: 'Hello, who are you?',
      characterData: {
        name: 'Aria',
        personality: 'friendly and kind',
        scenario: 'meeting for the first time',
        sexuality: 'heterosexual',
        age: 25,
        gender: 'female',
        openness: 2,
        emotions: 2,
      },
      chatHistory: [],
      isRoleplay: false,
      userName: 'Test',
    };

    const chatRes = await fetch(`${baseUrl}/api/external/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(chatBody),
      signal: AbortSignal.timeout(30_000),
    });
    const chatText = await chatRes.text();

    return new Response(JSON.stringify({
      chat: {
        status: chatRes.status,
        headers: Object.fromEntries(chatRes.headers.entries()),
        body: chatText.slice(0, 2000),
      },
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return jsonError(500, (err as Error).message);
  }
});

function jsonError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
