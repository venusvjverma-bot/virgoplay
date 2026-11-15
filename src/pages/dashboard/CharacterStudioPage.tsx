/**
 * Character Studio Page
 *
 * Lists saved Master AI Identity characters and allows editing their
 * Universal Prompt Schema fields. All fields except extra_details are
 * searchable dropdowns loaded from the database, with "+ Add New" support.
 * extra_details is a multiline text area.
 *
 * No Seed or Style Filter fields — those are not part of the approved schema.
 *
 * Uses the reusable components:
 *   - UniversalPromptSchemaEditor
 *   - GenerationConfigEditor
 *   - PromptGeneratorPanel
 *   - PromptFieldDropdown (via UniversalPromptSchemaEditor)
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Save, Sparkles, ChevronRight, AlertCircle, CheckCircle, Lock,
  Package, Upload, Loader2, Image as ImageIcon, FileText, Layers,
  MoreVertical, Trash2, Eye, EyeOff, Archive, RotateCcw, Pencil,
  Search, RefreshCw, Download, Wand2, Shirt, Sun, MapPin, Smile,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  createEmptyPromptSchema,
  type UniversalPromptSchema,
  type MasterAiCharacterRow,
  type ProviderMetadata,
  type SavedPromptRequest,
  type CharacterStatus,
  type GeneratedImageRow,
} from '../../types/character';
import { getPromptBuilder } from '../../lib/prompt-builder-registry';
import type { GenerationRow, GenerationSnapshot } from '../../types/generation';
import { UniversalPromptSchemaEditor } from '../../components/UniversalPromptSchemaEditor';
import { GenerationConfigEditor, type GenerationConfigValues } from '../../components/GenerationConfigEditor';
import { PromptGeneratorPanel } from '../../components/PromptGeneratorPanel';
import GenerationDetailsPage from './GenerationDetailsPage';

const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://osatedtxkkymvrodczlg.supabase.co';
const generateFnUrl = `${baseUrl}/functions/v1/generate-character-image`;

type StudioTab = 'editor' | 'library' | 'image-gen' | 'prompt-manager';

const LIBRARY_STATUS_STYLES: Record<CharacterStatus, string> = {
  draft: 'bg-surface-700/50 text-surface-300',
  published: 'bg-success-600/15 text-success-400',
  archived: 'bg-surface-800 text-surface-500',
};

const LIBRARY_STATUS_LABELS: Record<CharacterStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PLACEHOLDER_VALUES = new Set(['', 'Select...', '+ Add New']);

export default function CharacterStudioPage() {
  const { creator } = useAuth();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<MasterAiCharacterRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [promptSchema, setPromptSchema] = useState<UniversalPromptSchema>(createEmptyPromptSchema());
  const [identityUrl, setIdentityUrl] = useState<string | null>(null);
  const [providerMeta, setProviderMeta] = useState<ProviderMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [genConfig, setGenConfig] = useState<GenerationConfigValues>({
    model: 'FLUX_KLEIN_NSFW',
    ratio: '9:16',
    batch_size: '1',
  });
  const [promptPreview, setPromptPreview] = useState('');
  const [savedPrompt, setSavedPrompt] = useState<SavedPromptRequest | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTab>('editor');

  function handleGeneratePrompt() {
    const fragments: string[] = [];
    for (const field of Object.keys(promptSchema) as (keyof UniversalPromptSchema)[]) {
      const val = promptSchema[field];
      if (!PLACEHOLDER_VALUES.has(val)) {
        fragments.push(val);
      }
    }
    const positivePrompt = fragments.join(', ');
    const batchSize = Math.max(1, parseInt(genConfig.batch_size, 10) || 1);
    const request: SavedPromptRequest = {
      tool: 'by_prompt',
      input: {
        model: genConfig.model,
        positive_prompt: positivePrompt,
        ratio: genConfig.ratio,
        batch_size: batchSize,
      },
    };
    setPromptPreview(JSON.stringify(request, null, 2));
  }

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('master_ai_characters')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const rows = (data as MasterAiCharacterRow[]) ?? [];
      setCharacters(rows);
      if (rows.length > 0) {
        const active = rows.find(r => r.is_active) ?? rows[0];
        setSelectedId(active.id);
        setName(active.name);
        setPromptSchema({ ...createEmptyPromptSchema(), ...active.prompt_schema });
        setIdentityUrl(active.identity_image_url);
        setProviderMeta(active.provider_metadata);
        setSavedPrompt(active.saved_prompt);
        if (active.saved_prompt) {
          setGenConfig({
            model: active.saved_prompt.input.model,
            ratio: active.saved_prompt.input.ratio,
            batch_size: String(active.saved_prompt.input.batch_size),
          });
          setPromptPreview(JSON.stringify(active.saved_prompt, null, 2));
        } else {
          setPromptPreview('');
        }
      }
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSelect(id: string) {
    const c = characters.find(r => r.id === id);
    if (!c) return;
    setSelectedId(id);
    setName(c.name);
    setPromptSchema({ ...createEmptyPromptSchema(), ...c.prompt_schema });
    setIdentityUrl(c.identity_image_url);
    setProviderMeta(c.provider_metadata);
    setSavedPrompt(c.saved_prompt);
    if (c.saved_prompt) {
      setGenConfig({
        model: c.saved_prompt.input.model,
        ratio: c.saved_prompt.input.ratio,
        batch_size: String(c.saved_prompt.input.batch_size),
      });
      setPromptPreview(JSON.stringify(c.saved_prompt, null, 2));
    } else {
      setPromptPreview('');
    }
  }

  function handleNew() {
    setSelectedId(null);
    setName('');
    setPromptSchema(createEmptyPromptSchema());
    setIdentityUrl(null);
    setProviderMeta(null);
    setSavedPrompt(null);
    setPromptPreview('');
  }

  async function handleSave() {
    if (!name.trim()) {
      showToast('error', 'Character name is required.');
      return;
    }
    setSaving(true);
    try {
      const savedPromptPayload: SavedPromptRequest | null = promptPreview
        ? JSON.parse(promptPreview) as SavedPromptRequest
        : null;
      const payload = {
        name: name.trim(),
        prompt_schema: promptSchema,
        is_active: true,
        saved_prompt: savedPromptPayload,
      };

      if (selectedId) {
        const { error } = await supabase
          .from('master_ai_characters')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', selectedId);
        if (error) throw new Error(error.message);
      } else {
        await supabase.from('master_ai_characters').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await supabase.from('master_ai_characters').insert({ ...payload, creator_id: creator!.id }).select().single();
        if (error) throw new Error(error.message);
      }

      showToast('success', 'Character saved and set as active.');
      await load();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setSaving(false);
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
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-primary-400" />
            <h1 className="text-xl font-semibold text-surface-100">Character Studio</h1>
          </div>
          <p className="text-sm text-surface-500">
            The single source of truth for Master AI Characters — identity, prompt schema, generation config, and identity image.
          </p>
        </div>
        <button onClick={handleNew} className="btn-secondary text-xs gap-1.5 flex-shrink-0">
          <User className="w-3.5 h-3.5" />New Character
        </button>
      </div>

      {/* Studio sub-tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {([
          { id: 'editor', label: 'Editor', icon: Sparkles },
          { id: 'library', label: 'Library', icon: Layers },
          { id: 'image-gen', label: 'Image Gen', icon: ImageIcon },
          { id: 'prompt-manager', label: 'Prompt Manager', icon: FileText },
        ] as { id: StudioTab; label: string; icon: typeof Sparkles }[]).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setStudioTab(id)} className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 border',
            studioTab === id ? 'bg-primary-600/15 text-primary-400 border-primary-600/20' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800 border-transparent',
          ].join(' ')}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {studioTab === 'library' && (
        <CharacterLibraryPanel creatorId={creator!.id} onEditChar={(id) => { handleSelect(id); setStudioTab('editor'); }} onNewChar={() => { handleNew(); setStudioTab('editor'); }} />
      )}

      {studioTab === 'image-gen' && (
        <ImageGenPanel creatorId={creator!.id} characters={characters} selectedCharId={selectedId} onSelectChar={handleSelect} />
      )}

      {studioTab === 'prompt-manager' && (
        <PromptManagerPanel creatorId={creator!.id} />
      )}

      {studioTab === 'editor' && (<>

      {/* Character selector */}
      {characters.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
            <User className="w-4 h-4 text-primary-400" />
            <h2 className="font-semibold text-surface-100 text-sm">Saved Characters</h2>
          </div>
          <select
            value={selectedId ?? ''}
            onChange={e => handleSelect(e.target.value)}
            className="input-field">
            {characters.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.is_active ? ' (Active)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Character Identity display */}
      {identityUrl && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
            <Lock className="w-4 h-4 text-accent-400" />
            <h2 className="font-semibold text-surface-100 text-sm">Character Identity</h2>
          </div>
          <div className="flex items-start gap-4">
            <img src={identityUrl} alt="Character Identity" className="w-32 h-32 rounded-xl object-cover border border-surface-700" />
            <div className="space-y-1 text-xs text-surface-500">
              <div className="flex items-center gap-1 text-accent-400 font-medium">
                <CheckCircle className="w-3 h-3" />Identity locked
              </div>
              {providerMeta && (
                <>
                  <div>Provider: {providerMeta.provider_name}</div>
                  <div>Request type: {providerMeta.request_type}</div>
                  <div>Reference image sent: {providerMeta.reference_image_sent ? 'Yes' : 'No'}</div>
                  <div>Reusable character ID: {providerMeta.has_reusable_character_id ? 'Yes' : 'No'}</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="card space-y-6">
        {/* Character name */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-surface-400">Character Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Aria"
            className="input-field text-sm" />
        </div>

        {/* Universal Prompt Schema — reusable component */}
        <UniversalPromptSchemaEditor
          schema={promptSchema}
          creatorId={creator!.id}
          onChange={setPromptSchema}
        />

        {/* Generation Configuration — reusable component */}
        <GenerationConfigEditor
          values={genConfig}
          onChange={setGenConfig}
        />

        {/* Prompt Generator — reusable component */}
        <PromptGeneratorPanel
          promptPreview={promptPreview}
          onGenerate={handleGeneratePrompt}
          savedPrompt={savedPrompt}
        />

        {/* Save */}
        <div className="flex items-center gap-3 pt-4 border-t border-surface-800">
          <button onClick={handleSave} disabled={saving} className="btn-primary gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : selectedId ? 'Save Character' : 'Create Character'}
          </button>
          {selectedId && identityUrl && (
            <button
              onClick={() => setShowPublishModal(true)}
              disabled={publishing}
              className="btn-secondary gap-1.5">
              {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Publish Blueprint
            </button>
          )}
          {selectedId && (
            <button
              onClick={() => navigate(`/character-generation?char=${selectedId}`)}
              className="btn-secondary gap-1.5">
              <ChevronRight className="w-3.5 h-3.5" />Go to Image Gen
            </button>
          )}
        </div>
      </div>

      {/* Publish Blueprint Modal */}
      {showPublishModal && selectedId && (
        <PublishBlueprintModal
          characterId={selectedId}
          characterName={name}
          creatorId={creator!.id}
          identityUrl={identityUrl}
          hasIdentity={!!identityUrl}
          hasPromptSchema={Object.values(promptSchema).some(v => v && !PLACEHOLDER_VALUES.has(v))}
          hasSavedPrompt={!!savedPrompt}
          onClose={() => setShowPublishModal(false)}
          onPublished={() => { setShowPublishModal(false); showToast('success', 'Master AI Blueprint published.'); }}
        />
      )}

      </>
      )}

      {/* Toast */}
      {toast && (
        <div className={[
          'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium',
          'border animate-slide-up max-w-sm',
          toast.type === 'success'
            ? 'bg-accent-500/10 border-accent-500/30 text-accent-300'
            : 'bg-danger-500/10 border-danger-500/30 text-danger-300',
        ].join(' ')}>
          {toast.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Publish Blueprint Modal — converts a completed Character into an
// immutable published Master AI Blueprint (blueprint_package).
// ═══════════════════════════════════════════════════════════════════════════

function PublishBlueprintModal({
  characterId, characterName, creatorId, identityUrl,
  hasIdentity, hasPromptSchema, hasSavedPrompt,
  onClose, onPublished,
}: {
  characterId: string;
  characterName: string;
  creatorId: string;
  identityUrl: string | null;
  hasIdentity: boolean;
  hasPromptSchema: boolean;
  hasSavedPrompt: boolean;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [pkgName, setPkgName] = useState(characterName + ' Blueprint');
  const [pkgCode, setPkgCode] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checks = [
    { label: 'Identity image generated', ok: hasIdentity },
    { label: 'Prompt schema fields filled', ok: hasPromptSchema },
    { label: 'Saved prompt exists', ok: hasSavedPrompt },
  ];
  const allChecksPass = checks.every(c => c.ok);

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    if (!pkgName.trim() || !pkgCode.trim()) {
      setError('Blueprint name and code are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data, error: insertErr } = await supabase
        .from('blueprint_packages')
        .insert({
          creator_id: creatorId,
          name: pkgName.trim(),
          code: pkgCode.trim().toUpperCase(),
          description: description.trim() || null,
          status: 'published',
          metadata: { source_character_id: characterId },
        })
        .select()
        .single();
      if (insertErr) throw new Error(insertErr.message);

      // Mark the character as published
      await supabase
        .from('master_ai_characters')
        .update({ status: 'published', updated_at: new Date().toISOString() })
        .eq('id', characterId);

      onPublished();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface-900 border border-surface-700 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 p-4 border-b border-surface-800 sticky top-0 bg-surface-900 z-10">
          <div className="w-9 h-9 rounded-lg bg-accent-600/15 flex items-center justify-center">
            <Package className="w-4 h-4 text-accent-400" />
          </div>
          <h3 className="text-sm font-semibold text-surface-100">Publish Master AI Blueprint</h3>
        </div>

        <form onSubmit={handlePublish} className="p-4 space-y-4">
          {/* Pre-publish validation */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wide">Pre-publish Checklist</h4>
            {checks.map(c => (
              <div key={c.label} className="flex items-center gap-2 text-xs">
                {c.ok
                  ? <CheckCircle className="w-3.5 h-3.5 text-success-400 flex-shrink-0" />
                  : <AlertCircle className="w-3.5 h-3.5 text-danger-400 flex-shrink-0" />}
                <span className={c.ok ? 'text-surface-300' : 'text-danger-300'}>{c.label}</span>
              </div>
            ))}
          </div>

          {identityUrl && (
            <div className="flex justify-center">
              <img src={identityUrl} alt="Identity" className="w-20 h-20 rounded-lg object-cover border border-surface-700" />
            </div>
          )}

          {/* Blueprint fields */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Blueprint Name</label>
            <input
              type="text"
              value={pkgName}
              onChange={e => setPkgName(e.target.value)}
              autoFocus
              className="w-full text-sm text-surface-200 bg-surface-950 border border-surface-700 rounded-lg p-2.5 focus:outline-none focus:border-accent-600/40 transition-colors"
              placeholder="e.g. Aria Master Blueprint"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Blueprint Code</label>
            <input
              type="text"
              value={pkgCode}
              onChange={e => setPkgCode(e.target.value.toUpperCase())}
              className="w-full text-sm text-surface-200 bg-surface-950 border border-surface-700 rounded-lg p-2.5 focus:outline-none focus:border-accent-600/40 transition-colors font-mono"
              placeholder="e.g. ARIA_BP_001"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full text-sm text-surface-200 bg-surface-950 border border-surface-700 rounded-lg p-2.5 resize-y focus:outline-none focus:border-accent-600/40 transition-colors"
              placeholder="What this blueprint represents…"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-danger-300 bg-danger-500/10 border border-danger-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !allChecksPass}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-surface-100 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Publish
            </button>
          </div>

          {!allChecksPass && (
            <p className="text-xs text-surface-500 text-center">
              Complete all checklist items before publishing.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Character Library Panel — internal view within Character Studio
// ═══════════════════════════════════════════════════════════════════════════

function CharacterLibraryPanel({
  creatorId, onEditChar, onNewChar,
}: {
  creatorId: string;
  onEditChar: (charId: string) => void;
  onNewChar: () => void;
}) {
  const [characters, setCharacters] = useState<MasterAiCharacterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('master_ai_characters')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) { setError(err.message); } else { setCharacters((data ?? []) as MasterAiCharacterRow[]); }
    setLoading(false);
  }, [refreshKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!menuOpenId) return;
    function close() { setMenuOpenId(null); }
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpenId]);

  const filtered = characters.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  async function updateStatus(charId: string, status: CharacterStatus) {
    setActionError(null);
    const { error: err } = await supabase
      .from('master_ai_characters')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', charId);
    if (err) { setActionError(err.message); } else { await load(); }
    setMenuOpenId(null);
  }

  async function deleteCharacter(charId: string) {
    setActionError(null);
    const { error: err } = await supabase
      .from('master_ai_characters')
      .delete()
      .eq('id', charId);
    if (err) { setActionError(err.message); } else { await load(); }
    setMenuOpenId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600/15 border border-primary-600/20 flex items-center justify-center">
            <Layers className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-surface-100">Character Library</h2>
            <p className="text-xs text-surface-500">All Master AI Identity characters</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRefreshKey(k => k + 1)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={onNewChar} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-surface-100 bg-primary-600 hover:bg-primary-500 transition-colors">
            <User className="w-4 h-4" />New Character
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search characters…" className="w-full pl-9 pr-3 py-2.5 text-sm text-surface-200 bg-surface-900 border border-surface-700 rounded-lg focus:outline-none focus:border-primary-600/40 transition-colors placeholder:text-surface-600" />
      </div>

      {actionError && (
        <div className="flex items-center gap-2 text-xs text-danger-300 bg-danger-500/10 border border-danger-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{actionError}
        </div>
      )}

      {loading ? (
        <div className="card flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-surface-500 animate-spin" /></div>
      ) : error ? (
        <div className="card flex items-center gap-3 py-4 px-4 border-danger-500/20"><AlertCircle className="w-5 h-5 text-danger-400 flex-shrink-0" /><p className="text-sm text-danger-300">{error}</p></div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-800 flex items-center justify-center mb-4"><ImageIcon className="w-6 h-6 text-surface-600" /></div>
          <p className="text-sm text-surface-400">No characters yet</p>
          <p className="text-xs text-surface-600 mt-1">Click "New Character" to create your first Master AI Identity.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(char => (
            <div key={char.id} className="card w-full flex items-center gap-4 p-3 hover:border-primary-600/30 transition-colors group">
              <div className="w-14 h-14 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {char.identity_image_url ? <img src={char.identity_image_url} alt="" className="w-full h-full object-cover" loading="lazy" /> : <ImageIcon className="w-5 h-5 text-surface-600" />}
              </div>
              <button onClick={() => onEditChar(char.id)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-surface-100 truncate">{char.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${LIBRARY_STATUS_STYLES[char.status]}`}>{LIBRARY_STATUS_LABELS[char.status]}</span>
                </div>
                <p className="text-xs text-surface-500 truncate">{char.identity_image_url ? 'Identity generated' : 'No identity image yet'} · {formatDate(char.created_at)}</p>
              </button>
              <div className="relative flex-shrink-0">
                <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === char.id ? null : char.id); }} className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuOpenId === char.id && (
                  <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-surface-900 border border-surface-700 rounded-lg shadow-xl py-1" onClick={(e) => e.stopPropagation()}>
                    {char.status === 'draft' && <button onClick={() => { onEditChar(char.id); setMenuOpenId(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"><Pencil className="w-3.5 h-3.5" />Edit</button>}
                    {char.status === 'draft' && <button onClick={() => updateStatus(char.id, 'published')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"><Eye className="w-3.5 h-3.5" />Publish</button>}
                    {char.status === 'published' && <button onClick={() => updateStatus(char.id, 'draft')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"><EyeOff className="w-3.5 h-3.5" />Unpublish</button>}
                    {char.status !== 'archived' && <button onClick={() => updateStatus(char.id, 'archived')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"><Archive className="w-3.5 h-3.5" />Archive</button>}
                    {char.status === 'archived' && <button onClick={() => updateStatus(char.id, 'draft')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"><RotateCcw className="w-3.5 h-3.5" />Restore</button>}
                    {char.status === 'draft' && <button onClick={() => deleteCharacter(char.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-400 hover:text-danger-300 hover:bg-danger-500/10 transition-colors border-t border-surface-800 mt-1 pt-1"><Trash2 className="w-3.5 h-3.5" />Delete</button>}
                  </div>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-surface-400 flex-shrink-0 transition-colors cursor-pointer" onClick={() => onEditChar(char.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Image Generation Panel — internal view within Character Studio
// ═══════════════════════════════════════════════════════════════════════════

function ImageGenPanel({
  creatorId, characters, selectedCharId, onSelectChar,
}: {
  creatorId: string;
  characters: MasterAiCharacterRow[];
  selectedCharId: string | null;
  onSelectChar: (id: string) => void;
}) {
  const [activeProvider, setActiveProvider] = useState('');
  const [images, setImages] = useState<GeneratedImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState('');
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
      const [provRes, imgRes] = await Promise.all([
        supabase.from('provider_configurations').select('provider_name, is_active').eq('service_type', 'image').eq('is_active', true).maybeSingle(),
        supabase.from('generated_images').select('*').order('created_at', { ascending: false }).limit(24),
      ]);
      if (provRes.data) setActiveProvider((provRes.data as { provider_name: string }).provider_name);
      if (imgRes.data) setImages((imgRes.data as GeneratedImageRow[]) ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedCharId) { setPreviewPrompt(''); return; }
    const c = characters.find(r => r.id === selectedCharId);
    if (!c) { setPreviewPrompt(''); return; }
    if (c.saved_prompt) { setPreviewPrompt(c.saved_prompt.input.positive_prompt); return; }
    try {
      if (!activeProvider) { setPreviewPrompt(''); return; }
      const builder = getPromptBuilder(activeProvider);
      if (!builder) { setPreviewPrompt(''); return; }
      setPreviewPrompt(builder.buildPrompt(c.prompt_schema));
    } catch { setPreviewPrompt(''); }
  }, [selectedCharId, characters, activeProvider]);

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

      let body: Record<string, unknown>;
      if (saved) {
        const extraParts: string[] = [];
        if (sceneOutfit) extraParts.push(`wearing ${sceneOutfit}`);
        if (scenePose) extraParts.push(scenePose);
        if (sceneExpression) extraParts.push(sceneExpression);
        if (sceneLocation) extraParts.push(`in ${sceneLocation}`);
        if (sceneLighting) extraParts.push(sceneLighting);
        if (sceneExtra) extraParts.push(sceneExtra);
        const positivePrompt = extraParts.length ? `${saved.input.positive_prompt}, ${extraParts.join(', ')}` : saved.input.positive_prompt;
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
          scene_override: {
            outfit: sceneOutfit || undefined,
            pose: scenePose || undefined,
            location: sceneLocation || undefined,
            lighting: sceneLighting || undefined,
            expression: sceneExpression || undefined,
            extra_prompt: sceneExtra || undefined,
            negative_prompt: sceneNegative || undefined,
          },
        };
      }

      const res = await fetch(generateFnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

      setImages(prev => [{
        id: data.generation_id,
        creator_id: creatorId,
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
    return <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const selectedChar = characters.find(c => c.id === selectedCharId);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-600/15 border border-primary-600/20 flex items-center justify-center">
          <ImageIcon className="w-5 h-5 text-primary-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-surface-100">Image Generation</h2>
          <p className="text-xs text-surface-500">Generate identity images from your characters{activeProvider && <span className="text-primary-400"> ({activeProvider})</span>}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
          <Sparkles className="w-4 h-4 text-primary-400" />
          <h3 className="font-semibold text-surface-100 text-sm">Select Character</h3>
        </div>
        {characters.length === 0 ? (
          <div className="text-center py-6"><p className="text-sm text-surface-400">No characters created yet.</p></div>
        ) : (
          <div className="space-y-3">
            <select value={selectedCharId ?? ''} onChange={e => onSelectChar(e.target.value)} className="input-field">
              <option value="">Select a character…</option>
              {characters.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.is_active ? ' (Active)' : ''}{c.identity_image_url ? ' — Identity' : ''}</option>
              ))}
            </select>
            {selectedChar?.identity_image_url && (
              <div className="flex items-center gap-3">
                <img src={selectedChar.identity_image_url} alt="Identity" className="w-16 h-16 rounded-lg object-cover border border-surface-700" />
                <div className="text-xs text-surface-500 space-y-0.5">
                  <div className="flex items-center gap-1 text-accent-400"><CheckCircle className="w-3 h-3" />Character Identity saved</div>
                  <div>Provider: {selectedChar.provider_metadata?.provider_name ?? '—'}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedChar && (
        <div className="card space-y-5">
          <div className="flex items-center gap-2 pb-4 border-b border-surface-800">
            <Wand2 className="w-4 h-4 text-primary-400" />
            <h3 className="font-semibold text-surface-100 text-sm">Scene Overrides (Optional)</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><label className="text-xs font-medium text-surface-400 flex items-center gap-1"><Shirt className="w-3 h-3" />Outfit</label><input value={sceneOutfit} onChange={e => setSceneOutfit(e.target.value)} placeholder="e.g. red evening gown" className="input-field text-sm" /></div>
            <div className="space-y-1"><label className="text-xs font-medium text-surface-400">Pose</label><input value={scenePose} onChange={e => setScenePose(e.target.value)} placeholder="e.g. sitting on a park bench" className="input-field text-sm" /></div>
            <div className="space-y-1"><label className="text-xs font-medium text-surface-400 flex items-center gap-1"><MapPin className="w-3 h-3" />Location</label><input value={sceneLocation} onChange={e => setSceneLocation(e.target.value)} placeholder="e.g. a rooftop terrace" className="input-field text-sm" /></div>
            <div className="space-y-1"><label className="text-xs font-medium text-surface-400 flex items-center gap-1"><Sun className="w-3 h-3" />Lighting</label><input value={sceneLighting} onChange={e => setSceneLighting(e.target.value)} placeholder="e.g. cinematic lighting" className="input-field text-sm" /></div>
            <div className="space-y-1"><label className="text-xs font-medium text-surface-400 flex items-center gap-1"><Smile className="w-3 h-3" />Expression</label><input value={sceneExpression} onChange={e => setSceneExpression(e.target.value)} placeholder="e.g. a warm smile" className="input-field text-sm" /></div>
            <div className="space-y-1"><label className="text-xs font-medium text-surface-400">Extra Prompt</label><input value={sceneExtra} onChange={e => setSceneExtra(e.target.value)} placeholder="additional prompt text" className="input-field text-sm" /></div>
          </div>
          <div className="space-y-1"><label className="text-xs font-medium text-surface-400">Negative Prompt</label><input value={sceneNegative} onChange={e => setSceneNegative(e.target.value)} placeholder="e.g. blurry, distorted face" className="input-field text-sm" /></div>
          {previewPrompt && (
            <div className="space-y-1"><label className="text-xs font-medium text-surface-400">Prompt Preview</label><div className="bg-surface-950 border border-surface-800 rounded-lg px-3 py-2 text-xs text-surface-300 font-mono leading-relaxed break-words">{previewPrompt}</div></div>
          )}
          <div className="flex items-center gap-2 pt-2 border-t border-surface-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={saveAsIdentity} onChange={e => setSaveAsIdentity(e.target.checked)} className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-surface-300">Save as Character Identity</span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleGenerate} disabled={generating} className="btn-primary gap-2">
              {generating ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4" />Generate Image</>}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary-400" />
          <h3 className="font-semibold text-surface-100 text-sm">Generated Images</h3>
          <button onClick={load} className="ml-auto btn-secondary text-xs gap-1.5"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
        </div>
        {images.length === 0 ? (
          <div className="card text-center py-8"><ImageIcon className="w-8 h-8 text-surface-600 mx-auto mb-3" /><p className="text-sm text-surface-400">No images generated yet.</p></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.map(img => (
              <div key={img.id} className="card overflow-hidden p-0 group relative">
                {img.image_url ? (
                  <>
                    <img src={img.image_url} alt="Generated" className="w-full aspect-square object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                      <a href={img.image_url} download className="text-white text-xs flex items-center gap-1 hover:text-primary-300"><Download className="w-3 h-3" />Download</a>
                    </div>
                  </>
                ) : (
                  <div className="aspect-square flex items-center justify-center"><Loader2 className="w-5 h-5 text-surface-500 animate-spin" /></div>
                )}
                <div className="p-2 text-xs text-surface-500"><div className="truncate">{img.provider_name}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Prompt Manager Panel — internal view within Character Studio
// ═══════════════════════════════════════════════════════════════════════════

function PromptManagerPanel({ creatorId }: { creatorId: string }) {
  const [generations, setGenerations] = useState<GenerationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('generations')
      .select('*')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (err) { setError(err.message); } else { setGenerations((data ?? []) as GenerationRow[]); }
    setLoading(false);
  }, [creatorId, refreshKey]);

  useEffect(() => { load(); }, [load]);

  if (selectedId) {
    return <GenerationDetailsPage generationId={selectedId} creatorId={creatorId} onBack={() => { setSelectedId(null); setRefreshKey(k => k + 1); }} />;
  }

  const filtered = generations.filter(g => {
    if (!search) return true;
    const q = search.toLowerCase();
    return g.asset_type.toLowerCase().includes(q) || (g.asset_subtype ?? '').toLowerCase().includes(q) || (g.provider_name ?? '').toLowerCase().includes(q) || (g.snapshot?.prompt ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-600/15 border border-accent-600/20 flex items-center justify-center">
            <FileText className="w-5 h-5 text-accent-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-surface-100">Prompt Manager</h2>
            <p className="text-xs text-surface-500">View and edit prompts from your generations</p>
          </div>
        </div>
        <button onClick={() => setRefreshKey(k => k + 1)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors">
          <RefreshCw className="w-4 h-4" />Refresh
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by type, subtype, provider, or prompt…" className="w-full pl-9 pr-3 py-2.5 text-sm text-surface-200 bg-surface-900 border border-surface-700 rounded-lg focus:outline-none focus:border-accent-600/40 transition-colors placeholder:text-surface-600" />
      </div>

      {loading ? (
        <div className="card flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-surface-500 animate-spin" /></div>
      ) : error ? (
        <div className="card flex items-center gap-3 py-4 px-4 border-danger-500/20"><AlertCircle className="w-5 h-5 text-danger-400 flex-shrink-0" /><p className="text-sm text-danger-300">{error}</p></div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-800 flex items-center justify-center mb-4"><FileText className="w-6 h-6 text-surface-600" /></div>
          <p className="text-sm text-surface-400">{generations.length === 0 ? 'No generations yet' : 'No results match your search'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(gen => {
            const snapshot = gen.snapshot as GenerationSnapshot | null;
            const prompt = snapshot?.prompt ?? '';
            return (
              <button key={gen.id} onClick={() => setSelectedId(gen.id)} className="card w-full flex items-center gap-4 p-3 text-left hover:border-accent-600/30 transition-colors group">
                <div className="w-14 h-14 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {gen.output_public_url && gen.status === 'completed' ? <img src={gen.output_public_url} alt="" className="w-full h-full object-cover" loading="lazy" /> : <ImageIcon className="w-5 h-5 text-surface-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-surface-100 truncate">{gen.asset_subtype ?? gen.asset_type}</span>
                    <span className="text-[10px] text-surface-500 bg-surface-800 px-1.5 py-0.5 rounded">v{gen.version}</span>
                  </div>
                  <p className="text-xs text-surface-500 truncate">{gen.asset_type} · {gen.provider_name ?? '—'} · {formatDate(gen.created_at)}</p>
                  {prompt && <p className="text-xs text-surface-400 truncate font-mono">{prompt.slice(0, 80)}{prompt.length > 80 ? '…' : ''}</p>}
                </div>
                <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-surface-400 flex-shrink-0 transition-colors" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
