import { useState, useEffect, useRef } from 'react';
import {
  Sparkles, ChevronLeft, ChevronRight, Check, Loader2,
  CheckCircle2, AlertCircle, ExternalLink, Copy, RefreshCw,
  ArrowRight, Cpu, User, Zap, Info,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Gradient palettes ──────────────────────────────────────────────────────────

const PRESET_GRADIENTS: Record<string, string> = {
  'APR-001': 'linear-gradient(145deg,#3d1d2e,#7c2d4e)',
  'APR-002': 'linear-gradient(145deg,#1e1a3d,#4a2f7e)',
  'APR-003': 'linear-gradient(145deg,#3d1a1a,#8b2020)',
  'APR-004': 'linear-gradient(145deg,#3d2f1a,#7a5c30)',
  'APR-005': 'linear-gradient(145deg,#1a2a3d,#2a4a6e)',
  'APR-006': 'linear-gradient(145deg,#3d2a10,#b06015)',
  'APR-007': 'linear-gradient(145deg,#1a1218,#3d1a2a)',
  'APR-008': 'linear-gradient(145deg,#0d3d3d,#1a7a6e)',
};

const BT_GRADIENTS: Record<string, string> = {
  'BT-001': 'linear-gradient(160deg,#1a1a3d,#2a2a6e)',
  'BT-002': 'linear-gradient(160deg,#1a2a1a,#2a5a2a)',
  'BT-003': 'linear-gradient(160deg,#3d1a1a,#7a3a3a)',
  'BT-004': 'linear-gradient(160deg,#2a1a3d,#5a3a6e)',
  'BT-005': 'linear-gradient(160deg,#3d2a1a,#7a5a3a)',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface PresetAsset {
  preset_id:    string;
  preset_name:  string;
  preset_tag:   string;
  image_url:    string | null;
  is_generated: boolean;
  sort_order:   number;
}

interface BodyPresetAsset {
  preset_id:       string;
  body_type_name:  string;
  body_type_value: string;
  image_url:       string | null;
  is_generated:    boolean;
  sort_order:      number;
}

interface AiIdentity {
  id:                   string;
  identity_code:        string;
  apr_code:             string;
  apr_name:             string | null;
  bt_code:              string;
  bt_name:              string | null;
  composed_preview_url: string | null;
  generation_status:    string;
  created_at:           string;
}

type GenState = 'idle' | 'saving' | 'generating' | 'success' | 'error';

// ── Main component ────────────────────────────────────────────────────────────

export default function AppearanceLibrary({ creatorId }: { creatorId: string }) {
  const [aprPresetId,    setAprPresetId]    = useState<string | null>(null);
  const [btPresetId,     setBtPresetId]     = useState<string | null>(null);
  const [savedAprId,     setSavedAprId]     = useState<string | null>(null);
  const [savedBtId,      setSavedBtId]      = useState<string | null>(null);
  const [presets,        setPresets]        = useState<PresetAsset[]>([]);
  const [bodyPresets,    setBodyPresets]    = useState<BodyPresetAsset[]>([]);
  const [existingIdentity, setExistingIdentity] = useState<AiIdentity | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [genState,       setGenState]       = useState<GenState>('idle');
  const [genResult,      setGenResult]      = useState<AiIdentity | null>(null);
  const [genError,       setGenError]       = useState<string | null>(null);
  const [copied,         setCopied]         = useState(false);
  const aprScrollRef = useRef<HTMLDivElement>(null);
  const btScrollRef  = useRef<HTMLDivElement>(null);

  // ── Load presets + saved AP-001 selections ────────────────────────────────
  useEffect(() => {
    (async () => {
      const [presetsRes, bodyPresetsRes, profileRes, identityRes] = await Promise.all([
        supabase
          .from('engine_appearance_preset_assets')
          .select('preset_id, preset_name, preset_tag, image_url, is_generated, sort_order')
          .order('sort_order'),
        supabase
          .from('engine_body_type_preset_assets')
          .select('preset_id, body_type_name, body_type_value, image_url, is_generated, sort_order')
          .order('sort_order'),
        supabase
          .from('creator_appearance_profiles')
          .select('appearance_preset_id, body_preset_id')
          .eq('creator_id', creatorId)
          .eq('profile_code', 'AP-001')
          .maybeSingle(),
        supabase
          .from('master_ai_identities')
          .select('id, identity_code, apr_code, apr_name, bt_code, bt_name, composed_preview_url, generation_status, created_at')
          .eq('creator_id', creatorId)
          .eq('generation_status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (presetsRes.data)     setPresets(presetsRes.data as PresetAsset[]);
      if (bodyPresetsRes.data) setBodyPresets(bodyPresetsRes.data as BodyPresetAsset[]);
      if (profileRes.data) {
        const apr = profileRes.data.appearance_preset_id ?? null;
        const bt  = profileRes.data.body_preset_id ?? null;
        setAprPresetId(apr);
        setBtPresetId(bt);
        setSavedAprId(apr);
        setSavedBtId(bt);
      }
      if (identityRes.data) setExistingIdentity(identityRes.data as AiIdentity);
      setLoading(false);
    })();
  }, [creatorId]);

  // ── Scroll helpers ────────────────────────────────────────────────────────
  function scrollAPR(dir: 'left' | 'right') {
    aprScrollRef.current?.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' });
  }
  function scrollBT(dir: 'left' | 'right') {
    btScrollRef.current?.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' });
  }

  // ── Save AP-001 + Generate Identity ──────────────────────────────────────
  async function saveAndGenerate(force = false) {
    if (!aprPresetId || !btPresetId) return;

    setGenState('saving');
    setGenError(null);
    setGenResult(null);

    // Persist selections to AP-001 profile
    await supabase
      .from('creator_appearance_profiles')
      .upsert({
        creator_id:           creatorId,
        profile_code:         'AP-001',
        appearance_preset_id: aprPresetId,
        body_preset_id:       btPresetId,
        updated_at:           new Date().toISOString(),
      }, { onConflict: 'creator_id,profile_code' });

    setGenState('generating');

    // Call edge function with user JWT
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token ?? '';

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-ai-identity`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${jwt}`,
          },
          body: JSON.stringify({ apr_code: aprPresetId, bt_code: btPresetId, force }),
        },
      );

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.detail ?? json.error ?? `HTTP ${res.status}`);
      }

      // Fetch the freshly created record
      const { data: newRecord } = await supabase
        .from('master_ai_identities')
        .select('id, identity_code, apr_code, apr_name, bt_code, bt_name, composed_preview_url, generation_status, created_at')
        .eq('creator_id', creatorId)
        .eq('identity_code', json.identity_code)
        .maybeSingle();

      const identity = newRecord as AiIdentity ?? {
        id:                   json.record_id,
        identity_code:        json.identity_code,
        apr_code:             aprPresetId,
        apr_name:             json.apr?.name ?? null,
        bt_code:              btPresetId,
        bt_name:              json.bt?.name ?? null,
        composed_preview_url: json.composed_preview_url,
        generation_status:    'completed',
        created_at:           new Date().toISOString(),
      };

      setGenResult(identity);
      setExistingIdentity(identity);
      setSavedAprId(aprPresetId);
      setSavedBtId(btPresetId);
      setGenState('success');
    } catch (e) {
      setGenError((e as Error).message);
      setGenState('error');
    }
  }

  function closeModal() {
    setGenState('idle');
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hasChanges   = aprPresetId !== savedAprId || btPresetId !== savedBtId;
  const canGenerate  = !!aprPresetId && !!btPresetId && hasChanges;
  const isGenerating = genState === 'saving' || genState === 'generating';
  const showModal    = genState !== 'idle';

  const selectedAPR = presets.find(p => p.preset_id === aprPresetId);
  const selectedBT  = bodyPresets.find(p => p.preset_id === btPresetId);

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">

        {/* ── Header card ──────────────────────────────────────────────── */}
        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary-600/15 border border-primary-600/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-primary-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-surface-200">AP-001</h3>
                  <span className="text-[10px] font-mono text-surface-600 bg-surface-800 px-1.5 py-0.5 rounded">v1</span>
                  <span className="text-[10px] font-mono text-primary-500 bg-primary-500/8 border border-primary-500/20 px-1.5 py-0.5 rounded">Phase 1</span>
                </div>
                <p className="text-[11px] text-surface-500">Master AI Identity Generation</p>
              </div>
            </div>
            {existingIdentity && (
              <span className="flex items-center gap-1.5 text-[11px] text-accent-400 bg-accent-500/8 border border-accent-500/20 px-2.5 py-1 rounded-full font-medium flex-shrink-0">
                <CheckCircle2 className="w-3 h-3" />
                {existingIdentity.identity_code}
              </span>
            )}
          </div>

          {/* Phase 1 scope notice */}
          <div className="flex gap-2.5 bg-surface-800/50 border border-surface-700/60 rounded-lg px-3 py-2.5">
            <Info className="w-3.5 h-3.5 text-surface-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-surface-500 leading-relaxed">
              Phase 1 validates{' '}
              <span className="text-surface-400 font-medium">APR face identity</span> +{' '}
              <span className="text-surface-400 font-medium">BT body blueprint</span> combinations.
              Hair style, clothing library, accessories, and role linkage are added in Phase 2.
              Select one of each and click <span className="text-surface-400 font-medium">Save Appearance</span> to generate your Master AI Identity.
            </p>
          </div>
        </div>

        {/* ── Existing identity preview ─────────────────────────────────── */}
        {existingIdentity?.composed_preview_url && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-surface-300 flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-accent-400" />
                Current Master AI Identity
              </p>
              <span className="text-[10px] font-mono text-surface-600">{existingIdentity.identity_code}</span>
            </div>
            <div className="flex gap-4 items-start">
              <div className="relative rounded-xl overflow-hidden bg-surface-800 border border-accent-500/20 flex-shrink-0" style={{ width: 120, height: 160 }}>
                <img
                  src={existingIdentity.composed_preview_url}
                  alt={existingIdentity.identity_code}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="space-y-1">
                  <p className="text-[11px] text-surface-500">Face Identity</p>
                  <p className="text-xs text-surface-200 font-medium">
                    <span className="font-mono text-primary-400 mr-1.5">{existingIdentity.apr_code}</span>
                    {existingIdentity.apr_name}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-surface-500">Body Blueprint</p>
                  <p className="text-xs text-surface-200 font-medium">
                    <span className="font-mono text-primary-400 mr-1.5">{existingIdentity.bt_code}</span>
                    {existingIdentity.bt_name}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={existingIdentity.composed_preview_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-surface-400 hover:text-surface-200 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />Open full size
                  </a>
                  <span className="text-surface-700">·</span>
                  <button
                    onClick={() => copyUrl(existingIdentity.composed_preview_url!)}
                    className="flex items-center gap-1 text-[11px] text-surface-400 hover:text-surface-200 transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    {copied ? 'Copied!' : 'Copy URL'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Main selector card ────────────────────────────────────────── */}
        <div className="card space-y-6">

          {/* ── Face Identity (APR) ──────────────────────────────────── */}
          <FormSection title="Face Identity" icon={<User className="w-3 h-3" />} required>
            <p className="text-[10px] text-surface-600 -mt-1 mb-1">
              Select the AI face preset that defines this character's identity.
            </p>
            <div className="relative">
              <ScrollArrow dir="left"  onClick={() => scrollAPR('left')}  />
              <ScrollArrow dir="right" onClick={() => scrollAPR('right')} />
              <div
                ref={aprScrollRef}
                className="flex gap-3 overflow-x-auto px-1 py-1 mx-1"
                style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory' }}
              >
                {presets.map(preset => {
                  const selected = aprPresetId === preset.preset_id;
                  const fallback = PRESET_GRADIENTS[preset.preset_id] ?? 'linear-gradient(145deg,#1a1a2e,#2d2d4e)';
                  const isMyAI  = preset.preset_id === 'APR-008';

                  return (
                    <button
                      key={preset.preset_id}
                      onClick={() => setAprPresetId(preset.preset_id)}
                      style={{ scrollSnapAlign: 'start' }}
                      className={[
                        'flex-shrink-0 w-36 rounded-xl overflow-hidden border-2 transition-all text-left',
                        selected
                          ? 'border-primary-500 shadow-lg shadow-primary-500/20'
                          : 'border-surface-700 hover:border-surface-500',
                      ].join(' ')}
                    >
                      <div className="relative w-full overflow-hidden" style={{ height: '192px' }}>
                        {preset.image_url ? (
                          <img src={preset.image_url} alt={preset.preset_name} className="w-full h-full object-cover object-top" draggable={false} />
                        ) : isMyAI ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ background: fallback }}>
                            <div className="w-14 h-14 rounded-full bg-white/8 border-2 border-white/15 flex items-center justify-center">
                              <User className="w-7 h-7 text-white/40" />
                            </div>
                            <p className="text-[10px] text-white/30 text-center px-2 leading-relaxed">Creator uploads in Phase 2</p>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: fallback }}>
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                                <span className="text-xl font-bold text-white/30">{preset.preset_id.replace('APR-0', '')}</span>
                              </div>
                              <span className="text-[9px] text-white/20 uppercase tracking-wider">Preview pending</span>
                            </div>
                          </div>
                        )}
                        {selected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow-lg">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-2.5 pt-6 pb-2">
                          <p className="text-[11px] font-semibold text-white leading-tight">{preset.preset_name}</p>
                          <p className="text-[10px] text-white/50 font-mono">{preset.preset_tag ?? preset.preset_id}</p>
                        </div>
                      </div>
                      <div className={['h-1 w-full transition-colors', selected ? 'bg-primary-500' : 'bg-transparent'].join(' ')} />
                    </button>
                  );
                })}
              </div>
            </div>
            {aprPresetId && (
              <p className="text-[11px] text-surface-500 mt-1">
                Selected: <span className="font-mono text-primary-400">{aprPresetId}</span> — {selectedAPR?.preset_name}
              </p>
            )}
          </FormSection>

          {/* ── Body Blueprint (BT) ──────────────────────────────────── */}
          <FormSection title="Body Blueprint" icon={<Zap className="w-3 h-3" />} required>
            <p className="text-[10px] text-surface-600 -mt-1 mb-1">
              Select the body reference that defines physique, proportions, and clothing style.
            </p>
            <div className="relative">
              <ScrollArrow dir="left"  onClick={() => scrollBT('left')}  />
              <ScrollArrow dir="right" onClick={() => scrollBT('right')} />
              <div
                ref={btScrollRef}
                className="flex gap-3 overflow-x-auto px-1 py-1 mx-1"
                style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory' }}
              >
                {bodyPresets.map(preset => {
                  const selected = btPresetId === preset.preset_id;
                  const fallback = BT_GRADIENTS[preset.preset_id] ?? 'linear-gradient(160deg,#1a1a3d,#2a2a6e)';

                  return (
                    <button
                      key={preset.preset_id}
                      onClick={() => setBtPresetId(preset.preset_id)}
                      style={{ scrollSnapAlign: 'start' }}
                      className={[
                        'flex-shrink-0 w-36 rounded-xl overflow-hidden border-2 transition-all text-left',
                        selected
                          ? 'border-primary-500 shadow-lg shadow-primary-500/20'
                          : 'border-surface-700 hover:border-surface-500',
                      ].join(' ')}
                    >
                      <div className="relative w-full overflow-hidden" style={{ height: '224px' }}>
                        {preset.image_url ? (
                          <img src={preset.image_url} alt={preset.body_type_name} className="w-full h-full object-cover object-top" draggable={false} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: fallback }}>
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                                <span className="text-lg font-bold text-white/30">{preset.preset_id.replace('BT-0', '')}</span>
                              </div>
                              <span className="text-[9px] text-white/20 uppercase tracking-wider">Preview pending</span>
                            </div>
                          </div>
                        )}
                        {selected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow-lg">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-2.5 pt-6 pb-2">
                          <p className="text-[11px] font-semibold text-white leading-tight">{preset.body_type_name}</p>
                          <p className="text-[10px] text-white/40 font-mono">{preset.preset_id}</p>
                        </div>
                      </div>
                      <div className={['h-1 w-full transition-colors', selected ? 'bg-primary-500' : 'bg-transparent'].join(' ')} />
                    </button>
                  );
                })}
              </div>
            </div>
            {btPresetId && (
              <p className="text-[11px] text-surface-500 mt-1">
                Selected: <span className="font-mono text-primary-400">{btPresetId}</span> — {selectedBT?.body_type_name}
              </p>
            )}
          </FormSection>

          {/* ── Selection summary + Save ──────────────────────────────── */}
          <div className="pt-3 border-t border-surface-800 space-y-3">

            {/* Combination preview row */}
            {(aprPresetId || btPresetId) && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className={[
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors',
                  aprPresetId
                    ? 'bg-primary-500/8 border-primary-500/20 text-primary-400'
                    : 'bg-surface-800 border-surface-700 text-surface-600',
                ].join(' ')}>
                  <User className="w-3 h-3" />
                  {aprPresetId ?? 'No face selected'}
                  {selectedAPR && <span className="text-primary-500/60">· {selectedAPR.preset_name}</span>}
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-surface-600 flex-shrink-0" />
                <div className={[
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors',
                  btPresetId
                    ? 'bg-primary-500/8 border-primary-500/20 text-primary-400'
                    : 'bg-surface-800 border-surface-700 text-surface-600',
                ].join(' ')}>
                  <Zap className="w-3 h-3" />
                  {btPresetId ?? 'No body selected'}
                  {selectedBT && <span className="text-primary-500/60">· {selectedBT.body_type_name}</span>}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              {!canGenerate && (
                <p className="text-[11px] text-surface-600">
                  Select both a face identity and body blueprint to generate.
                </p>
              )}
              {canGenerate && !existingIdentity && (
                <p className="text-[11px] text-surface-500">Ready to generate your Master AI Identity.</p>
              )}
              {canGenerate && existingIdentity && (
                <p className="text-[11px] text-surface-500">
                  Generating a new identity will create{' '}
                  <span className="text-surface-400 font-medium">an additional record</span>, not overwrite {existingIdentity.identity_code}.
                </p>
              )}
              <button
                onClick={() => saveAndGenerate(false)}
                disabled={!canGenerate || isGenerating}
                className="btn-primary flex items-center gap-2 text-sm px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Save Appearance
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Generation Modal ──────────────────────────────────────────────── */}
      {showModal && (
        <GenerationModal
          state={genState}
          result={genResult}
          error={genError}
          aprName={selectedAPR?.preset_name ?? aprPresetId ?? ''}
          btName={selectedBT?.body_type_name ?? btPresetId ?? ''}
          onClose={closeModal}
          onRegenerate={() => saveAndGenerate(true)}
        />
      )}
    </>
  );
}

