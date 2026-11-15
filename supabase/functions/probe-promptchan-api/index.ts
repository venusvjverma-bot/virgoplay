import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptApiKey } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProbeResult {
  endpoint: string;
  method: string;
  status: number;
  statusText: string;
  responseBody: string;
  responseHeaders: Record<string, string>;
}

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

    // ── Load the active image provider to get the API key ──────────────────────
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    };

    const results: ProbeResult[] = [];

    // ── 1. Test the documented /api/external/create with full params ─────────────
    results.push(await probe(
      `${baseUrl}/api/external/create`,
      'POST',
      headers,
      {
        prompt: 'beautiful Japanese woman, long black hair, brown eyes, friendly smile',
        style: 'Hyperreal XL+ v2',
        seed: 42,
        quality: 'Ultra',
        creativity: 50,
        image_size: '512x768',
        restore_faces: true,
      },
    ));

    // ── 2. Probe for undocumented character-related endpoints ───────────────────
    const probeEndpoints = [
      { path: '/api/external/character', method: 'GET' },
      { path: '/api/external/characters', method: 'GET' },
      { path: '/api/external/character/create', method: 'POST' },
      { path: '/api/external/character/list', method: 'GET' },
      { path: '/api/external/characters/list', method: 'GET' },
      { path: '/api/external/user/characters', method: 'GET' },
      { path: '/api/external/identity', method: 'GET' },
      { path: '/api/external/identities', method: 'GET' },
      { path: '/api/external/tweak', method: 'POST' },
      { path: '/api/external/edit', method: 'POST' },
      { path: '/api/external/variation', method: 'POST' },
      { path: '/api/external/img2img', method: 'POST' },
      { path: '/api/external/image-to-image', method: 'POST' },
      { path: '/api/external/face-swap', method: 'POST' },
      { path: '/api/external/faceswap', method: 'POST' },
      { path: '/api/external/inpaint', method: 'POST' },
      { path: '/api/external/upscale', method: 'POST' },
      { path: '/api/external/enhance', method: 'POST' },
      { path: '/api/external/history', method: 'GET' },
      { path: '/api/external/gallery', method: 'GET' },
      { path: '/api/external/images', method: 'GET' },
      { path: '/api/external/image', method: 'GET' },
      { path: '/api/external/models', method: 'GET' },
      { path: '/api/external/styles', method: 'GET' },
      { path: '/api/external/poses', method: 'GET' },
      { path: '/api/external/filters', method: 'GET' },
      { path: '/api/external/account', method: 'GET' },
      { path: '/api/external/user', method: 'GET' },
      { path: '/api/external/me', method: 'GET' },
      { path: '/api/external/gems', method: 'GET' },
      { path: '/api/external/balance', method: 'GET' },
      { path: '/api/external/health', method: 'GET' },
      { path: '/api/external/status', method: 'GET' },
      { path: '/api/external/docs', method: 'GET' },
      { path: '/api/external/openapi', method: 'GET' },
      { path: '/api/external/swagger', method: 'GET' },
      { path: '/api/external/spec', method: 'GET' },
    ];

    for (const ep of probeEndpoints) {
      const url = `${baseUrl}${ep.path}`;
      try {
        const res = await fetch(url, {
          method: ep.method,
          headers,
          signal: AbortSignal.timeout(10_000),
          ...(ep.method === 'POST' ? { body: JSON.stringify({ prompt: 'test' }) } : {}),
        });
        const body = await res.text();
        results.push({
          endpoint: ep.path,
          method: ep.method,
          status: res.status,
          statusText: res.statusText,
          responseBody: body.slice(0, 500),
          responseHeaders: Object.fromEntries(res.headers.entries()),
        });
      } catch (e) {
        results.push({
          endpoint: ep.path,
          method: ep.method,
          status: 0,
          statusText: 'fetch_error',
          responseBody: (e as Error).message,
          responseHeaders: {},
        });
      }
    }

    // ── 3. Test the chat endpoint with characterData ─────────────────────────────
    results.push(await probe(
      `${baseUrl}/api/external/chat`,
      'POST',
      headers,
      {
        message: 'Hello, who are you?',
        characterData: {
          name: 'Aria',
          personality: 'friendly and kind',
          scenario: 'meeting for the first time',
          age: 25,
          gender: 'female',
          openness: 2,
          emotions: 2,
        },
        chatHistory: [],
        isRoleplay: false,
        userName: 'Test',
      },
    ));

    return new Response(JSON.stringify({
      provider_url: baseUrl,
      provider_name: provider.provider_name,
      total_endpoints_probed: results.length,
      results,
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return jsonError(500, (err as Error).message);
  }
});

async function probe(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: Record<string, unknown>,
): Promise<ProbeResult> {
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const responseText = await res.text();
    return {
      endpoint: url.replace(/^https?:\/\/[^/]+/, ''),
      method,
      status: res.status,
      statusText: res.statusText,
      responseBody: responseText.slice(0, 500),
      responseHeaders: Object.fromEntries(res.headers.entries()),
    };
  } catch (e) {
    return {
      endpoint: url.replace(/^https?:\/\/[^/]+/, ''),
      method,
      status: 0,
      statusText: 'fetch_error',
      responseBody: (e as Error).message,
      responseHeaders: {},
    };
  }
}

function jsonError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
