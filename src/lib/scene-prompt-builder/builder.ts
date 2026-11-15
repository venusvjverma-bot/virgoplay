/**
 * Scene Prompt Builder
 *
 * Final prompt = face_lock_value + Saved Character Prompt + Scene Fields
 *
 * Role Studio inherits THREE immutable outputs from Character Studio:
 *   1. saved_prompt.input.positive_prompt  (canonical identity string)
 *   2. Generation configuration (model, ratio, batch_size)
 *   3. Character reference image (identity_image_url → image_assets)
 *
 * Role Studio NEVER reads character.prompt_schema.
 * Scene contributes only scene-specific field values + face_lock_value.
 */

export interface ScenePromptRequest {
  /** The canonical identity prompt saved in Character Studio */
  savedPrompt: string | null;
  /** Scene-specific field values (clothing, pose, lighting, etc.) */
  sceneFields: string[];
  /** The face lock instruction selected for this scene (null = use default) */
  faceLockValue: string | null;
}

export interface ScenePromptResult {
  positivePrompt: string;
  faceLockPrompt: string;
  identityPrompt: string;
  sceneBody: string;
}

const DEFAULT_FACE_LOCK =
  'Keep the exact same face, body, hair and identity as the provided reference image.';

/**
 * Build the final scene prompt from three parts:
 *   1. face_lock_value (from scene dropdown, or default)
 *   2. Saved Character Prompt (immutable identity string from Character Studio)
 *   3. Scene-specific fields (comma-joined)
 */
export function buildScenePrompt(request: ScenePromptRequest): ScenePromptResult {
  const { savedPrompt, sceneFields, faceLockValue } = request;

  const faceLockPrompt = faceLockValue?.trim() || DEFAULT_FACE_LOCK;
  const identityPrompt = savedPrompt?.trim() || '';
  const sceneBody = sceneFields.filter(f => f.trim().length > 0).join(', ');

  const parts: string[] = [faceLockPrompt];
  if (identityPrompt) parts.push(identityPrompt);
  if (sceneBody) parts.push(sceneBody);

  return {
    positivePrompt: parts.join(' '),
    faceLockPrompt,
    identityPrompt,
    sceneBody,
  };
}
