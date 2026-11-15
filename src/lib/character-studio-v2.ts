/**
 * Character Studio V2 — data access layer
 *
 * Encapsulates the internal data path for Development View ON/OFF mode.
 * The visible studio UI stays the same; this module prepares the data
 * capabilities that a future OFF-mode view will consume.
 *
 * Rules enforced here:
 *  - Only test.test@gmail.com can use Development View ON/OFF.
 *  - All other accounts are forced to devMode = false (OFF).
 *  - Image URLs are never hardcoded — they come from the character's
 *    identity_image_url / identity_asset_id stored in the database.
 *
 * ── Development View modes ───────────────────────────────────────────────
 *
 * ON  (test.test@gmail.com only):
 *   Current Character Studio V2 management UI — V-cards, edit, bio,
 *   status, identity image, Set as Selected.
 *
 * OFF (future client selection experience):
 *   - Only Active characters are shown.
 *   - Character visual = identity_image_url / identity_asset_id.
 *   - Name and bio come from the same character record.
 *   - Swipe left/right changes character.
 *   - Footer dots show position.
 *   - Swipe up opens bio of current character.
 *   - Transparent Select button calls the same reusable setSelected logic.
 *   - Selected character stays linked by character_id.
 *
 * ── Role flow (after character is selected) ──────────────────────────────
 *
 *   - Go to role selection on the same page style.
 *   - Roles appear as transparent boxes.
 *   - No left/right swipe for roles — vertical continuous list only.
 *   - Selected character image may be used as faded background.
 *
 * ── Account rule ────────────────────────────────────────────────────────
 *
 *   - test.test@gmail.com can use ON/OFF.
 *   - All other accounts forced OFF.
 *   - Other accounts never see the toggle.
 */

import { supabase } from './supabase';

const MOTHER_CREATOR_EMAIL = 'test.test@gmail.com';

export type CharacterStatus = 'draft' | 'active';

/** Minimal character shape consumed by a future OFF-mode view. */
export interface ActiveCharacterSummary {
  character_id: string;
  name: string;
  bio: string | null;
  identity_image_url: string | null;
  identity_asset_id: string | null;
}

/** Full row shape (used by the existing ON-mode studio UI). */
export interface CharacterV2Row {
  id: string;
  creator_id: string;
  name: string;
  bio: string | null;
  status: CharacterStatus;
  is_my_ai: boolean;
  is_selected: boolean;
  sort_order: number;
  identity_image_url: string | null;
  identity_asset_id: string | null;
  age: number | null;
  country: string | null;
  my_ai_prompt: string | null;
  my_ai_gen_model: string | null;
  my_ai_gen_ratio: string | null;
  my_ai_gen_num_images: number | null;
  my_ai_gen_output_format: string | null;
  my_ai_gen_thinking: string | null;
  my_ai_gen_prompt_optimization_mode: string | null;
  my_ai_image_url: string | null;
  my_ai_image_asset_id: string | null;
  my_ai_image_status: string | null;
  is_customize_ai: boolean;
  customize_ai_gen_model: string | null;
  customize_ai_gen_ratio: string | null;
  customize_ai_gen_num_images: number | null;
  customize_ai_gen_output_format: string | null;
  customize_ai_gen_thinking: string | null;
  customize_ai_gen_prompt_optimization_mode: string | null;
  created_at: string;
  updated_at: string;
}

/** My AI generation configuration values (mirrors Role Image Production). */
export interface MyAiGenConfig {
  prompt: string;
  model: string;
  ratio: string;
  num_images: number;
  output_format: string | null;
  thinking: string | null;
  prompt_optimization_mode: string | null;
  image_url: string | null;
  image_asset_id: string | null;
  image_status: string;
}

/** Default My AI config values — match Role Studio defaults. */
export const DEFAULT_MY_AI_CONFIG: MyAiGenConfig = {
  prompt: '',
  model: 'FLUX_KLEIN_NSFW',
  ratio: '9:16',
  num_images: 1,
  output_format: null,
  thinking: null,
  prompt_optimization_mode: null,
  image_url: null,
  image_asset_id: null,
  image_status: '',
};

