/**
 * Scene Generation Page
 *
 * Loads a saved Scene, inherits the Character's Identity, Prompt Schema,
 * Saved Prompt, and Generation Configuration from Character Studio, appends
 * the Scene's structured fields, and feeds the result into the existing
 * generation pipeline (generate-character-image edge function).
 *
 * Provider and tool are always inherited from the character.
 * Model, ratio, and batch_size are inherited unless the scene overrides them.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Image, Sparkles, Loader2, AlertCircle, CheckCircle,
  Wand2, Clapperboard, Lock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { MasterAiCharacterRow, GeneratedImageRow } from '../../types/character';
import type {
  CharacterRoleRow, RoleScenarioRow, ScenarioSceneRow,
} from '../../types/scene';
import { resolveInheritedGenerationConfig } from '../../types/scene';
import { buildScenePrompt } from '../../lib/scene-prompt-builder';

const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://osatedtxkkymvrodczlg.supabase.co';
const generateFnUrl = `${baseUrl}/functions/v1/generate-character-image`;

const SCENE_FIELD_KEYS = ['clothing', 'pose', 'expression', 'action', 'partner', 'camera_angle', 'lighting', 'atmosphere', 'extra_details'] as const;

const IDENTITY_FIELD_KEYS = new Set(['ethnicity', 'age', 'hair', 'face', 'skin_type', 'body', 'breasts', 'style']);

function extractSceneFields(scene: ScenarioSceneRow): string[] {
  const fields: string[] = [];
  for (const key of SCENE_FIELD_KEYS) {
    const val = scene[key as keyof ScenarioSceneRow];
    if (typeof val === 'string' && val.trim()) fields.push(val.trim());
  }
  if (scene.prompt_overrides) {
    for (const [key, val] of Object.entries(scene.prompt_overrides)) {
      if (IDENTITY_FIELD_KEYS.has(key)) continue;
      if (typeof val === 'string' && val.trim()) fields.push(val.trim());
    }
  }
  return fields;
}

export default function SceneGenerationPage() {
  const { creator } = useAuth();
  const [roles, setRoles] = useState<CharacterRoleRow[]>([]);
  const [scenarios, setScenarios] = useState<RoleScenarioRow[]>([]);
  const [scenes, setScenes] = useState<ScenarioSceneRow[]>([]);
  const [characters, setCharacters] = useState<MasterAiCharacterRow[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [images, setImages] = useState<GeneratedImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roleRes, charRes, imgRes] = await Promise.all([
        supabase.from('character_roles').select('*').order('sort_order', { ascending: true }),
        supabase.from('master_ai_characters').select('*').order('created_at', { ascending: false }),
        supabase.from('generated_images').select('*').order('created_at', { ascending: false }).limit(24),
      ]);

      if (roleRes.error) throw new Error(roleRes.error.message);
      if (charRes.error) throw new Error(charRes.error.message);
      setRoles((roleRes.data ?? []) as CharacterRoleRow[]);
      setCharacters((charRes.data ?? []) as MasterAiCharacterRow[]);
      if (imgRes.data) setImages((imgRes.data as GeneratedImageRow[]) ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedRoleId) { setScenarios([]); return; }
    supabase.from('role_scenarios').select('*').eq('role_id', selectedRoleId).order('sort_order', { ascending: true })
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); return; }
        setScenarios((data ?? []) as RoleScenarioRow[]);
      });
    setSelectedScenarioId('');
    setSelectedSceneId('');
    setScenes([]);
  }, [selectedRoleId]);

  useEffect(() => {
    if (!selectedScenarioId) { setScenes([]); return; }
    supabase.from('scenario_scenes').select('*').eq('scenario_id', selectedScenarioId).order('sort_order', { ascending: true })
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); return; }
        setScenes((data ?? []) as ScenarioSceneRow[]);
      });
    setSelectedSceneId('');
  }, [selectedScenarioId]);

  const selectedRole = roles.find(r => r.id === selectedRoleId);
  const selectedScenario = scenarios.find(s => s.id === selectedScenarioId);
  const selectedScene = scenes.find(s => s.id === selectedSceneId);
  const selectedChar = characters.find(c => c.id === selectedRole?.character_id);

  useEffect(() => {
    if (!selectedScene || !selectedChar) { setPreviewPrompt(''); return; }
    const sceneFields = extractSceneFields(selectedScene);
    const result = buildScenePrompt({
      savedPrompt: selectedChar.saved_prompt?.input?.positive_prompt ?? null,
      sceneFields,
      faceLockValue: selectedScene.face_lock_value,
    });
    setPreviewPrompt(result.positivePrompt);
  }, [selectedSceneId, selectedScene, selectedChar]);

  async function handleGenerate() {
    setError('Scene generation has been retired. Use the Mother Creator V2 workflow instead.');
    return;
  }

  async function _handleGenerate() {
    if (!selectedScene || !selectedScenario || !selectedChar || !selectedRole) return;
    setGenerating(true);
    setError(null);
    try {
      const genConfig = resolveInheritedGenerationConfig(selectedChar, selectedScene);
      const sceneFields = extractSceneFields(selectedScene);
      const { positivePrompt } = buildScenePrompt({
        savedPrompt: selectedChar.saved_prompt?.input?.positive_prompt ?? null,
        sceneFields,
        faceLockValue: selectedScene.face_lock_value,
      });

      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(generateFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          character_id: selectedRole.character_id,
          save_as_identity: false,
          test_payload: {
            model: genConfig.model,
            positive_prompt: positivePrompt,
            ratio: genConfig.ratio,
            batch_size: genConfig.batch_size,
          },
          // Scenes use image_editor tool with the character's identity image as reference
          scene_generation: true,
          reference_image_url: selectedChar.identity_image_url,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

      setImages(prev => [{
        id: data.generation_id,
        creator_id: creator!.id,
        character_id: selectedRole.character_id,
        provider_name: data.provider_name,
        prompt_used: data.prompt_used,
        image_url: data.image_url,
        provider_image_id: data.provider_image_id,
        seed_used: data.seed_used,
        status: 'completed',
        created_at: new Date().toISOString(),
      }, ...prev]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Clapperboard className="w-5 h-5 text-primary-400" />
          <h1 className="text-xl font-semibold text-surface-100">Scene Generation</h1>
        </div>
        <p className="text-sm text-surface-500">
          Generate images from structured scenes using the ZenCreator Image Editor. Character identity, prompt schema, saved prompt, and generation config are inherited from Character Studio. The character's identity image is automatically attached as the reference image.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Drill-down selectors */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
          <Wand2 className="w-4 h-4 text-primary-400" />
          <h2 className="font-semibold text-surface-100 text-sm">Select Role → Scenario → Scene</h2>
        </div>

        {roles.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-surface-400">No roles created yet.</p>
            <p className="text-xs text-surface-600 mt-1">Create roles in the Role Studio first.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400">Role</label>
              <select value={selectedRoleId} onChange={e => setSelectedRoleId(e.target.value)} className="input-field text-sm">
                <option value="">Select a role…</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {selectedRoleId && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-surface-400">Scenario</label>
                <select value={selectedScenarioId} onChange={e => setSelectedScenarioId(e.target.value)} className="input-field text-sm">
                  <option value="">Select a scenario…</option>
                  {scenarios.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedScenarioId && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-surface-400">Scene</label>
                <select value={selectedSceneId} onChange={e => setSelectedSceneId(e.target.value)} className="input-field text-sm">
                  <option value="">Select a scene…</option>
                  {scenes.map(s => (
                    <option key={s.id} value={s.id}>{s.name || `Scene ${s.sort_order + 1}`}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Character identity reference — inherited, auto-attached as reference image */}
        {selectedChar && (
          <div className="flex items-center gap-3 pt-3 border-t border-surface-800">
            {selectedChar.identity_image_url && (
              <img src={selectedChar.identity_image_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-surface-700" />
            )}
            <div className="text-xs text-surface-500 space-y-0.5">
              <div className="flex items-center gap-1 text-accent-400"><CheckCircle className="w-3 h-3" />Character Identity: {selectedChar.name}</div>
              <div>Identity image is automatically attached as the reference image. No manual upload needed.</div>
            </div>
          </div>
        )}

        {/* Inherited generation config */}
        {selectedScene && selectedChar && (
          <div className="pt-3 border-t border-surface-800 space-y-1">
            <div className="text-xs font-semibold text-surface-300 flex items-center gap-1.5">
              <Lock className="w-3 h-3" />Generation Config (inherited{selectedScene.override_gen_model || selectedScene.override_gen_ratio || selectedScene.override_gen_batch_size ? ' + overrides' : ''})
            </div>
            {(() => {
              const cfg = resolveInheritedGenerationConfig(selectedChar, selectedScene);
              return (
                <div className="text-xs text-surface-500 grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div>Provider: <span className="text-surface-300">{cfg.provider || '—'}</span></div>
                  <div>Tool: <span className="text-surface-300">{cfg.tool}</span></div>
                  <div>Model: <span className="text-surface-300">{cfg.model || '—'}</span> {cfg.modelOverridden && <span className="text-accent-400 text-[10px]">(override)</span>}</div>
                  <div>Ratio: <span className="text-surface-300">{cfg.ratio || '—'}</span> {cfg.ratioOverridden && <span className="text-accent-400 text-[10px]">(override)</span>}</div>
                  <div>Batch: <span className="text-surface-300">{cfg.batch_size}</span> {cfg.batchSizeOverridden && <span className="text-accent-400 text-[10px]">(override)</span>}</div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Prompt preview */}
        {previewPrompt && (
          <div className="space-y-1 pt-3 border-t border-surface-800">
            <label className="text-xs font-medium text-surface-400 flex items-center gap-1">
              <Wand2 className="w-3 h-3" />Prompt Preview
            </label>
            <div className="bg-surface-950 border border-surface-800 rounded-lg px-3 py-2 text-xs text-surface-300 font-mono leading-relaxed break-words">
              {previewPrompt}
            </div>
          </div>
        )}

        {/* Generate button */}
        {selectedScene && (
          <div className="flex items-center gap-3 pt-3 border-t border-surface-800">
            <button onClick={handleGenerate} disabled={generating} className="btn-primary gap-2">
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                : <><Sparkles className="w-4 h-4" />Generate Image</>}
            </button>
          </div>
        )}
      </div>

      {/* Image gallery */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Image className="w-4 h-4 text-primary-400" />
          <h2 className="font-semibold text-surface-100 text-sm">Generated Images</h2>
          <button onClick={load} className="ml-auto btn-secondary text-xs gap-1.5">Refresh</button>
        </div>
        {images.length === 0 ? (
          <div className="card text-center py-8">
            <Image className="w-8 h-8 text-surface-600 mx-auto mb-3" />
            <p className="text-sm text-surface-400">No images generated yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.map(img => (
              <div key={img.id} className="card overflow-hidden p-0 group relative">
                {img.image_url ? (
                  <img src={img.image_url} alt="Generated" className="w-full aspect-square object-cover" />
                ) : (
                  <div className="aspect-square flex items-center justify-center">
                    {img.status === 'pending'
                      ? <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
                      : <AlertCircle className="w-5 h-5 text-danger-400" />}
                  </div>
                )}
                <div className="p-2 text-xs text-surface-500">
                  <div className="truncate">{img.provider_name}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
