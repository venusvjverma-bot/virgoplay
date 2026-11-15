/**
 * Mini Prompt Builder — deterministic prompt generation for Customize AI.
 *
 * Converts structured appearance field selections into a single prompt string
 * using field-to-text mappings and a controlled template with fixed
 * platform-controlled visual foundation instructions.
 *
 * No LLM. No external API. Pure project logic.
 */

import type { MyAiAppearance } from './types';

/**
 * Maps the short Ethnicity UI labels to the full descriptive phrase inserted
 * into the generated prompt. Legacy values that are no longer in the dropdown
 * fall through to the default `{value}` template.
 */
const ETHNICITY_PROMPT_MAP: Record<string, string> = {
  'White / European': 'refined European fashion-model-inspired beauty styling, sophisticated contemporary European editorial aesthetic, elegant balanced facial proportions, naturally defined facial features, softly structured jawline, refined natural nose, naturally shaped lips, clear natural complexion',
  'Japanese': 'refined Japanese J-pop artist-inspired beauty styling, sophisticated contemporary Japanese fashion and beauty aesthetic, delicate balanced facial proportions, naturally defined facial features, softly defined jawline, refined natural nose, naturally shaped lips, clear luminous complexion',
  'South Korean': 'refined Korean-inspired facial styling, polished contemporary Korean beauty aesthetic, delicate balanced facial proportions, softly defined jawline, refined nose, naturally full lips, clear luminous complexion, sophisticated contemporary Korean beauty styling',
  'Indian': 'refined North Indian-inspired beauty styling, sophisticated contemporary Indian beauty aesthetic, elegant balanced facial proportions, naturally defined facial features, softly structured jawline, refined natural nose, naturally shaped lips, clear luminous complexion',
  'Southeast Asian': 'refined Southeast Asian entertainment-artist-inspired beauty styling, sophisticated contemporary Southeast Asian fashion and beauty aesthetic, elegant balanced facial proportions, naturally defined facial features, softly defined jawline, refined natural nose, naturally shaped lips, clear natural complexion',
  'Central Asian': 'refined Central Asian fashion-model-inspired beauty styling, sophisticated contemporary Central Asian fashion and beauty aesthetic, elegant balanced facial proportions, naturally defined facial features, softly structured jawline, refined natural nose, naturally shaped lips, clear natural complexion',
  'Middle Eastern': 'refined Middle Eastern fashion-model-inspired beauty styling, sophisticated contemporary Middle Eastern fashion and beauty aesthetic, elegant balanced facial proportions, naturally defined facial features, softly structured jawline, refined natural nose, naturally shaped lips, clear luminous complexion',
  'Sub-Saharan African': 'refined African fashion-model-inspired beauty styling, sophisticated contemporary Sub-Saharan African fashion and beauty aesthetic, elegant balanced facial proportions, naturally defined facial features, naturally structured jawline, refined natural nose, naturally shaped lips, clear natural complexion',
  'Latin American': 'refined Latin American-inspired beauty styling, sophisticated contemporary Latin American beauty aesthetic, elegant balanced facial proportions, naturally defined facial features, softly structured jawline, refined natural nose, naturally shaped lips, clear natural complexion',
};

/**
 * Maps the short Skin Tone UI labels to the full phrase inserted into the
 * generated prompt. Legacy values (e.g. "Olive", "Dark") that are no longer in
 * the dropdown fall through to the default `{value} skin` template.
 */
const SKIN_TONE_PROMPT_MAP: Record<string, string> = {
  'Very Fair': 'very fair skin with natural skin undertones',
  'Fair': 'fair skin with natural skin undertones',
  'Light': 'light skin with natural skin undertones',
  'Light-Medium': 'light-medium skin with natural skin undertones',
  'Medium': 'medium skin with natural skin undertones',
  'Tan': 'naturally tan skin with natural skin undertones',
  'Medium-Brown': 'medium-brown skin with natural skin undertones',
  'Brown': 'brown skin with natural skin undertones',
  'Deep Brown': 'deep brown skin with natural skin undertones',
  'Very Deep': 'very deep brown skin with natural skin undertones',
};

/**
 * Maps the short Hair Style UI labels to the full descriptive phrase inserted
 * into the generated prompt. Legacy values (e.g. "Pixie cut", "Curly") that are
 * no longer in the dropdown fall through to the default `{value} hair` template.
 */
const HAIR_STYLE_PROMPT_MAP: Record<string, string> = {
  'Long straight': 'long straight hair with detailed individual strands and natural volume, swept over the viewer-left shoulder and falling behind the shoulder',
  'Long wavy': 'long wavy hair with defined natural waves, detailed individual strands and natural volume, swept over the viewer-left shoulder and falling behind the shoulder',
  'Long curly': 'long curly hair with defined natural curls, detailed individual strands and natural volume, swept over the viewer-left shoulder and falling behind the shoulder',
  'Medium straight': 'medium-length straight hair with detailed individual strands and natural volume',
  'Medium wavy': 'medium-length wavy hair with defined natural waves, detailed individual strands and natural volume',
  'Short straight': 'short straight hair with detailed individual strands and natural texture',
  'Short curly': 'short curly hair with defined natural curls, detailed individual strands and natural texture',
  'Bob cut': 'short bob haircut with clean shaping, detailed individual strands and natural volume',
  'Ponytail': 'hair styled in a natural ponytail with detailed individual strands and realistic texture',
  'Braids': 'hair styled in detailed natural braids with defined individual strands and realistic texture',
};

/**
 * Maps the short Hair Colour UI labels to the full descriptive phrase inserted
 * into the generated prompt. Legacy values fall through to the default
 * `{value} hair` template.
 */