/** Loads the My AI generation config for the given character row. */
export function readMyAiConfig(row: CharacterV2Row): MyAiGenConfig {
  return {
    prompt: row.my_ai_prompt ?? '',
    model: row.my_ai_gen_model ?? 'FLUX_KLEIN_NSFW',
    ratio: row.my_ai_gen_ratio ?? '9:16',
    num_images: row.my_ai_gen_num_images ?? 1,
    output_format: row.my_ai_gen_output_format ?? null,
    thinking: row.my_ai_gen_thinking ?? null,
    prompt_optimization_mode: row.my_ai_gen_prompt_optimization_mode ?? null,
    image_url: row.my_ai_image_url ?? null,
    image_asset_id: row.my_ai_image_asset_id ?? null,
    image_status: row.my_ai_image_status ?? '',
  };
}

/** Persists the My AI generation config to the character_studio_v2 row. */
export async function saveMyAiConfig(
  characterId: string,
  config: Pick<MyAiGenConfig, 'prompt' | 'model' | 'ratio' | 'num_images' | 'output_format' | 'thinking' | 'prompt_optimization_mode'>,
): Promise<void> {
  const { error } = await supabase
    .from('character_studio_v2')
    .update({
      my_ai_prompt: config.prompt,
      my_ai_gen_model: config.model,
      my_ai_gen_ratio: config.ratio,
      my_ai_gen_num_images: config.num_images,
      my_ai_gen_output_format: config.output_format,
      my_ai_gen_thinking: config.thinking,
      my_ai_gen_prompt_optimization_mode: config.prompt_optimization_mode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', characterId);
  if (error) throw new Error(error.message);
}

/** Copies a generated My AI image into the V-card avatar (identity_image_url). */
export async function setMyAiAvatar(
  characterId: string,
  imageUrl: string,
): Promise<void> {
  const { error } = await supabase
    .from('character_studio_v2')
    .update({
      identity_image_url: imageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', characterId);
  if (error) throw new Error(error.message);
}

/** Updates the My AI preview image metadata after a generation completes. */
export async function updateMyAiPreview(
  characterId: string,
  imageUrl: string,
  assetId: string | null,
  status: string,
): Promise<void> {
  const { error } = await supabase
    .from('character_studio_v2')
    .update({
      my_ai_image_url: imageUrl,
      my_ai_image_asset_id: assetId,
      my_ai_image_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', characterId);
  if (error) throw new Error(error.message);
}

/**
 * Returns true if the given email belongs to the Mother Creator who is
 * allowed to toggle Development View. All other accounts are forced OFF.
 */
export function canUseDevMode(email: string | undefined | null): boolean {
  return email === MOTHER_CREATOR_EMAIL;
}

/**
 * Reads the persisted `dev_mode` setting for the account.
 *
 * - For test.test@gmail.com: returns the value stored in
 *   character_studio_v2_settings (defaults to true if no row yet).
 * - For every other account: returns false (forced OFF).
 */
export async function readDevMode(
  creatorId: string | undefined | null,
  email: string | undefined | null,
): Promise<boolean> {
  if (!canUseDevMode(email)) return false;
  if (!creatorId) return false;

  const { data, error } = await supabase
    .from('character_studio_v2_settings')
    .select('dev_mode')
    .eq('creator_id', creatorId)
    .maybeSingle();

  if (error || !data) return false; // default OFF
  return data.dev_mode;
}

/**
 * Persists the `dev_mode` setting. Only call this for the Mother Creator.
 */
export async function writeDevMode(
  creatorId: string,
  devMode: boolean,
): Promise<void> {
  await supabase
    .from('character_studio_v2_settings')
    .upsert({ creator_id: creatorId, dev_mode: devMode }, { onConflict: 'creator_id' });
}

/**
 * Reads the persisted `child_creator_mode` setting for the account.
 * Returns `true` (default ON) when no row exists yet — matching the
 * existing default-ON behavior at login.
 */
export async function readChildCreatorMode(
  creatorId: string | undefined | null,
): Promise<boolean> {
  if (!creatorId) return true;

  const { data, error } = await supabase
    .from('character_studio_v2_settings')
    .select('child_creator_mode')
    .eq('creator_id', creatorId)
    .maybeSingle();

  if (error || !data) return true; // default ON
  return data.child_creator_mode;
}

/**
 * Persists the `child_creator_mode` setting for the account.
 */
export async function writeChildCreatorMode(
  creatorId: string,
  childCreatorMode: boolean,
): Promise<void> {
  await supabase
    .from('character_studio_v2_settings')
    .upsert({ creator_id: creatorId, child_creator_mode: childCreatorMode }, { onConflict: 'creator_id' });
}

/**
 * Loads ALL characters for the account (both draft and active), ordered
 * the same way the existing ON-mode studio grid expects. This is the
 * data path used when Development View is ON.
 */
export async function loadAllCharacters(
  creatorId: string,
): Promise<CharacterV2Row[]> {
  const { data, error } = await supabase
    .from('character_studio_v2')
    .select('*')
    .order('is_my_ai', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CharacterV2Row[];
}

/**
 * Loads ONLY active characters for the account, projected to the minimal
 * summary shape a future OFF-mode view will consume:
 *   character_id, name, bio, identity_image_url, identity_asset_id.
 *
 * The identity image is the single source of the character's visual —
 * no hardcoded URLs, no generation pipeline involvement.
 */
export async function loadActiveCharacters(
  _creatorId: string,
): Promise<ActiveCharacterSummary[]> {
  // No creator_id filter — RLS policies determine visibility:
  // Mother Creator sees own characters; verified Child Creators see
  // the Mother Creator's characters via csv2_select_master_for_verified.
  const { data, error } = await supabase
    .from('character_studio_v2')
    .select('id, name, bio, identity_image_url, identity_asset_id')
    .eq('status', 'active')
    .order('is_my_ai', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: {
    id: string;
    name: string;
    bio: string | null;
    identity_image_url: string | null;
    identity_asset_id: string | null;
  }): ActiveCharacterSummary => ({
    character_id: row.id,
    name: row.name,
    bio: row.bio,
    identity_image_url: row.identity_image_url,
    identity_asset_id: row.identity_asset_id,
  }));
}

/**
 * Loads the currently Selected character for the calling account.
 *
 * Selection is per-account: each creator has a row in
 * `character_studio_v2_selections` pointing to a shared character.
 * RLS on that table ensures only the caller's own row is returned.
 *
 * Returns null if the caller has no selection yet.
 */
export async function loadSelectedCharacter(
  _creatorId: string,
): Promise<ActiveCharacterSummary | null> {
  const { data, error } = await supabase
    .from('character_studio_v2_selections')
    .select(`
      character_id,
      character:character_studio_v2 (
        id, name, bio, identity_image_url, identity_asset_id
      )
    `)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || !data.character) return null;

  const c = data.character as unknown as {
    id: string;
    name: string;
    bio: string | null;
    identity_image_url: string | null;
    identity_asset_id: string | null;
  };

  // For shared My AI characters, a Child Creator may have their own override
  // image (uploaded or generated). When they have chosen one via Keep or
  // Generate→Select, that selected_image_url must be the image surfaced to
  // Role Studio — not the Mother Creator's identity_image_url.
  let effectiveImageUrl = c.identity_image_url;
  let effectiveAssetId = c.identity_asset_id;
  try {
    const override = await loadMyAiOverride(c.id);
    if (override?.selected_image_url) {
      effectiveImageUrl = override.selected_image_url;
      effectiveAssetId = override.selected_image_url;
    }
  } catch {
    // RLS may block the query for some roles; fall back to the shared image.
  }

  return {
    character_id: c.id,
    name: c.name,
    bio: c.bio,
    identity_image_url: effectiveImageUrl,
    identity_asset_id: effectiveAssetId,
  };
}

/**
 * Loads the selected character ID for the calling account.
 * Used by the ON-mode studio UI to highlight which character is selected
 * without reading the full character row.
 */
export async function loadSelectedCharacterId(
  _creatorId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('character_studio_v2_selections')
    .select('character_id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.character_id ?? null;
}

/**
 * Reusable "Set as Selected" action — wraps the existing
 * set_selected_character_v2 RPC so both ON-mode and future OFF-mode
 * code can call it without duplicating logic.
 *
 * Only active characters may be set as selected (enforced by the RPC).
 */
export async function setSelectedCharacter(
  characterId: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_selected_character_v2', {
    p_character_id: characterId,
  });
  if (error) throw new Error(error.message);
}

// ── Character Videos (character-level) ──────────────────────────────────────

export interface CharacterVideoRow {
  id: string;
  character_id: string;
  creator_id: string;
  video_url: string;
  video_path: string;
  duration_seconds: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const CHARACTER_VIDEOS_BUCKET = 'character_videos';

export async function loadCharacterVideos(
  characterId: string,
): Promise<CharacterVideoRow[]> {
  const { data, error } = await supabase
    .from('character_videos')
    .select('*')
    .eq('character_id', characterId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CharacterVideoRow[];
}

export async function uploadCharacterVideo(
  characterId: string,
  creatorId: string,
  file: File,
  durationSeconds?: number,
): Promise<CharacterVideoRow> {
  const ext = file.name.split('.').pop() ?? 'mp4';
  const path = `${creatorId}/${characterId}-${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(CHARACTER_VIDEOS_BUCKET)
    .upload(path, file, { upsert: true });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: urlData } = supabase.storage
    .from(CHARACTER_VIDEOS_BUCKET)
    .getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { data, error: insertErr } = await supabase
    .from('character_videos')
    .insert({
      character_id: characterId,
      creator_id: creatorId,
      video_url: publicUrl,
      video_path: path,
      duration_seconds: durationSeconds ?? null,
    })
    .select()
    .single();
  if (insertErr) throw new Error(insertErr.message);
  return data as CharacterVideoRow;
}

export async function replaceCharacterVideo(
  videoId: string,
  characterId: string,
  creatorId: string,
  oldPath: string | null,
  file: File,
  durationSeconds?: number,
): Promise<CharacterVideoRow> {
  const ext = file.name.split('.').pop() ?? 'mp4';
  const path = `${creatorId}/${characterId}-${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(CHARACTER_VIDEOS_BUCKET)
    .upload(path, file, { upsert: true });
  if (uploadErr) throw new Error(uploadErr.message);

  if (oldPath) {
    await supabase.storage.from(CHARACTER_VIDEOS_BUCKET).remove([oldPath]);
  }

  const { data: urlData } = supabase.storage
    .from(CHARACTER_VIDEOS_BUCKET)
    .getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { data, error: updateErr } = await supabase
    .from('character_videos')
    .update({
      video_url: publicUrl,
      video_path: path,
      duration_seconds: durationSeconds ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', videoId)
    .select()
    .single();
  if (updateErr) throw new Error(updateErr.message);
  return data as CharacterVideoRow;
}

export async function deleteCharacterVideo(
  videoId: string,
  videoPath: string | null,
): Promise<void> {
  if (videoPath) {
    await supabase.storage.from(CHARACTER_VIDEOS_BUCKET).remove([videoPath]);
  }
  const { error } = await supabase
    .from('character_videos')
    .delete()
    .eq('id', videoId);
  if (error) throw new Error(error.message);
}

// ── Role Studio: per-account role selection ─────────────────────────────────

/**
 * Loads the currently selected role ID for the calling account from
 * `character_role_selections`. Returns null if no role is selected.
 *
 * Selection is per-account — each creator has one row pointing to a shared
 * `character_roles` row. RLS ensures only the caller's own row is returned.
 */
export async function loadSelectedRoleId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('character_role_selections')
    .select('role_id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.role_id ?? null;
}

/**
 * Sets the selected role for the calling account by upserting into
 * `character_role_selections`. Does NOT modify the shared `character_roles`
 * row — selection is strictly per-account.
 */
export async function setSelectedRole(roleId: string): Promise<void> {
  const { error } = await supabase
    .from('character_role_selections')
    .upsert({ role_id: roleId }, { onConflict: 'creator_id' });
  if (error) throw new Error(error.message);
}

// ── Role Studio: per-account role image productions ────────────────────────

export interface RoleImageProductionRow {
  id: string;
  creator_id: string;
  role_id: string;
  role_image_url: string | null;
  role_image_path: string | null;
  role_image_asset_id: string | null;
  role_image_status: string;
  role_image_generation_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Loads the per-account role image production row for the given role.
 * Returns null if the caller has not yet generated an image for this role.
 */
export async function loadRoleImageProduction(
  roleId: string,
): Promise<RoleImageProductionRow | null> {
  const { data, error } = await supabase
    .from('role_image_productions')
    .select('*')
    .eq('role_id', roleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RoleImageProductionRow | null) ?? null;
}

/**
 * Loads all per-account role image production rows for the calling account.
 * Used to populate role cards with the caller's own generated images.
 */
export async function loadAllRoleImageProductions(): Promise<RoleImageProductionRow[]> {
  const { data, error } = await supabase
    .from('role_image_productions')
    .select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as RoleImageProductionRow[];
}

// ── Child Creator My AI overrides ───────────────────────────────────────────

const MY_AI_OVERRIDE_BUCKET = 'character_identities_v2';

export interface MyAiOverrideRow {
  creator_id: string;
  character_id: string;
  image_url: string;
  image_path: string | null;
  generated_image_url: string | null;
  generated_image_status: string | null;
  generated_generation_id: string | null;
  selected_image_url: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Loads the calling creator's own My AI image override for the given
 * shared My AI character. Returns null if the creator has not uploaded
 * their own image yet.
 */
export async function loadMyAiOverride(
  characterId: string,
): Promise<MyAiOverrideRow | null> {
  const { data, error } = await supabase
    .from('character_studio_v2_my_ai_overrides')
    .select('*')
    .eq('character_id', characterId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MyAiOverrideRow | null) ?? null;
}

/**
 * Uploads a Child Creator's own image as their My AI override and
 * upserts the override row. Returns the public URL of the uploaded image.
 */
export async function uploadMyAiOverrideImage(
  characterId: string,
  file: File,
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const creatorId = userData.user?.id;
  if (!creatorId) throw new Error('Not authenticated');

  const ext = file.name.split('.').pop() ?? 'png';
  const path = `${creatorId}/my-ai-${characterId}-${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(MY_AI_OVERRIDE_BUCKET)
    .upload(path, file, { upsert: true });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: urlData } = supabase.storage
    .from(MY_AI_OVERRIDE_BUCKET)
    .getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { error: upsertErr } = await supabase
    .from('character_studio_v2_my_ai_overrides')
    .upsert({
      creator_id: creatorId,
      character_id: characterId,
      image_url: publicUrl,
      image_path: path,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'creator_id,character_id' });
  if (upsertErr) throw new Error(upsertErr.message);

  return publicUrl;
}

/**
 * Updates the generated image fields on the Child Creator's My AI override
 * after a generation completes (or fails).
 */
export async function updateMyAiOverrideGenerated(
  characterId: string,
  imageUrl: string | null,
  status: string,
  generationId: string | null = null,
): Promise<void> {
  const { error } = await supabase
    .from('character_studio_v2_my_ai_overrides')
    .update({
      generated_image_url: imageUrl,
      generated_image_status: status,
      generated_generation_id: generationId,
      ...(imageUrl ? { selected_image_url: imageUrl } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('character_id', characterId);
  if (error) throw new Error(error.message);
}

/**
 * Marks the given generated image as the Child Creator's active My AI
 * identity image (the "selected" state). This is the Child Creator's
 * own data — the Mother Creator's row is never touched.
 */
export async function selectMyAiOverrideImage(
  characterId: string,
  imageUrl: string,
): Promise<void> {
  const { error } = await supabase
    .from('character_studio_v2_my_ai_overrides')
    .update({
      selected_image_url: imageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('character_id', characterId);
  if (error) throw new Error(error.message);
}

/**
 * Deletes the Child Creator's entire My AI override — uploaded reference,
 * generated candidate, and selected image — returning My AI to the
 * empty state. Also removes the uploaded file from storage.
 */
export async function deleteMyAiOverride(
  characterId: string,
): Promise<void> {
  // Load the override to get the storage path for cleanup
  const { data: override } = await supabase
    .from('character_studio_v2_my_ai_overrides')
    .select('image_path')
    .eq('character_id', characterId)
    .maybeSingle();

  if (override?.image_path) {
    await supabase.storage
      .from(MY_AI_OVERRIDE_BUCKET)
      .remove([override.image_path]);
  }

  const { error } = await supabase
    .from('character_studio_v2_my_ai_overrides')
    .delete()
    .eq('character_id', characterId);
  if (error) throw new Error(error.message);
}

/**
 * Saves the Child Creator's custom display name for their My AI character.
 * Upserts into the override row, creating one if it doesn't exist yet.
 */
export async function saveMyAiDisplayName(
  characterId: string,
  displayName: string,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const creatorId = userData.user?.id;
  if (!creatorId) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('character_studio_v2_my_ai_overrides')
    .upsert({
      creator_id: creatorId,
      character_id: characterId,
      display_name: displayName.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'creator_id,character_id' });
  if (error) throw new Error(error.message);
}

// ── Customize AI ────────────────────────────────────────────────────────────

/** Customize AI generation configuration (stored on the shared slot row). */
export interface CustomizeAiGenConfig {
  model: string;
  ratio: string;
  num_images: number;
  output_format: string | null;
  thinking: string | null;
  prompt_optimization_mode: string | null;
}

export const DEFAULT_CUSTOMIZE_AI_CONFIG: CustomizeAiGenConfig = {
  model: 'FLUX_KLEIN_NSFW',
  ratio: '9:16',
  num_images: 1,
  output_format: null,
  thinking: null,
  prompt_optimization_mode: null,
};

/** Reads the Customize AI generation config from the shared slot row. */
export function readCustomizeAiConfig(row: CharacterV2Row): CustomizeAiGenConfig {
  return {
    model: row.customize_ai_gen_model ?? 'FLUX_KLEIN_NSFW',
    ratio: row.customize_ai_gen_ratio ?? '9:16',
    num_images: row.customize_ai_gen_num_images ?? 1,
    output_format: row.customize_ai_gen_output_format ?? null,
    thinking: row.customize_ai_gen_thinking ?? null,
    prompt_optimization_mode: row.customize_ai_gen_prompt_optimization_mode ?? null,
  };
}

/** Persists the Customize AI generation config to the shared slot row. */
export async function saveCustomizeAiConfig(
  characterId: string,
  config: CustomizeAiGenConfig,
): Promise<void> {
  const { error } = await supabase
    .from('character_studio_v2')
    .update({
      customize_ai_gen_model: config.model,
      customize_ai_gen_ratio: config.ratio,
      customize_ai_gen_num_images: config.num_images,
      customize_ai_gen_output_format: config.output_format,
      customize_ai_gen_thinking: config.thinking,
      customize_ai_gen_prompt_optimization_mode: config.prompt_optimization_mode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', characterId);
  if (error) throw new Error(error.message);
}

/** Per-creator Customize AI override row. */
export interface CustomizeAiOverrideRow {
  creator_id: string;
  character_id: string;
  appearance_data: Record<string, string> | null;
  generated_prompt: string | null;
  generated_image_url: string | null;
  generated_image_status: string | null;
  generated_generation_id: string | null;
  selected_image_url: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Loads the calling creator's Customize AI override for the given slot. */
export async function loadCustomizeAiOverride(
  characterId: string,
): Promise<CustomizeAiOverrideRow | null> {
  const { data, error } = await supabase
    .from('customize_ai_overrides')
    .select('*')
    .eq('character_id', characterId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomizeAiOverrideRow | null) ?? null;
}

/** Saves the creator's appearance data and generated prompt to their override row. */
export async function saveCustomizeAiAppearance(
  characterId: string,
  appearanceData: Record<string, string>,
  generatedPrompt: string,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const creatorId = userData.user?.id;
  if (!creatorId) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('customize_ai_overrides')
    .upsert({
      creator_id: creatorId,
      character_id: characterId,
      appearance_data: appearanceData,
      generated_prompt: generatedPrompt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'creator_id,character_id' });
  if (error) throw new Error(error.message);
}

/**
 * Saves the creator's custom display name for their Customize AI character.
 * Upserts into the override row, creating one if it doesn't exist yet.
 */
export async function saveCustomizeAiDisplayName(
  characterId: string,
  displayName: string,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const creatorId = userData.user?.id;
  if (!creatorId) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('customize_ai_overrides')
    .upsert({
      creator_id: creatorId,
      character_id: characterId,
      display_name: displayName.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'creator_id,character_id' });
  if (error) throw new Error(error.message);
}

/** Updates the generated image fields on the creator's override after generation. */
export async function updateCustomizeAiGenerated(
  characterId: string,
  imageUrl: string | null,
  status: string,
  generationId: string | null = null,
): Promise<void> {
  const { error } = await supabase
    .from('customize_ai_overrides')
    .update({
      generated_image_url: imageUrl,
      generated_image_status: status,
      generated_generation_id: generationId,
      ...(imageUrl ? { selected_image_url: imageUrl } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('character_id', characterId);
  if (error) throw new Error(error.message);
}

/** Marks the given generated image as the creator's active Customize AI identity. */
export async function selectCustomizeAiImage(
  characterId: string,
  imageUrl: string,
): Promise<void> {
  const { error } = await supabase
    .from('customize_ai_overrides')
    .update({
      selected_image_url: imageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('character_id', characterId);
  if (error) throw new Error(error.message);
}

/** Clears all image and appearance data for the creator's Customize AI override. */
export async function removeCustomizeAiImage(
  characterId: string,
): Promise<void> {
  const { error } = await supabase
    .from('customize_ai_overrides')
    .update({
      generated_image_url: null,
      generated_image_status: 'Removed',
      generated_generation_id: null,
      selected_image_url: null,
      appearance_data: null,
      generated_prompt: null,
      updated_at: new Date().toISOString(),
    })
    .eq('character_id', characterId);
  if (error) throw new Error(error.message);
}
