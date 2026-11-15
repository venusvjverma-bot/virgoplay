import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptApiKey } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * test-promptchan-text-to-image
 *
 * Runs a pure text-to-image generation through Promptchan — NO reference image,
 * NO face swap, NO base64 image upload. Only a text prompt is sent.
 *
 * After generation, saves the result as a Character Identity and reports whether
 * Promptchan exposed any reusable character identifier.
 */

interface TestResult {
  success: boolean;
  request_type: string;
  reference_image_sent: boolean;
  prompt_sent: string;
  provider_name: string;
  provider_endpoint: string;
  http_status: number;
  image_url: string | null;
  gems_remaining: number | null;
  response_keys: string[];
  has_reusable_character_id: boolean;
  provider_character_id: string | null;
  character_saved: boolean;
  character_id: string | null;
  seed_used: number;
  error: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const result: TestResult = {
    success: false,
    request_type: 'text-to-image',
    reference_image_sent: false,
    prompt_sent: '',
    provider_name: 'Promptchan',
    provider_endpoint: '',
    http_status: 0,
    image_url: null,
    gems_remaining: null,
    response_keys: [],
    has_reusable_character_id: false,
    provider_character_id: null,
    character_saved: false,
    character_id: null,
    seed_used: -1,
    error: null,
  };

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      result.error = 'Missing Authorization header';
      return jsonResponse(result, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      result.error = 'Invalid or expired session';
      return jsonResponse(result, 401);
    }

    // ── The exact test prompt ──────────────────────────────────────────────────
    const testPrompt =
      'Create a beautiful adult Japanese female character with long black hair, ' +
      'almond-shaped brown eyes, porcelain skin, a slim athletic figure, ' +
      'elegant appearance, and a friendly smile.';

    result.prompt_sent = testPrompt;
    result.seed_used = 42; // fixed seed for reproducibility

