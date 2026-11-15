import type { UniversalPromptSchema } from '../../types/character';

export interface PromptBuilder {
  providerName: string;
  buildPrompt(schema: UniversalPromptSchema): string;
}

/**
 * Promptchan Prompt Builder
 *
 * Converts a Universal Prompt Schema into a natural-language prompt string
 * suitable for the Promptchan /api/external/create endpoint.
 *
 * The builder reads only the 16 approved Universal Prompt Schema fields.
 * It does not hardcode provider syntax beyond the comma-separated natural
 * language format Promptchan expects.
 */
export class PromptchanPromptBuilder implements PromptBuilder {
  providerName = 'Promptchan';

  buildPrompt(schema: UniversalPromptSchema): string {
    const parts: string[] = [];

    if (schema.ethnicity) parts.push(schema.ethnicity);
    if (schema.age) parts.push(schema.age);
    if (schema.hair) parts.push(schema.hair);
    if (schema.face) parts.push(schema.face);
    if (schema.skin_type) parts.push(schema.skin_type);
    if (schema.body) parts.push(schema.body);
    if (schema.breasts) parts.push(schema.breasts);
    if (schema.clothing) parts.push(`wearing ${schema.clothing}`);
    if (schema.pose) parts.push(schema.pose);
    if (schema.expression) parts.push(schema.expression);
    if (schema.action) parts.push(schema.action);
    if (schema.partner && schema.partner !== 'None') parts.push(`with ${schema.partner}`);
    if (schema.camera_angle) parts.push(schema.camera_angle);
    if (schema.style) parts.push(schema.style);
    if (schema.lighting) parts.push(schema.lighting);
    if (schema.atmosphere) parts.push(schema.atmosphere);
    if (schema.extra_details) parts.push(schema.extra_details);

    return parts.filter(Boolean).join(', ');
  }
}
