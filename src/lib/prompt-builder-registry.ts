import type { PromptBuilder } from './prompt-builders/promptchan';
import { PromptchanPromptBuilder } from './prompt-builders/promptchan';

/**
 * Prompt Builder Registry
 *
 * Maps provider names to their Prompt Builder implementations.
 * The registry is populated from the active provider configuration
 * at runtime — no provider name is hardcoded as a fallback.
 *
 * To add a new provider, implement the PromptBuilder interface and
 * register it here. The rest of the system calls `getPromptBuilder()`
 * and never needs to know which provider is active.
 */

const builderImplementations: Record<string, PromptBuilder> = {
  Promptchan: new PromptchanPromptBuilder(),
};

/**
 * Resolve the Prompt Builder for the active provider.
 * The provider name must come from provider_configurations (the source of truth).
 * If no provider is configured, returns null — the caller must handle this.
 */
export function getPromptBuilder(providerName: string): PromptBuilder | null {
  const builder = builderImplementations[providerName];
  return builder ?? null;
}

export function getAvailableProviders(): string[] {
  return Object.keys(builderImplementations);
}