// ── Generation Modal ──────────────────────────────────────────────────────────

function GenerationModal({
  state, result, error, aprName, btName, onClose, onRegenerate,
}: {
  state:         GenState;
  result:        AiIdentity | null;
  error:         string | null;
  aprName:       string;
  btName:        string;
  onClose:       () => void;
  onRegenerate:  () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl overflow-hidden">

        {/* ── Loading / Saving / Generating states ──────────────────── */}
        {(state === 'saving' || state === 'generating') && (
          <div className="p-8 space-y-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full bg-primary-500/10 border border-primary-500/20 animate-pulse" />
                <div className="absolute inset-2 rounded-full bg-primary-500/15 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-primary-400" />
                </div>
              </div>
              <div>
                <h3 className="text-base font-semibold text-surface-100">Creating Master AI Identity</h3>
                <p className="text-sm text-surface-500 mt-1">
                  {aprName} · {btName}
                </p>
              </div>
            </div>

            {/* Status steps */}
            <div className="space-y-2.5">
              {[
                { label: 'Saving selections',     done: state === 'generating', active: state === 'saving'     },
                { label: 'Analysing face identity (APR)', done: false, active: state === 'generating' },
                { label: 'Analysing body blueprint (BT)', done: false, active: state === 'generating' },
                { label: 'Composing Master Identity',     done: false, active: state === 'generating' },
                { label: 'Storing result',               done: false, active: false                   },
              ].map(({ label, done, active }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={[
                    'w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all',
                    done   ? 'bg-accent-500/20 border-accent-500/40'  :
                    active ? 'bg-primary-500/15 border-primary-500/30 animate-pulse' :
                             'bg-surface-800 border-surface-700',
                  ].join(' ')}>
                    {done ? (
                      <Check className="w-2.5 h-2.5 text-accent-400" />
                    ) : active ? (
                      <Loader2 className="w-2.5 h-2.5 text-primary-400 animate-spin" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-surface-700" />
                    )}
                  </div>
                  <span className={[
                    'text-xs transition-colors',
                    done   ? 'text-accent-400'   :
                    active ? 'text-surface-200'  :
                             'text-surface-600',
                  ].join(' ')}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-center text-[11px] text-surface-600">
              Please wait — this typically takes 10–30 seconds.
            </p>
          </div>
        )}

        {/* ── Success state ──────────────────────────────────────────── */}
        {state === 'success' && result && (
          <div className="space-y-0">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-accent-500/15 border border-accent-500/30 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-accent-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-surface-100">AI Identity Created</p>
                  <p className="text-[11px] font-mono text-accent-400">{result.identity_code}</p>
                </div>
              </div>
              <p className="text-[11px] text-surface-500">
                <span className="font-mono text-primary-400">{result.apr_code}</span> {result.apr_name}
                {' '}<span className="text-surface-600">+</span>{' '}
                <span className="font-mono text-primary-400">{result.bt_code}</span> {result.bt_name}
              </p>
            </div>

            {/* Preview image */}
            {result.composed_preview_url && (
              <div className="relative bg-surface-800 mx-6 rounded-xl overflow-hidden border border-surface-700" style={{ height: 280 }}>
                <img
                  src={result.composed_preview_url}
                  alt={result.identity_code}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-white/60">{result.identity_code}</span>
                  <a
                    href={result.composed_preview_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-white/70 hover:text-white transition-colors bg-black/40 px-2 py-1 rounded-lg"
                  >
                    <ExternalLink className="w-3 h-3" />Open full size
                  </a>
                </div>
              </div>
            )}

            {/* URL copy */}
            {result.composed_preview_url && (
              <div className="mx-6 mt-3 flex items-center gap-2 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2">
                <span className="text-[10px] font-mono text-surface-500 flex-1 truncate">
                  {result.composed_preview_url}
                </span>
                <button
                  onClick={() => copyUrl(result.composed_preview_url!)}
                  className="flex items-center gap-1 text-[11px] text-surface-400 hover:text-surface-200 transition-colors flex-shrink-0"
                >
                  <Copy className="w-3 h-3" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}

            {/* Identity use notice */}
            <div className="mx-6 mt-3 flex gap-2 bg-primary-500/5 border border-primary-500/15 rounded-lg px-3 py-2.5">
              <Info className="w-3.5 h-3.5 text-primary-500/60 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-surface-600 leading-relaxed">
                This identity becomes the canonical reference for your Image Library, Scenario Library, Package Library, Video Library, and AI Companion System.
              </p>
            </div>

            {/* Action buttons */}
            <div className="px-6 py-5 flex items-center gap-3">
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-600 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />Regenerate
              </button>
              <button
                onClick={onClose}
                className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm py-2"
              >
                <Check className="w-3.5 h-3.5" />Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Error state ────────────────────────────────────────────── */}
        {state === 'error' && (
          <div className="p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-danger-500/15 border border-danger-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertCircle className="w-4 h-4 text-danger-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-100">Generation Failed</p>
                <p className="text-[11px] text-surface-500 mt-0.5">
                  {aprName} + {btName}
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-surface-800 border border-danger-500/20 rounded-lg px-3 py-2.5">
                <p className="text-[11px] text-danger-400 leading-relaxed">{error}</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg text-xs font-medium border border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-600 transition-colors"
              >
                Close
              </button>
              <button
                onClick={onRegenerate}
                className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm py-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function FormSection({ title, icon, required, children }: {
  title:     string;
  icon?:     React.ReactNode;
  required?: boolean;
  children:  React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider flex items-center gap-1.5">
        {icon}
        {title}
        {required && <span className="text-danger-400 text-[10px] normal-case font-normal tracking-normal ml-0.5">required</span>}
      </p>
      {children}
    </div>
  );
}

function ScrollArrow({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'absolute top-1/2 -translate-y-10 z-10 w-7 h-7 rounded-full bg-surface-800 border border-surface-700',
        'flex items-center justify-center hover:bg-surface-700 transition-colors shadow-md',
        dir === 'left' ? '-translate-x-3.5 left-0' : 'translate-x-3.5 right-0',
      ].join(' ')}
      aria-label={`Scroll ${dir}`}
    >
      {dir === 'left'
        ? <ChevronLeft  className="w-3.5 h-3.5 text-surface-300" />
        : <ChevronRight className="w-3.5 h-3.5 text-surface-300" />
      }
    </button>
  );
}
