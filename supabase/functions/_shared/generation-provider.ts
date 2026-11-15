/**
 * Universal Generation Engine V2 — Provider Loader (Deno/Edge Function)
 *
 * Loads provider configuration from the `provider_configurations` table and
 * decrypts the API key. Returns a ProviderConfig object ready for use by
 * any adapter.
 *
 * This replaces the ad-hoc provider loading in each edge function with a
 * single, consistent loader that also reads the stored endpoint configuration
 * (generation_endpoint, generation_status_endpoint, generation_result_endpoint).
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptApiKey } from "./crypto.ts";
import type { ProviderConfig, ProviderServiceType, ProviderAuthMethod } from "./generation-types.ts";

/**
 * Load the active provider configuration for a given service type.
 * Returns null if no provider is configured.
 */
export async function loadProviderConfig(
  serviceType: ProviderServiceType,
): Promise<ProviderConfig | null> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: config, error } = await admin
    .from("provider_configurations")
    .select(
      "id, provider_name, provider_url, auth_method, service_type, api_key_enc, "
      + "generation_endpoint, generation_status_endpoint, generation_result_endpoint, "
      + "video_generation_endpoint",
    )
    .eq("service_type", serviceType)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(`Failed to load ${serviceType} provider: ${error.message}`);
  if (!config) return null;
  if (!config.provider_url) return null;

  let apiKey = "";
  if (config.api_key_enc) {
    try {
      apiKey = await decryptApiKey(
        config.api_key_enc as string,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
    } catch {
      throw new Error(
        `${serviceType} provider API key decryption failed. Re-save the provider configuration to re-encrypt.`,
      );
    }
  }

  return {
    id: config.id,
    provider_name: config.provider_name,
    provider_url: config.provider_url,
    auth_method: (config.auth_method ?? "bearer") as ProviderAuthMethod,
    service_type: config.service_type as ProviderServiceType,
    api_key: apiKey,
    generation_endpoint: config.generation_endpoint ?? "",
    generation_status_endpoint: config.generation_status_endpoint ?? null,
    generation_result_endpoint: config.generation_result_endpoint ?? null,
    video_generation_endpoint: config.video_generation_endpoint ?? "",
  };
}

/**
 * Build authentication headers from a provider configuration.
 * Supports bearer, key, x-api-key, and none auth methods.
 */
export function buildAuthHeaders(provider: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  switch (provider.auth_method) {
    case "bearer":
      headers["Authorization"] = `Bearer ${provider.api_key}`;
      break;
    case "key":
      headers["Authorization"] = `Key ${provider.api_key}`;
      break;
    case "x-api-key":
      headers["x-api-key"] = provider.api_key;
      break;
    case "none":
      break;
  }
  return headers;
}

/**
 * Normalize a base URL by removing trailing slashes.
 */
export function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Resolve a full endpoint URL from a provider config.
 * If the stored endpoint is an absolute URL, use it directly.
 * If it's a path, prepend the provider base URL.
 */
export function resolveEndpoint(provider: ProviderConfig, endpoint: string): string {
  if (!endpoint) return "";
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) return endpoint;
  return `${normalizeBaseUrl(provider.provider_url)}${endpoint}`;
}
