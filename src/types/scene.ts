// ── Role → Scenario → Scene Architecture ─────────────────────────────────
//
// Role Studio is a lightweight orchestration layer that inherits THREE
// immutable outputs from Character Studio:
//   1. saved_prompt.input.positive_prompt  (canonical identity string)
//   2. Generation configuration (model, ratio, batch_size)
//   3. Character reference image (identity_image_url → image_assets)
//
// Role Studio NEVER reads character.prompt_schema.
// Scene contributes only scene-specific field values + face_lock_value.

import type { MasterAiCharacterRow } from './character';

export interface CharacterRoleRow {
  id: string;
  creator_id: string;
  character_id: string;
  name: string;
  description: string;
  role_image_url: string | null;
  role_image_path: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  role_prompt: string;
  gen_tool: string;
  gen_model: string;
  gen_ratio: string;
  gen_number_of_images: number;
  role_image_asset_id: string | null;
  role_image_generation_id: string | null;
  role_image_status: string;
  system_prompt: string;
  gen_output_format: string;
  gen_thinking: string;
  gen_prompt_optimization_mode: string;
  introduction_title: string | null;
  introduction_body: string | null;
}

export interface RoleScenarioRow {
  id: string;
  creator_id: string;
  role_id: string;
  name: string;
  sort_order: number;
  default_clothing: string;
  default_environment: string;
  default_lighting: string;
  default_atmosphere: string;
  created_at: string;
  updated_at: string;
}

export interface ScenarioSceneRow {
  id: string;
  creator_id: string;
  scenario_id: string;
  name: string;
  sort_order: number;
  face_lock: boolean;
  face_lock_value: string | null;
  // Structured scene fields (legacy columns — kept for backward compat)
  clothing: string;
  pose: string;
  expression: string;
  action: string;
  partner: string;
  camera_angle: string;
  environment: string;
  lighting: string;
  atmosphere: string;
  extra_details: string;
  // Optional overrides — NULL means inherit from character
  override_gen_model: string | null;
  override_gen_ratio: string | null;
  override_gen_batch_size: number | null;
  // JSONB overrides for scene-specific fields only
  prompt_overrides: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

// ── Inherited Generation Config ──────────────────────────────────────────
// Model, ratio, batch_size come from saved_prompt.input (Character Studio).
// Scene overrides are optional.

export interface InheritedGenerationConfig {
  provider: string;
  tool: string;
  model: string;
  ratio: string;
  batch_size: number;
  modelOverridden: boolean;
  ratioOverridden: boolean;
  batchSizeOverridden: boolean;
}

export function resolveInheritedGenerationConfig(
  character: MasterAiCharacterRow,
  scene: ScenarioSceneRow,
): InheritedGenerationConfig {
  const saved = character.saved_prompt;
  const charModel = saved?.input.model ?? '';
  const charRatio = saved?.input.ratio ?? '';
  const charBatch = saved?.input.batch_size ?? 1;
  const provider = character.provider_metadata?.provider_name ?? '';

  return {
    provider,
    tool: 'image_editor',
    model: scene.override_gen_model ?? charModel,
    ratio: scene.override_gen_ratio ?? charRatio,
    batch_size: scene.override_gen_batch_size ?? charBatch,
    modelOverridden: scene.override_gen_model !== null,
    ratioOverridden: scene.override_gen_ratio !== null,
    batchSizeOverridden: scene.override_gen_batch_size !== null,
  };
}
