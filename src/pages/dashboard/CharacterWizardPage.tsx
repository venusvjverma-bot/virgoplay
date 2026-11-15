/**
 * Character Wizard Page
 *
 * Two tabs:
 *   - AI Generated (implemented)
 *   - Look Like Me (placeholder)
 *
 * AI Generated tab:
 *   - 16-field Universal Prompt Schema with database-driven dropdowns
 *   - Each dropdown ends with "+ Add New" which opens an inline input
 *   - extra_details is a multiline text area
 *   - "Generate Character" calls the Generation Orchestrator and saves
 *     the result as the Master AI Identity reference image.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Save, Loader2, AlertCircle, CheckCircle,
  Zap, Plus, X, Sparkles, Image as ImageIcon, Lock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  createEmptyPromptSchema,
  UNIVERSAL_PROMPT_FIELDS,
  type UniversalPromptSchema,
  type UniversalPromptFieldName,
  type MasterAiCharacterRow,
} from '../../types/character';
import { generateMasterAiIdentity, pollGenerationStatus } from '../../lib/character-generation';

// ── Field metadata ────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<UniversalPromptFieldName, string> = {
  ethnicity: 'Ethnicity',
  age: 'Age',
  hair: 'Hair',
  face: 'Face',
  skin_type: 'Skin Type',
  body: 'Body',
  breasts: 'Breasts',
  clothing: 'Clothing',
  pose: 'Pose',
  expression: 'Expression',
  action: 'Action',
  partner: 'Partner',
  camera_angle: 'Camera Angle',
  style: 'Style',
  lighting: 'Lighting',
  atmosphere: 'Atmosphere',
  extra_details: 'Extra Details',
};

const FIELD_PLACEHOLDERS: Record<UniversalPromptFieldName, string> = {
  ethnicity: 'Select ethnicity…',
  age: 'Select age…',
  hair: 'Select hair…',
  face: 'Select face…',
  skin_type: 'Select skin type…',
  body: 'Select body…',
  breasts: 'Select breasts…',
  clothing: 'Select clothing…',
  pose: 'Select pose…',
  expression: 'Select expression…',
  action: 'Select action…',
  partner: 'Select partner…',
  camera_angle: 'Select camera angle…',
  style: 'Select style…',
  lighting: 'Select lighting…',
  atmosphere: 'Select atmosphere…',
  extra_details: 'Enter extra details…',
};

// Fields that should NOT be rendered as dropdowns
const TEXTAREA_FIELDS = new Set<UniversalPromptFieldName>(['extra_details']);

// Fields to render as dropdowns (all except extra_details)
const DROPDOWN_FIELDS = UNIVERSAL_PROMPT_FIELDS.filter(f => !TEXTAREA_FIELDS.has(f));

type Tab = 'ai-generated' | 'look-like-me';

interface PromptOption {
  id: string;
  option_value: string;
  sort_order: number;
}

export default function CharacterWizardPage({
  characterId,
  onBack,
}: {
  characterId: string | null;
  onBack: () => void;
}) {
  const { creator } = useAuth();
  const [tab, setTab] = useState<Tab>('ai-generated');
  const [name, setName] = useState('');
  const [promptSchema, setPromptSchema] = useState<UniversalPromptSchema>(createEmptyPromptSchema());
  const [identityImageUrl, setIdentityImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [loading, setLoading] = useState(characterId !== null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Load existing character ────────────────────────────────────────────────
  const loadCharacter = useCallback(async () => {
    if (!characterId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('master_ai_characters')
      .select('*')
      .eq('id', characterId)
      .single();

    if (error || !data) {
      showToast('error', 'Failed to load character.');
      setLoading(false);
      return;
    }

    const row = data as MasterAiCharacterRow;
    setName(row.name);
    setIdentityImageUrl(row.identity_image_url);
    setStatus(row.status);
    if (row.prompt_schema && Object.keys(row.prompt_schema).length > 0) {
      setPromptSchema({ ...createEmptyPromptSchema(), ...row.prompt_schema });
    }
    setLoading(false);
  }, [characterId]);

  useEffect(() => { loadCharacter(); }, [loadCharacter]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Save character (draft) ──────────────────────────────────────────────────
  async function handleSaveDraft() {
    if (!name.trim()) {
      showToast('error', 'Character name is required.');
      return;
    }
    setSaving(true);
    setSaveError(null);

    const payload = {
      name: name.trim(),
      prompt_schema: promptSchema,
      status: 'draft' as const,
    };

    try {
      if (characterId) {
        const { error } = await supabase
          .from('master_ai_characters')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', characterId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('master_ai_characters')
          .insert({ ...payload, creator_id: creator!.id })
          .select()
          .single();
        if (error) throw error;
      }
      showToast('success', 'Character draft saved.');
    } catch (e) {
      setSaveError((e as Error).message);
      showToast('error', 'Failed to save character.');
    } finally {
      setSaving(false);
    }
  }

  // ── Generate Master AI Identity ────────────────────────────────────────────
  async function handleGenerate() {
    if (!name.trim()) {
      showToast('error', 'Character name is required before generating.');
      return;
    }

    setGenerating(true);
    setGenError(null);
    setGenStatus(null);

    // Save the character first (upsert) so we have a record to attach the image to
    let savedCharId = characterId;

    if (!savedCharId) {
      const { data, error } = await supabase
        .from('master_ai_characters')
        .insert({
          creator_id: creator!.id,
          name: name.trim(),
          prompt_schema: promptSchema,
          status: 'draft',
        })
        .select()
        .single();

      if (error || !data) {
        setGenError('Failed to save character before generating.');
        setGenerating(false);
        return;
      }
      savedCharId = (data as MasterAiCharacterRow).id;
    } else {
      await supabase
        .from('master_ai_characters')
        .update({
          prompt_schema: promptSchema,
          updated_at: new Date().toISOString(),
        })
        .eq('id', savedCharId);
    }

    // Call the generation helper (which uses the frozen Orchestrator)
    const result = await generateMasterAiIdentity(supabase, {
      creatorId: creator!.id,
      characterName: name.trim(),
      promptSchema,
    });

    if (!result.ok || !result.generationId) {
      setGenError(result.error ?? 'Generation failed.');
      setGenerating(false);
      return;
    }

    setGenStatus(result.status ?? 'queued');

    // Poll for completion
    const genId = result.generationId;
    pollRef.current = setInterval(async () => {
      const poll = await pollGenerationStatus(supabase, genId);
      if (!poll) return;

      setGenStatus(poll.status);

      if (poll.status === 'completed' && poll.outputUrl) {
        // Save the identity image to the character record
        await supabase
          .from('master_ai_characters')
          .update({
            identity_image_url: poll.outputUrl,
            identity_saved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', savedCharId);

        setIdentityImageUrl(poll.outputUrl);
        setGenerating(false);
        showToast('success', 'Master AI Identity generated successfully!');
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (poll.status === 'failed') {
        setGenError('Generation failed. Please try again.');
        setGenerating(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 3000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-surface-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-surface-100">
            {characterId ? 'Edit Character' : 'New Character'}
          </h2>
          <p className="text-xs text-surface-500">Master AI Identity Wizard</p>
        </div>
        {status === 'published' && identityImageUrl && (
          <span className="flex items-center gap-1 text-xs text-success-400">
            <Lock className="w-3 h-3" /> Identity Locked
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-800">
        <button
          onClick={() => setTab('ai-generated')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'ai-generated'
              ? 'text-primary-400 border-primary-500'
              : 'text-surface-500 border-transparent hover:text-surface-300'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          AI Generated
        </button>
        <button
          onClick={() => setTab('look-like-me')}
          disabled
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'look-like-me'
              ? 'text-primary-400 border-primary-500'
              : 'text-surface-600 border-transparent cursor-not-allowed'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          Look Like Me
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-800 text-surface-500">Soon</span>
        </button>
      </div>

      {/* Tab content */}
      {tab === 'ai-generated' && (
        <div className="space-y-6">
          {/* Character name */}
          <div className="card p-4 space-y-3">
            <label className="text-xs font-semibold text-surface-400 uppercase tracking-wide">Character Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Aria"
              className="input-field text-sm"
            />
          </div>

          {/* Prompt schema fields */}
          <div className="card p-4 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
              <Sparkles className="w-4 h-4 text-primary-400" />
              <h3 className="font-semibold text-surface-100 text-sm">Universal Prompt Schema</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DROPDOWN_FIELDS.map(field => (
                <PromptFieldDropdown
                  key={field}
                  fieldName={field}
                  label={FIELD_LABELS[field]}
                  placeholder={FIELD_PLACEHOLDERS[field]}
                  value={promptSchema[field]}
                  creatorId={creator!.id}
                  onChange={(val) => setPromptSchema(prev => ({ ...prev, [field]: val }))}
                />
              ))}
            </div>

            {/* Extra Details — multiline text area */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400">{FIELD_LABELS.extra_details}</label>
              <textarea
                value={promptSchema.extra_details}
                onChange={e => setPromptSchema(prev => ({ ...prev, extra_details: e.target.value }))}
                placeholder={FIELD_PLACEHOLDERS.extra_details}
                rows={4}
                className="input-field text-sm resize-y"
              />
            </div>
          </div>

          {/* Identity image preview */}
          {identityImageUrl && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
                <Lock className="w-4 h-4 text-accent-400" />
                <h3 className="font-semibold text-surface-100 text-sm">Master AI Identity</h3>
              </div>
              <div className="flex items-start gap-4">
                <img
                  src={identityImageUrl}
                  alt="Master AI Identity"
                  className="w-48 h-48 rounded-xl object-cover border border-surface-700"
                />
                <div className="space-y-1 text-xs text-surface-500">
                  <div className="flex items-center gap-1 text-accent-400 font-medium">
                    <CheckCircle className="w-3 h-3" /> Identity generated
                  </div>
                  <div>This image is the permanent Master AI Identity reference.</div>
                  <div>It will be reused as the single reference for Role Avatar generation.</div>
                </div>
              </div>
            </div>
          )}

          {/* Generation status */}
          {genStatus && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-900 border border-surface-800">
              <span className="text-xs px-2 py-1 rounded-full border text-primary-400 bg-primary-500/10 border-primary-500/20">
                {genStatus}
              </span>
              {generating && <Loader2 className="w-3 h-3 animate-spin text-surface-500" />}
            </div>
          )}

          {/* Error */}
          {genError && (
            <div className="flex items-center gap-2 text-xs text-danger-300 bg-danger-500/10 border border-danger-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {genError}
            </div>
          )}

          {saveError && (
            <div className="flex items-center gap-2 text-xs text-danger-300 bg-danger-500/10 border border-danger-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {saveError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-surface-800">
            <button
              onClick={handleSaveDraft}
              disabled={saving || generating}
              className="btn-secondary gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating || !name.trim()}
              className="btn-primary gap-1.5"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {generating ? 'Generating…' : 'Generate Character'}
            </button>
          </div>
        </div>
      )}

      {/* Look Like Me placeholder */}
      {tab === 'look-like-me' && (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mb-4">
            <ImageIcon className="w-7 h-7 text-surface-600" />
          </div>
          <h3 className="text-sm font-semibold text-surface-300 mb-2">Look Like Me</h3>
          <p className="text-xs text-surface-500 max-w-sm">
            Upload your own face photo to create a Master AI Identity that looks like you.
            This feature will be available in a future phase.
          </p>
        </div>
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
// PromptFieldDropdown — database-driven dropdown with "+ Add New"
// ═══════════════════════════════════════════════════════════════════════════

function PromptFieldDropdown({
  fieldName, label, placeholder, value, creatorId, onChange,
}: {
  fieldName: UniversalPromptFieldName;
  label: string;
  placeholder: string;
  value: string;
  creatorId: string;
  onChange: (val: string) => void;
}) {
  const [options, setOptions] = useState<PromptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddNew, setShowAddNew] = useState(false);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('prompt_field_options')
      .select('id, option_value, sort_order')
      .eq('field_name', fieldName)
      .order('sort_order', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setOptions((data ?? []) as PromptOption[]);
    }
    setLoading(false);
  }, [fieldName]);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  async function handleAddNew() {
    const trimmed = newOptionValue.trim();
    if (!trimmed) return;

    setAdding(true);
    setError(null);

    const { error: err } = await supabase
      .from('prompt_field_options')
      .insert({
        field_name: fieldName,
        option_value: trimmed,
        sort_order: options.length + 1,
        created_by: creatorId,
      });

    if (err) {
      if (err.code === '23505') {
        setError('This option already exists.');
      } else {
        setError(err.message);
      }
      setAdding(false);
      return;
    }

    // Reload options and select the new one
    await loadOptions();
    onChange(trimmed);
    setNewOptionValue('');
    setShowAddNew(false);
    setAdding(false);
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-surface-400">{label}</label>
      {loading ? (
        <div className="h-9 flex items-center px-3">
          <Loader2 className="w-3.5 h-3.5 text-surface-500 animate-spin" />
        </div>
      ) : showAddNew ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={newOptionValue}
            onChange={e => setNewOptionValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddNew(); }}
            placeholder="Enter new option…"
            autoFocus
            className="input-field text-sm flex-1"
          />
          <button
            onClick={handleAddNew}
            disabled={adding || !newOptionValue.trim()}
            className="px-3 py-2 rounded-lg text-sm text-surface-100 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
          </button>
          <button
            onClick={() => { setShowAddNew(false); setNewOptionValue(''); setError(null); }}
            className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <select
          value={value}
          onChange={e => {
            if (e.target.value === '__add_new__') {
              setShowAddNew(true);
            } else {
              onChange(e.target.value);
            }
          }}
          className="input-field text-sm"
        >
          <option value="">{placeholder}</option>
          {options.map(opt => (
            <option key={opt.id} value={opt.option_value}>{opt.option_value}</option>
          ))}
          <option value="__add_new__">+ Add New</option>
        </select>
      )}
      {error && (
        <p className="text-xs text-danger-400">{error}</p>
      )}
    </div>
  );
}