    // ── Load the active image provider ────────────────────────────────────────
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: provider, error: provError } = await serviceClient
      .from('provider_configurations')
      .select('id, provider_name, provider_url, auth_method, api_key_enc')
      .eq('service_type', 'image')
      .eq('is_active', true)
      .maybeSingle();

    if (provError || !provider) {
      result.error = 'No active image provider configured';
      return jsonResponse(result, 500);
    }

    result.provider_name = provider.provider_name;
    result.provider_endpoint = `${provider.provider_url.replace(/\/+$/, '')}/api/external/create`;

    // ── Decrypt the API key ───────────────────────────────────────────────────
    let apiKey = '';
    if (provider.api_key_enc) {
      apiKey = await decryptApiKey(provider.api_key_enc, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    }
    if (!apiKey) {
      result.error = 'Provider API key not configured';
      return jsonResponse(result, 500);
    }

    // ── Build the request body (text-to-image only) ────────────────────────────
    // Only prompt, style, seed, quality, creativity, image_size are sent.
    // NO reference_image, NO base64 image, NO face swap fields.
    const requestBody = {
      prompt: testPrompt,
      style: 'Hyperreal XL+ v2',
      seed: result.seed_used,
      quality: 'Ultra',
      creativity: 50,
      image_size: '512x768',
      restore_faces: true,
    };

    // ── Create the Master AI Character record FIRST ─────────────────────────────
    const characterData = {
      name: 'Test Japanese Character',
      age: 25,
      ethnicity: 'Japanese',
      gender: 'Woman',
      hair: 'long black hair',
      eyes: 'almond-shaped brown eyes',
      face_shape: 'oval face',
      skin_tone: 'porcelain skin',
      height: "5'4\" / 163cm",
      body_figure: 'slim athletic figure',
      bust: '',
      waist: '',
      hips: '',
      personality: 'friendly and elegant',
      fashion_style: 'elegant',
      default_outfit: '',
      makeup: '',
      accessories: '',
      pose_preference: 'standing facing camera with a friendly smile',
      lighting_preference: 'soft natural lighting',
    };

    const { data: charRow, error: charError } = await supabase
      .from('master_ai_characters')
      .insert({
        creator_id: user.id,
        name: characterData.name,
        character_data: characterData,
        seed: result.seed_used,
        style_filter: 'Hyperreal XL+ v2',
        is_active: true,
      })
      .select()
      .single();

    if (charError || !charRow) {
      result.error = `Failed to create character: ${charError?.message ?? 'unknown'}`;
      return jsonResponse(result, 500);
    }
    result.character_id = charRow.id;

    // Deactivate other characters
    await supabase
      .from('master_ai_characters')
      .update({ is_active: false })
      .neq('id', charRow.id);

    // ── Log the pending generation ────────────────────────────────────────────
    const { data: imgRow } = await supabase
      .from('generated_images')
      .insert({
        creator_id: user.id,
        character_id: charRow.id,
        provider_name: provider.provider_name,
        prompt_used: testPrompt,
        seed_used: result.seed_used,
        status: 'pending',
      })
      .select()
      .single();

    // ── Call Promptchan (text-to-image only) ────────────────────────────────────
    const providerResponse = await fetch(result.provider_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120_000),
    });

    result.http_status = providerResponse.status;
    const responseText = await providerResponse.text();
    let responseData: Record<string, unknown>;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }
    result.response_keys = Object.keys(responseData);

    if (!providerResponse.ok) {
      result.error = `Provider returned ${providerResponse.status}: ${responseText.slice(0, 500)}`;
      if (imgRow) await supabase.from('generated_images').update({ status: 'error' }).eq('id', imgRow.id);
      return jsonResponse(result, 502);
    }

    // ── Parse the response ─────────────────────────────────────────────────────
    // Expected: { image: <base64>, gems: <integer> }
    const imageB64 = responseData.image as string | undefined;
    result.gems_remaining = (responseData.gems as number) ?? null;

    // Check if Promptchan exposed any reusable character identifier
    const possibleIdKeys = ['character_id', 'id', 'doc_ref', 'doc_refs', 'request_id', 'uuid', 'character'];
    for (const key of possibleIdKeys) {
      if (key in responseData && responseData[key] != null) {
        result.has_reusable_character_id = true;
        result.provider_character_id = String(responseData[key]);
        break;
      }
    }

    if (!imageB64) {
      result.error = 'Provider did not return an image';
      if (imgRow) await supabase.from('generated_images').update({ status: 'error' }).eq('id', imgRow.id);
      return jsonResponse(result, 502);
    }

    // ── Upload to Supabase Storage ──────────────────────────────────────────────
    const base64Data = imageB64.startsWith('data:') ? imageB64.split(',')[1]! : imageB64;
    const imageBytes = base64ToUint8Array(base64Data);
    const imageBlob = new Blob([imageBytes], { type: 'image/png' });

    const storagePath = `${user.id}/${imgRow?.id ?? 'test'}.png`;
    const { error: uploadError } = await serviceClient.storage
      .from('character-identities')
      .upload(storagePath, imageBlob, { contentType: 'image/png', upsert: false });

    let publicUrl: string;
    if (uploadError) {
      publicUrl = `data:image/png;base64,${base64Data}`;
    } else {
      const { data: urlData } = serviceClient.storage
        .from('character-identities')
        .getPublicUrl(storagePath);
      publicUrl = urlData.publicUrl;
    }
    result.image_url = publicUrl;

    // ── Update the generated_images row ───────────────────────────────────────
    if (imgRow) {
      await supabase.from('generated_images').update({
        image_url: publicUrl,
        provider_image_id: result.provider_character_id,
        seed_used: result.seed_used,
        status: 'completed',
      }).eq('id', imgRow.id);
    }

    // ── Save as Character Identity ──────────────────────────────────────────────
    const providerMetadata = {
      provider_name: provider.provider_name,
      style: 'Hyperreal XL+ v2',
      seed_used: result.seed_used,
      gems_remaining: result.gems_remaining,
      image_size: '512x768',
      quality: 'Ultra',
      restore_faces: true,
      request_endpoint: result.provider_endpoint,
      response_keys: result.response_keys,
      has_reusable_character_id: result.has_reusable_character_id,
      request_type: 'text-to-image',
      reference_image_sent: false,
    };

    await supabase.from('master_ai_characters').update({
      identity_image_url: publicUrl,
      identity_image_path: storagePath,
      provider_character_id: result.provider_character_id,
      provider_metadata: providerMetadata,
      identity_saved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', charRow.id);

    result.character_saved = true;
    result.success = true;

    return jsonResponse(result, 200);

  } catch (err) {
    result.error = (err as Error).message;
    return jsonResponse(result, 500);
  }
});

function jsonResponse(data: TestResult, status: number): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
