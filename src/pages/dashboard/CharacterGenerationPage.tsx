import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Image, Sparkles, Loader2, AlertCircle, CheckCircle, Download,
  RefreshCw, ChevronRight, Shirt, Sun, MapPin, Smile, Wand2, FlaskConical,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { getPromptBuilder } from '../../lib/prompt-builder-registry';
import type { MasterAiCharacterRow, GeneratedImageRow, SavedPromptRequest } from '../../types/character';

const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://osatedtxkkymvrodczlg.supabase.co';
const generateFnUrl = `${baseUrl}/functions/v1/generate-character-image`;

export default function CharacterGenerationPage() {
  const { creator } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<MasterAiCharacterRow[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string>('');
  const [activeProvider, setActiveProvider] = useState<string>('');
  const [images, setImages] = useState<GeneratedImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState<string>('');

  // Scene override fields
  const [sceneOutfit, setSceneOutfit] = useState('');
  const [scenePose, setScenePose] = useState('');
  const [sceneLocation, setSceneLocation] = useState('');
  const [sceneLighting, setSceneLighting] = useState('');
  const [sceneExpression, setSceneExpression] = useState('');
  const [sceneExtra, setSceneExtra] = useState('');
  const [sceneNegative, setSceneNegative] = useState('');
  const [saveAsIdentity, setSaveAsIdentity] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [charRes, provRes, imgRes] = await Promise.all([
        supabase.from('master_ai_characters').select('*').order('created_at', { ascending: false }),
        supabase.from('provider_configurations').select('provider_name, is_active').eq('service_type', 'image').eq('is_active', true).maybeSingle(),
        supabase.from('generated_images').select('*').order('created_at', { ascending: false }).limit(24),
      ]);

      if (charRes.error) throw new Error(charRes.error.message);
      const chars = (charRes.data as MasterAiCharacterRow[]) ?? [];
      setCharacters(chars);

      const active = chars.find(c => c.is_active) ?? chars[0];
      const preselect = searchParams.get('char');
      const initialId = preselect && chars.find(c => c.id === preselect) ? preselect : active?.id ?? '';
      setSelectedCharId(initialId);

      if (provRes.data) setActiveProvider((provRes.data as { provider_name: string }).provider_name);

      if (imgRes.data) setImages((imgRes.data as GeneratedImageRow[]) ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => { load(); }, [load]);

  // Live prompt preview — uses saved prompt as canonical source, falls back to schema rebuild
  useEffect(() => {
    if (!selectedCharId) { setPreviewPrompt(''); return; }
    const c = characters.find(r => r.id === selectedCharId);
    if (!c) { setPreviewPrompt(''); return; }
    if (c.saved_prompt) {
      setPreviewPrompt(c.saved_prompt.input.positive_prompt);
      return;
    }
    try {
      if (!activeProvider) { setPreviewPrompt(''); return; }
      const builder = getPromptBuilder(activeProvider);
      if (!builder) { setPreviewPrompt(''); return; }
      setPreviewPrompt(builder.buildPrompt(c.prompt_schema));
    } catch {
      setPreviewPrompt('');
    }
  }, [selectedCharId, characters, activeProvider]);

  const [testGenerating, setTestGenerating] = useState(false);
  const [testLog, setTestLog] = useState<string[]>([]);

  async function handleTestGenerate() {
    setError('This generation tool has been retired. Use Character Studio V2 instead.');
    return;
  }

  async function _handleTestGenerate() {
    setTestGenerating(true);
    setError(null);
    setTestLog([]);
    const log: string[] = [];

    const addLog = (msg: string) => {
      log.push(`[${new Date().toISOString()}] ${msg}`);
      setTestLog([...log]);
    };

    try {
      const session = (await supabase.auth.getSession()).data.session;
      addLog('Request sent: POST /functions/v1/generate-character-image with test_payload');

      const res = await fetch(generateFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          character_id: selectedCharId || undefined,
          test_payload: {
            model: 'FLUX_KLEIN_NSFW',
            positive_prompt: 'Beautiful young East Asian woman with long wavy reddish-brown hair, elegant beautiful face, fair smooth skin. Completely nude, large full round natural breasts, curvy figure, slim waist, wide hips. She is in doggystyle position on all fours, being penetrated from behind by a muscular male partner. Side-rear camera angle, breasts hanging and bouncing, pleasure expression on her face. Soft warm lighting, erotic atmosphere, 85% photorealistic 15% light CGI polish, highly detailed',
            ratio: '9:16',
            batch_size: 1,
          },
        }),
      });

      addLog(`HTTP status: ${res.status}`);

      const data = await res.json();
      addLog(`Response: ${JSON.stringify(data).slice(0, 500)}`);

      if (!res.ok || data.error) {
        addLog(`FAILED at stage: ${data.failed_at_step ?? 'unknown'}`);
        addLog(`Error: ${data.error ?? `HTTP ${res.status}`}`);
        if (data.zencreator_response) addLog(`ZenCreator response: ${JSON.stringify(data.zencreator_response).slice(0, 300)}`);
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      addLog(`Generation ID: ${data.generation_id ?? 'N/A'}`);
      addLog(`Poll status: completed (edge function waited)`);
      addLog(`Result received: ${data.image_url ? 'image URL obtained' : 'no image URL'}`);
      addLog(`Image URL: ${data.image_url ?? 'N/A'}`);

      // Prepend the new image to the gallery
      setImages(prev => [{
        id: data.generation_id,
        creator_id: creator!.id,
        character_id: selectedCharId,
        provider_name: data.provider_name,
        prompt_used: data.prompt_used,
        image_url: data.image_url,
        provider_image_id: data.provider_image_id,
        seed_used: data.seed_used,
        status: 'completed',
        created_at: new Date().toISOString(),
      }, ...prev]);
    } catch (e) {
      addLog(`Exception: ${(e as Error).message}`);
      setError((e as Error).message);
    } finally {
      setTestGenerating(false);
    }
  }

  async function handleGenerate() {
    setError('This generation tool has been retired. Use Character Studio V2 instead.');
    return;
  }

  async function _handleGenerate() {
    if (!selectedCharId) return;
    setGenerating(true);
    setError(null);
    try {
      const c = characters.find(r => r.id === selectedCharId);
      const saved = c?.saved_prompt ?? null;
      const session = (await supabase.auth.getSession()).data.session;

      const sceneOverride = {
        outfit: sceneOutfit || undefined,
        pose: scenePose || undefined,
        location: sceneLocation || undefined,
        lighting: sceneLighting || undefined,
        expression: sceneExpression || undefined,
        extra_prompt: sceneExtra || undefined,
        negative_prompt: sceneNegative || undefined,
      };

      let body: Record<string, unknown>;
      if (saved) {
        const extraParts: string[] = [];
        if (sceneOutfit) extraParts.push(`wearing ${sceneOutfit}`);
        if (scenePose) extraParts.push(scenePose);
        if (sceneExpression) extraParts.push(sceneExpression);
        if (sceneLocation) extraParts.push(`in ${sceneLocation}`);
        if (sceneLighting) extraParts.push(sceneLighting);
        if (sceneExtra) extraParts.push(sceneExtra);
        const positivePrompt = extraParts.length
          ? `${saved.input.positive_prompt}, ${extraParts.join(', ')}`
          : saved.input.positive_prompt;

        body = {
          character_id: selectedCharId,
          save_as_identity: saveAsIdentity,
          test_payload: {
            model: saved.input.model,
            positive_prompt: positivePrompt,
            ratio: saved.input.ratio,
            batch_size: saved.input.batch_size,
            negative_prompt: sceneNegative || undefined,
          },
        };
      } else {
        body = {
          character_id: selectedCharId,
          save_as_identity: saveAsIdentity,
          scene_override: sceneOverride,
        };
      }

      const res = await fetch(generateFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Prepend the new image to the gallery
      setImages(prev => [{
        id: data.generation_id,
        creator_id: creator!.id,
        character_id: selectedCharId,
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

  const selectedChar = characters.find(c => c.id === selectedCharId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Image className="w-5 h-5 text-primary-400" />
            <h1 className="text-xl font-semibold text-surface-100">Character Image Generation</h1>
          </div>
          <p className="text-sm text-surface-500">
            Generate images from your Master AI Character using the active provider
            {activeProvider && <span className="text-primary-400 font-medium"> ({activeProvider})</span>}.
          </p>
        </div>
        <button onClick={() => navigate('/character-studio')} className="btn-secondary text-xs gap-1.5 flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5" />Edit Character
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Character selector */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
          <Sparkles className="w-4 h-4 text-primary-400" />
          <h2 className="font-semibold text-surface-100 text-sm">Select Character</h2>
        </div>
        {characters.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-surface-400 mb-3">No characters created yet.</p>
            <button onClick={() => navigate('/character-studio')} className="btn-primary gap-1.5">
              <ChevronRight className="w-3.5 h-3.5" />Create a Character
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <select
              value={selectedCharId}
              onChange={e => setSelectedCharId(e.target.value)}
              className="input-field">
              {characters.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.is_active ? ' (Active)' : ''}{c.identity_image_url ? ' — Identity' : ''}
                </option>
              ))}
            </select>
            {selectedChar?.identity_image_url && (
              <div className="flex items-center gap-3">
                <img src={selectedChar.identity_image_url} alt="Identity" className="w-16 h-16 rounded-lg object-cover border border-surface-700" />
                <div className="text-xs text-surface-500 space-y-0.5">
                  <div className="flex items-center gap-1 text-accent-400"><CheckCircle className="w-3 h-3" />Character Identity saved</div>
                  <div>Provider: {selectedChar.provider_metadata?.provider_name ?? '—'}</div>
                  <div>Reusable ID: {selectedChar.provider_character_id ?? 'None (this provider does not expose one)'}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scene overrides + generate */}
      {selectedChar && (
        <div className="card space-y-5">
          <div className="flex items-center gap-2 pb-4 border-b border-surface-800">
            <Wand2 className="w-4 h-4 text-primary-400" />
            <h2 className="font-semibold text-surface-100 text-sm">Scene Overrides (Optional)</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400 flex items-center gap-1"><Shirt className="w-3 h-3" />Outfit Override</label>
              <input value={sceneOutfit} onChange={e => setSceneOutfit(e.target.value)} placeholder="e.g. red evening gown" className="input-field text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400">Pose Override</label>
              <input value={scenePose} onChange={e => setScenePose(e.target.value)} placeholder="e.g. sitting on a park bench" className="input-field text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400 flex items-center gap-1"><MapPin className="w-3 h-3" />Location</label>
              <input value={sceneLocation} onChange={e => setSceneLocation(e.target.value)} placeholder="e.g. a rooftop terrace at sunset" className="input-field text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400 flex items-center gap-1"><Sun className="w-3 h-3" />Lighting</label>
              <input value={sceneLighting} onChange={e => setSceneLighting(e.target.value)} placeholder="e.g. dramatic cinematic lighting" className="input-field text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400 flex items-center gap-1"><Smile className="w-3 h-3" />Expression</label>
              <input value={sceneExpression} onChange={e => setSceneExpression(e.target.value)} placeholder="e.g. a warm smile" className="input-field text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400">Extra Prompt</label>
              <input value={sceneExtra} onChange={e => setSceneExtra(e.target.value)} placeholder="additional prompt text" className="input-field text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Negative Prompt</label>
            <input value={sceneNegative} onChange={e => setSceneNegative(e.target.value)} placeholder="e.g. blurry, distorted face, extra fingers" className="input-field text-sm" />
          </div>

          {/* Prompt preview */}
          {previewPrompt && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400">Generated Prompt (Preview)</label>
              <div className="bg-surface-950 border border-surface-800 rounded-lg px-3 py-2 text-xs text-surface-300 font-mono leading-relaxed break-words">
                {previewPrompt}
              </div>
            </div>
          )}

          {/* Save as identity toggle */}
          <div className="flex items-center gap-2 pt-2 border-t border-surface-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsIdentity}
                onChange={e => setSaveAsIdentity(e.target.checked)}
                className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-surface-300">Save as Character Identity</span>
            </label>
            <span className="text-xs text-surface-500">
              Locks this image as the canonical face for future generations
            </span>
          </div>

          {/* Generate button */}
          <div className="flex items-center gap-3">
            <button onClick={handleGenerate} disabled={generating} className="btn-primary gap-2">
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                : <><Sparkles className="w-4 h-4" />Generate Image</>}
            </button>
            <button onClick={handleTestGenerate} disabled={testGenerating} className="btn-secondary gap-2 text-sm">
              {testGenerating
                ? <><Loader2 className="w-4 h-4 animate-spin" />Test running…</>
                : <><FlaskConical className="w-4 h-4" />Test by_prompt (FLUX_KLEIN_NSFW)</>}
            </button>
            <span className="text-xs text-surface-500">
              Provider: <span className="text-primary-400 font-medium">{activeProvider || 'None'}</span>
            </span>
          </div>
          {testLog.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-surface-900 border border-surface-700 max-h-48 overflow-y-auto">
              <div className="text-xs font-mono text-surface-300 space-y-0.5">
                {testLog.map((line, i) => <div key={i}>{line}</div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Image gallery */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Image className="w-4 h-4 text-primary-400" />
          <h2 className="font-semibold text-surface-100 text-sm">Generated Images</h2>
          <button onClick={load} className="ml-auto btn-secondary text-xs gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </button>
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
                  <>
                    <img src={img.image_url} alt="Generated" className="w-full aspect-square object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                      <a href={img.image_url} download className="text-white text-xs flex items-center gap-1 hover:text-primary-300">
                        <Download className="w-3 h-3" />Download
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="aspect-square flex items-center justify-center">
                    {img.status === 'pending'
                      ? <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
                      : <AlertCircle className="w-5 h-5 text-danger-400" />}
                  </div>
                )}
                <div className="p-2 text-xs text-surface-500">
                  <div className="truncate">{img.provider_name}</div>
                  <div className="font-mono text-[10px]">{img.provider_image_id ?? '—'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
