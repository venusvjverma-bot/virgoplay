// ── Universal Prompt Schema (V1 — frozen field names) ─────────────────────────
// These 16 field names are the permanent V1 prompt architecture.
// Do NOT rename or remove them.

export const UNIVERSAL_PROMPT_FIELDS = [
  'ethnicity',
  'age',
  'hair',
  'face',
  'skin_type',
  'body',
  'breasts',
  'clothing',
  'pose',
  'expression',
  'action',
  'partner',
  'camera_angle',
  'style',
  'lighting',
  'atmosphere',
  'extra_details',
] as const;

export type UniversalPromptFieldName = typeof UNIVERSAL_PROMPT_FIELDS[number];

export type UniversalPromptSchema = Record<UniversalPromptFieldName, string>;

export function createEmptyPromptSchema(): UniversalPromptSchema {
  return {
    ethnicity: '',
    age: '',
    hair: '',
    face: '',
    skin_type: '',
    body: '',
    breasts: '',
    clothing: '',
    pose: '',
    expression: '',
    action: '',
    partner: '',
    camera_angle: '',
    style: '',
    lighting: '',
    atmosphere: '',
    extra_details: '',
  };
}

// ── Character Status ────────────────────────────────────────────────────────────

export type CharacterStatus = 'draft' | 'published' | 'archived';

// ── Database Row Types ─────────────────────────────────────────────────────────

export interface ProviderMetadata {
  provider_name: string;
  style: string;
  seed_used: number;
  gems_remaining: number | null;
  image_size: string;
  quality: string;
  restore_faces: boolean;
  request_endpoint: string;
  response_keys: string[];
  has_reusable_character_id: boolean;
  request_type: string;
  reference_image_sent: boolean;
}

export interface MasterAiCharacterRow {
  id: string;
  creator_id: string;
  name: string;
  prompt_schema: UniversalPromptSchema;
  is_active: boolean;
  identity_image_url: string | null;
  identity_image_path: string | null;
  identity_asset_id?: string | null;
  character_source?: 'master_ai_characters' | 'character_studio_v2';
  is_selected?: boolean;
  provider_character_id: string | null;
  provider_metadata: ProviderMetadata | null;
  identity_saved_at: string | null;
  status: CharacterStatus;
  saved_prompt: SavedPromptRequest | null;
  created_at: string;
  updated_at: string;
}

export interface SavedPromptRequest {
  tool: 'by_prompt';
  input: {
    model: string;
    positive_prompt: string;
    ratio: string;
    batch_size: number;
  };
}

export interface GeneratedImageRow {
  id: string;
  creator_id: string;
  character_id: string | null;
  provider_name: string;
  prompt_used: string;
  image_url: string | null;
  provider_image_id: string | null;
  seed_used: number | null;
  status: string;
  created_at: string;
}