const HAIR_COLOR_PROMPT_MAP: Record<string, string> = {
  'Blonde': 'blonde hair with natural tonal variation, detailed individual strands and realistic texture',
  'Brunette': 'rich brunette hair with natural tonal variation, detailed individual strands and realistic texture',
  'Black': 'naturally black hair with subtle tonal variation, detailed individual strands and realistic texture',
  'Red': 'natural red hair with subtle tonal variation, detailed individual strands and realistic texture',
  'Auburn': 'rich auburn hair with natural copper-brown tonal variation, detailed individual strands and realistic texture',
  'Platinum': 'platinum blonde hair with subtle natural tonal variation, detailed individual strands and realistic texture',
};

/**
 * Maps the short Eye Colour UI labels to the full descriptive phrase inserted
 * into the generated prompt. Legacy values fall through to the default
 * `{value} eyes` template.
 */
const EYE_COLOR_PROMPT_MAP: Record<string, string> = {
  'Blue': 'natural blue eyes with detailed realistic iris texture and subtle color variation',
  'Brown': 'natural brown eyes with detailed realistic iris texture and subtle color variation',
  'Green': 'natural green eyes with detailed realistic iris texture and subtle color variation',
  'Hazel': 'natural hazel eyes with green-brown color variation and detailed realistic iris texture',
  'Grey': 'natural grey eyes with detailed realistic iris texture and subtle color variation',
  'Amber': 'natural amber eyes with warm golden-brown variation and detailed realistic iris texture',
};

/**
 * Maps the short Face Shape UI labels to the full descriptive phrase inserted
 * into the generated prompt. Legacy values fall through to the default
 * `{value}-shaped face` template.
 */
const FACE_SHAPE_PROMPT_MAP: Record<string, string> = {
  'Oval': 'oval-shaped face with balanced proportions and gently rounded contours',
  'Round': 'round-shaped face with soft, full contours and balanced proportions',
  'Square': 'square-shaped face with a defined jawline and balanced facial proportions',
  'Heart': 'heart-shaped face with a broader upper face and gently tapered chin',
  'Diamond': 'diamond-shaped face with defined cheekbones and a gently tapered forehead and chin',
  'Oblong': 'oblong-shaped face with balanced elongated proportions and a gently defined jawline',
};

/**
 * Fixed platform-controlled visual foundation prepended to every prompt.
 * These instructions are NOT creator-editable — they enforce a consistent
 * visual presentation across all Customize AI generations.
 */
const PLATFORM_FOUNDATION = [
  'fictional adult character',
  'ultra-realistic photographic style',
  '4K quality',
  'natural skin texture',
  'realistic skin pores',
  'subtle skin imperfections',
  'realistic facial details',
  'elegant beautiful face',
  'soft natural sensual expression',
  'looking directly at the camera',
  'detailed hair strands',
  'realistic lighting',
  'topless',
  'white velvet background',
  'half-portrait framing',
  'consistent visual presentation',
  'high quality, detailed, professional photography',
  'breasts must remain completely unobstructed by hair',
].join(', ');

/**
 * Build a deterministic prompt string from the creator's appearance selections.
 *
 * The prompt structure is:
 *   {platform foundation}, {age}-year-old {ethnicity} woman, {skin_tone} skin,
 *   {hair_color} {hair_style} hair, {eye_color} eyes, {body_type} {body_shape} figure,
 *   {breast_size} {breast_shape} breasts
 *
 * Empty fields are skipped. The platform foundation is always included.
 */
export function buildMyAiPrompt(appearance: MyAiAppearance): string {
  const parts: string[] = [PLATFORM_FOUNDATION];

  if (appearance.age) parts.push(`${appearance.age}-year-old`);
  if (appearance.ethnicity) parts.push(ETHNICITY_PROMPT_MAP[appearance.ethnicity] ?? appearance.ethnicity);
  if (appearance.ethnicity || appearance.age) parts.push('woman');

  if (appearance.skin_tone) {
    const skinPhrase = SKIN_TONE_PROMPT_MAP[appearance.skin_tone] ?? `${appearance.skin_tone} skin`;
    parts.push(skinPhrase);
  }
  if (appearance.hair_color) {
    parts.push(HAIR_COLOR_PROMPT_MAP[appearance.hair_color] ?? `${appearance.hair_color} hair`);
  }
  if (appearance.hair_style) {
    parts.push(HAIR_STYLE_PROMPT_MAP[appearance.hair_style] ?? `${appearance.hair_style} hair`);
  }
  if (appearance.eye_color) {
    parts.push(EYE_COLOR_PROMPT_MAP[appearance.eye_color] ?? `${appearance.eye_color} eyes`);
  }
  if (appearance.face_shape) {
    parts.push(FACE_SHAPE_PROMPT_MAP[appearance.face_shape] ?? `${appearance.face_shape}-shaped face`);
  }

  if (appearance.body_type || appearance.body_shape) {
    const bodyParts: string[] = [];
    if (appearance.body_type) bodyParts.push(appearance.body_type);
    if (appearance.body_shape) bodyParts.push(appearance.body_shape);
    parts.push(`${bodyParts.join(' ')} figure`);
  }

  if (appearance.breast_size || appearance.breast_shape) {
    const breastParts: string[] = [];
    if (appearance.breast_size) breastParts.push(appearance.breast_size);
    if (appearance.breast_shape) breastParts.push(appearance.breast_shape);
    parts.push(`${breastParts.join(' ')} breasts`);
  }

  return parts.filter(Boolean).join(', ');
}
