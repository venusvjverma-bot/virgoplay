/**
 * Prompt Builder Foundation V1 — Formatter Registry
 *
 * Maps provider + asset type pairs to their PromptFormatter implementations.
 * The registry is populated at module load time — no provider name is
 * hardcoded as a fallback. If no formatter is registered for a given
 * provider + asset type combination, the default neutral formatter is used.
 *
 * Keying on provider + asset type (rather than provider alone) allows one
 * provider to support multiple AI modalities. For example, Fal.ai could
 * have separate formatters for image generation and video generation, each
 * producing the appropriate prompt channels for that modality.
 *
 * To add a new provider or modality:
 * 1. Implement the PromptFormatter interface in a new module.
 * 2. Register it here: `registerFormatter(new MyProviderImageFormatter())`.
 * 3. The Prompt Builder architecture does not change.
 *
 * Golden Rule: "If Fal.ai disappears tomorrow and ZenCreator becomes active,
 * the Prompt Builder architecture must not change." Only a new formatter
 * module needs to be written and registered.
 *
 * Modality Rule: "If image generation disappears tomorrow and video becomes
 * the only modality, the Prompt Builder architecture must not change." The
 * registry resolves by provider + asset type, so switching modalities only
 * requires registering formatters for the new asset type.
 */

import type { AssetType } from '../../types/generation';
import type { PromptFormatter } from './types';
import { defaultPromptFormatter } from './formatter';

/**
 * Registry key — composite of provider name and asset type.
 */
type RegistryKey = `${string}:${string}`;

function makeKey(providerName: string, assetType: AssetType): RegistryKey {
  return `${providerName}:${assetType}`;
}

const registry = new Map<RegistryKey, PromptFormatter>();

/**
 * Register a provider- and modality-specific formatter.
 * If a formatter with the same provider + asset type is already registered,
 * it is replaced. This allows hot-swapping formatters at runtime (e.g. tests).
 */
export function registerFormatter(formatter: PromptFormatter): void {
  registry.set(makeKey(formatter.providerName, formatter.assetType), formatter);
}

/**
 * Unregister a formatter by provider name and asset type.
 */
export function unregisterFormatter(providerName: string, assetType: AssetType): void {
  registry.delete(makeKey(providerName, assetType));
}

/**
 * Resolve the formatter for a given provider name and asset type.
 *
 * Resolution order:
 * 1. Exact match: provider + asset type
 * 2. Default neutral formatter
 *
 * If a provider-specific formatter is registered for the exact provider +
 * asset type combination, it is returned. If not, the default neutral
 * formatter is returned — the Prompt Builder always has a formatter to call.
 *
 * @returns The formatter and whether it is the default.
 */
export function resolveFormatter(
  providerName?: string,
  assetType?: AssetType,
): {
  formatter: PromptFormatter;
  isDefault: boolean;
} {
  if (providerName && assetType) {
    const registered = registry.get(makeKey(providerName, assetType));
    if (registered) {
      return { formatter: registered, isDefault: false };
    }
  }
  return { formatter: defaultPromptFormatter, isDefault: true };
}

/**
 * List all registered provider + asset type combinations.
 * Returns strings in "provider:assetType" format.
 */
export function getRegisteredProviders(): string[] {
  return [...registry.keys()];
}

/**
 * Clear all registered formatters. Primarily for testing.
 */
export function clearRegistry(): void {
  registry.clear();
}
