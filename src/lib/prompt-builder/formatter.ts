/**
 * Prompt Builder Foundation V1 — Default Neutral Formatter
 *
 * A provider-neutral, modality-neutral default formatter that composes
 * creative sections into prompt channels using a simple, deterministic
 * format: comma-separated fragments grouped by section label.
 *
 * This formatter contains NO provider-specific wording and NO modality-specific
 * channel names. It produces a single channel named "prompt" containing all
 * sections, and if a "negative_prompt" section exists, a second channel named
 * "negative". Provider-specific formatters override this with their own
 * channel naming conventions.
 *
 * The format is:
 *   Channel "prompt": "Label1: fragment1, fragment2, Label2: fragment3, ..."
 *   Channel "negative": "fragment1, fragment2, ..." (if negative_prompt section exists)
 *
 * Sections with no fragments are omitted.
 */

import type {
  CreativeComposition,
  CreativeSection,
  PromptChannelOutput,
  PromptFormatter,
} from './types';

const DEFAULT_FORMATTER_NAME = '__default__';
const DEFAULT_FORMATTER_VERSION = '1.0.0';

/**
 * Default asset type for the neutral formatter. The default formatter is
 * modality-agnostic — it works for any asset type that doesn't have a
 * provider-specific formatter registered.
 */
const DEFAULT_ASSET_TYPE = 'image' as const;

function formatSection(section: CreativeSection): string | null {
  const fragments = section.fragments.filter(f => f.trim() !== '');
  if (fragments.length === 0) return null;
  return `${section.label}: ${fragments.join(', ')}`;
}

/**
 * The default neutral formatter. Produces a readable, provider-agnostic
 * prompt from the composition. No provider name is associated — it is
 * identified by the sentinel `__default__` name.
 *
 * Channel conventions:
 * - "prompt" — all non-negative sections joined by commas
 * - "negative" — fragments from the negative_prompt section (if present)
 */
export const defaultPromptFormatter: PromptFormatter = Object.freeze({
  providerName: DEFAULT_FORMATTER_NAME,
  assetType: DEFAULT_ASSET_TYPE,
  version: DEFAULT_FORMATTER_VERSION,

  format(composition: CreativeComposition): PromptChannelOutput {
    const channels = new Map<string, string>();
    const sectionParts: string[] = [];
    let negativeText: string | null = null;

    for (const [, section] of composition.sections) {
      if (section.type_code === 'negative_prompt') {
        const fragments = section.fragments.filter(f => f.trim() !== '');
        if (fragments.length > 0) {
          negativeText = fragments.join(', ');
        }
        continue;
      }
      const formatted = formatSection(section);
      if (formatted) sectionParts.push(formatted);
    }

    const prompt = sectionParts.join(', ');
    if (prompt) channels.set('prompt', prompt);
    if (negativeText) channels.set('negative', negativeText);

    return Object.freeze({ channels: Object.freeze(channels) }) as PromptChannelOutput;
  },
});

export function isDefaultFormatter(formatter: PromptFormatter): boolean {
  return formatter.providerName === DEFAULT_FORMATTER_NAME;
}
