import { useState, useEffect } from 'react';
import {
  Images, Sparkles, RefreshCw, ExternalLink, Trash2,
  Loader2, AlertCircle, CheckCircle2, ImageOff,
  Info, Cpu, Shirt, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AiIdentity {
  id:                   string;
  identity_code:        string;
  apr_code:             string;
  apr_name:             string | null;
  bt_code:              string;
  bt_name:              string | null;
  composed_preview_url: string | null;
}

interface RoleBlueprint {
  id:              string;
  role_code:       string;
  role_name:       string;
  dress_code:      string | null;
  accessory_codes: string[];
}

interface RoleImage {
  id:                    string;
  image_code:            string;
  role_code:             string;
  phase:                 Phase;
  sequence:              number;
  version:               number;
  image_url:             string | null;
  generation_status:     GenStatus;
  error_message:         string | null;
  master_ai_identity_id: string | null;
  metadata:              Record<string, unknown>;
  created_at:            string;
  updated_at:            string;
}

type Phase     = 'beginning' | 'middle' | 'ending';
type GenStatus = 'pending' | 'generating' | 'generated' | 'failed';

// ── Static configuration ───────────────────────────────────────────────────────

const PHASE_ORDER: Phase[] = ['beginning', 'middle', 'ending'];

const PHASE_LABEL: Record<Phase, string> = {
  beginning: 'Beginning',
  middle:    'Middle',
  ending:    'Ending',
};

const PHASE_COLOR: Record<Phase, string> = {
  beginning: 'text-accent-400 bg-accent-500/10 border-accent-500/20',
  middle:    'text-primary-400 bg-primary-500/10 border-primary-500/20',
  ending:    'text-warning-400 bg-warning-500/10 border-warning-500/20',
};

interface ImageSlot {
  code:     string;
  phase:    Phase;
  sequence: number;
}

function buildSlots(prefix: string): ImageSlot[] {
  return PHASE_ORDER.flatMap((phase, pi) =>
    [1, 2, 3].map(seq => ({
      code:     `${prefix}-IMG-${String(pi * 3 + seq).padStart(3, '0')}`,
      phase,
      sequence: seq,
    })),
  );
}

const ROLE_PREFIXES: Record<string, string> = {
  'MT-001': 'MT',
  'GF-001': 'GF',
  'DF-001': 'DF',
  'PE-001': 'PE',
  'RP-001': 'RP',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function ImageLibraryPage({ creatorId, defaultRoleCode }: { creatorId: string; defaultRoleCode?: string }) {
  const [activeIdentity,      setActiveIdentity]      = useState<AiIdentity | null>(null);
  const [blueprints,         setBlueprints]         = useState<RoleBlueprint[]>([]);
  // Maps dress_code → dress_name for display
  const [dressNames,         setDressNames]         = useState<Record<string, string>>({});
  const [activeRoleCode,     setActiveRoleCode]     = useState<string>('');
  const [dbImages,           setDbImages]           = useState<Map<string, RoleImage>>(new Map());
  const [generatingCodes,    setGeneratingCodes]    = useState<Set<string>>(new Set());
  const [loading,            setLoading]            = useState(true);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [idRes, bpRes] = await Promise.all([
        supabase
          .from('master_ai_identities')
          .select('id, identity_code, apr_code, apr_name, bt_code, bt_name, composed_preview_url')
          .eq('creator_id', creatorId)
          .eq('generation_status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('ai_role_blueprints')
          .select('id, role_code, role_name, dress_code, accessory_codes')
          .eq('is_active', true)
          .order('role_name'),
      ]);

      const identity = idRes.data as AiIdentity | null;
      const bps      = (bpRes.data ?? []) as RoleBlueprint[];

      // Load dress names for all blueprint dress_codes
      const codes = bps.map(b => b.dress_code).filter(Boolean) as string[];
      if (codes.length > 0) {
        const { data: dresses } = await supabase
          .from('ai_dress_library')
          .select('dress_code, dress_name')
          .in('dress_code', codes);
        const nameMap: Record<string, string> = {};
        for (const d of dresses ?? []) nameMap[d.dress_code] = d.dress_name;
        setDressNames(nameMap);
      }

      setActiveIdentity(identity);
      setBlueprints(bps);
      if (bps.length > 0) {
        const hasDefault = defaultRoleCode && bps.some(b => b.role_code === defaultRoleCode);
        setActiveRoleCode(hasDefault ? defaultRoleCode : bps[0].role_code);
      }
      setLoading(false);
    })();
  }, [creatorId]);

  // ── Load images for active role ───────────────────────────────────────────
  useEffect(() => {
    if (!activeRoleCode) return;
    (async () => {
      const { data } = await supabase
        .from('role_image_library')
        .select('*')
        .eq('creator_id', creatorId)
        .eq('role_code', activeRoleCode);

      const map = new Map<string, RoleImage>();
      for (const row of data ?? []) map.set(row.image_code, row as RoleImage);
      setDbImages(map);
    })();
  }, [creatorId, activeRoleCode]);

  // ── Generate one image ────────────────────────────────────────────────────
  async function generate(slot: ImageSlot) {
    if (!activeIdentity || generatingCodes.has(slot.code)) return;

    const blueprint = blueprints.find(b => b.role_code === activeRoleCode);
    if (!blueprint) return;

    setGeneratingCodes(prev => new Set(prev).add(slot.code));

    setDbImages(prev => {
      const next     = new Map(prev);
      const existing = next.get(slot.code);
      next.set(slot.code, {
        id:                    existing?.id ?? '',
        image_code:            slot.code,
        role_code:             activeRoleCode,
        phase:                 slot.phase,
        sequence:              slot.sequence,
        version:               (existing?.version ?? 0) + 1,
        image_url:             existing?.image_url ?? null,
        generation_status:     'generating',
        error_message:         null,
        master_ai_identity_id: activeIdentity.id,
        metadata:              existing?.metadata ?? {},
        created_at:            existing?.created_at ?? new Date().toISOString(),
        updated_at:            new Date().toISOString(),
      });
      return next;
    });

    setDbImages(prev => {
      const next = new Map(prev);
      const existing = next.get(slot.code);
      if (existing) next.set(slot.code, { ...existing, generation_status: 'failed', error_message: 'This generation tool has been retired. Use Role Studio V2 instead.' });
      return next;
    });
    setGeneratingCodes(prev => { const n = new Set(prev); n.delete(slot.code); return n; });
  }

  // ── Delete one image ──────────────────────────────────────────────────────
  async function deleteImage(imageCode: string) {
    await supabase
      .from('role_image_library')
      .delete()
      .eq('creator_id', creatorId)
      .eq('image_code', imageCode);

    setDbImages(prev => { const n = new Map(prev); n.delete(imageCode); return n; });
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeBlueprint  = blueprints.find(b => b.role_code === activeRoleCode) ?? null;
  const activePrefix     = ROLE_PREFIXES[activeRoleCode] ?? activeRoleCode.split('-')[0];
  const activeSlots      = buildSlots(activePrefix);
  const totalSlots       = activeSlots.length;
  const generatedCount   = activeSlots.filter(
    s => dbImages.get(s.code)?.generation_status === 'generated',
  ).length;

  const activeDressName  = activeBlueprint?.dress_code
    ? (dressNames[activeBlueprint.dress_code] ?? activeBlueprint.dress_code)
    : null;

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-600/15 border border-primary-600/20 flex items-center justify-center flex-shrink-0">
              <Images className="w-4 h-4 text-primary-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-surface-200">Image Library</h3>
                <span className="text-[10px] font-mono text-primary-500 bg-primary-500/8 border border-primary-500/20 px-1.5 py-0.5 rounded">Phase 1</span>
              </div>
              <p className="text-[11px] text-surface-500">Role-based image generation using your Master AI Identity</p>
            </div>
          </div>
          {activeIdentity && (
            <span className="flex items-center gap-1.5 text-[11px] text-accent-400 bg-accent-500/8 border border-accent-500/20 px-2.5 py-1 rounded-full font-medium flex-shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              {activeIdentity.identity_code}
            </span>
          )}
        </div>

        <div className="flex gap-2.5 bg-surface-800/50 border border-surface-700/60 rounded-lg px-3 py-2.5">
          <Info className="w-3.5 h-3.5 text-surface-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-surface-500 leading-relaxed">
            Each image is an independent asset — regenerating one never affects any other.
            The full pipeline is validated before every render: Identity → Body Asset → Base Clothing → Dress Layer → Accessories → Role Blueprint.
          </p>
        </div>
      </div>

      {/* ── No identity ───────────────────────────────────────────────────── */}
      {!activeIdentity && (
        <div className="card flex flex-col items-center justify-center py-14 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center mb-4">
            <Cpu className="w-6 h-6 text-surface-600" />
          </div>
          <p className="text-sm font-semibold text-surface-300 mb-1.5">No Master AI Identity yet</p>
          <p className="text-[11px] text-surface-500 max-w-sm leading-relaxed">
            Create a Master AI Identity in the Appearance Library first.
            The Image Library uses it as the foundation for every generated image.
          </p>
        </div>
      )}

      {activeIdentity && (
        <>
          {/* ── Role tabs + image grid ─────────────────────────────────────── */}
          <div className="card !p-0 overflow-hidden">

            {/* Role tab bar */}
            <div className="flex overflow-x-auto border-b border-surface-800" style={{ scrollbarWidth: 'none' }}>
              {blueprints.map(bp => {
                const active  = bp.role_code === activeRoleCode;
                const prefix  = ROLE_PREFIXES[bp.role_code] ?? bp.role_code.split('-')[0];
                const slots   = buildSlots(prefix);
                const count   = slots.filter(s => dbImages.get(s.code)?.generation_status === 'generated').length;
                return (
                  <button
                    key={bp.role_code}
                    onClick={() => setActiveRoleCode(bp.role_code)}
                    className={[
                      'flex-shrink-0 flex flex-col items-center gap-1 px-5 py-3.5 text-xs font-medium transition-colors border-b-2',
                      active
                        ? 'border-primary-500 text-primary-300 bg-primary-500/5'
                        : 'border-transparent text-surface-500 hover:text-surface-300 hover:bg-surface-800/50',
                    ].join(' ')}
                  >
                    <span>{bp.role_name}</span>
                    <span className={[
                      'text-[10px] font-mono px-1.5 py-0.5 rounded',
                      count > 0 ? 'text-accent-400 bg-accent-500/10' : 'text-surface-600 bg-surface-800',
                    ].join(' ')}>
                      {count}/{slots.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Role + outfit summary bar */}
            {activeBlueprint && (
              <div className="px-4 py-2.5 bg-surface-900/50 border-b border-surface-800 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[11px] text-surface-500">
                    <span className="font-mono text-surface-400">{activeBlueprint.role_code}</span>
                    {' '}{activeBlueprint.role_name}
                  </span>

                  {/* Outfit layer */}
                  {activeDressName ? (
                    <span className="flex items-center gap-1 text-[10px] text-surface-400 bg-surface-800 border border-surface-700 px-2 py-0.5 rounded">
                      <Shirt className="w-3 h-3 text-surface-500" />
                      {activeDressName}
                      <span className="font-mono text-surface-600 ml-0.5">{activeBlueprint.dress_code}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-warning-400 bg-warning-500/10 border border-warning-500/20 px-2 py-0.5 rounded">
                      <AlertTriangle className="w-3 h-3" />
                      No outfit configured
                    </span>
                  )}

                  {/* Accessory count */}
                  {activeBlueprint.accessory_codes.length > 0 && (
                    <span className="text-[10px] text-surface-500 font-mono">
                      +{activeBlueprint.accessory_codes.length} accessory{activeBlueprint.accessory_codes.length > 1 ? 'ies' : ''}
                    </span>
                  )}
                </div>

                <span className="text-[11px] text-surface-500 flex-shrink-0">
                  <span className="text-surface-300 font-medium">{generatedCount}</span>/{totalSlots} generated
                </span>
              </div>
            )}

            {/* Phase sections */}
            <div className="p-4 space-y-6">
              {PHASE_ORDER.map(phase => {
                const phaseSlots = activeSlots.filter(s => s.phase === phase);
                return (
                  <div key={phase} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${PHASE_COLOR[phase]}`}>
                        {PHASE_LABEL[phase]}
                      </span>
                      <div className="flex-1 h-px bg-surface-800" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {phaseSlots.map(slot => (
                        <ImageCard
                          key={slot.code}
                          slot={slot}
                          dbRecord={dbImages.get(slot.code) ?? null}
                          isGenerating={generatingCodes.has(slot.code)}
                          identityCode={activeIdentity?.identity_code ?? null}
                          blueprintDressCode={activeBlueprint?.dress_code ?? null}
                          blueprintDressName={activeDressName}
                          onGenerate={() => generate(slot)}
                          onDelete={() => deleteImage(slot.code)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Image Card ────────────────────────────────────────────────────────────────

function ImageCard({
  slot,
  dbRecord,
  isGenerating,
  identityCode,
  blueprintDressCode,
  blueprintDressName,
  onGenerate,
  onDelete,
}: {
  slot:               ImageSlot;
  dbRecord:           RoleImage | null;
  isGenerating:       boolean;
  identityCode:       string | null;
  blueprintDressCode: string | null;
  blueprintDressName: string | null;
  onGenerate:         () => void;
  onDelete:           () => void;
}) {
  const status    = isGenerating ? 'generating' : (dbRecord?.generation_status ?? 'pending');
  const hasImage  = status === 'generated' && !!dbRecord?.image_url;
  const hasFailed = status === 'failed';

  // Extract layer info from stored metadata (available once image has been generated)
  const meta          = dbRecord?.metadata ?? {};
  const usedDress     = (meta.dress_name as string | undefined) ?? null;
  const usedDressCode = (meta.dress_code as string | undefined) ?? null;

  // For pending/empty cards, show what the blueprint will use
  const pendingDress = blueprintDressName ?? blueprintDressCode;

  return (
    <div className="rounded-xl border border-surface-700 bg-surface-900 overflow-hidden flex flex-col">

      {/* ── Image area ────────────────────────────────────────────────── */}
      <div className="relative bg-surface-800" style={{ aspectRatio: '3/4', maxHeight: 220 }}>

        {hasImage && (
          <>
            <img src={dbRecord!.image_url!} alt={slot.code} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            {dbRecord!.version > 1 && (
              <div className="absolute top-2 left-2 text-[10px] font-mono text-white/70 bg-black/50 px-1.5 py-0.5 rounded">
                v{dbRecord!.version}
              </div>
            )}
            <div className="absolute top-2 right-2 flex gap-1.5">
              <a
                href={dbRecord!.image_url!}
                target="_blank"
                rel="noreferrer"
                className="w-7 h-7 rounded-lg bg-black/50 border border-white/10 flex items-center justify-center hover:bg-black/70 transition-colors"
                title="Open full size"
              >
                <ExternalLink className="w-3 h-3 text-white/70" />
              </a>
              <button
                onClick={onDelete}
                className="w-7 h-7 rounded-lg bg-black/50 border border-white/10 flex items-center justify-center hover:bg-danger-500/30 hover:border-danger-500/30 transition-colors"
                title="Delete image"
              >
                <Trash2 className="w-3 h-3 text-white/70" />
              </button>
            </div>
          </>
        )}

        {status === 'generating' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-800">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-primary-500/10 border border-primary-500/20 animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
              </div>
            </div>
            <p className="text-[10px] text-surface-500">Generating…</p>
          </div>
        )}

        {!hasImage && status !== 'generating' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            {hasFailed
              ? <AlertCircle className="w-8 h-8 text-danger-500/40" />
              : <ImageOff className="w-8 h-8 text-surface-700" />
            }
          </div>
        )}
      </div>

      {/* ── Card footer ───────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-surface-400">{slot.code}</span>
          <StatusBadge status={status} />
        </div>

        {/* Layer snapshot — shown once generated */}
        {hasImage && (usedDress || usedDressCode) && (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Shirt className="w-3 h-3 text-surface-600 flex-shrink-0" />
              <span className="text-[10px] text-surface-500 truncate">
                {usedDress ?? usedDressCode}
              </span>
            </div>
          </div>
        )}

        {/* Pending dress preview (what will be used) */}
        {status === 'pending' && pendingDress && (
          <div className="flex items-center gap-1">
            <Shirt className="w-3 h-3 text-surface-700 flex-shrink-0" />
            <span className="text-[10px] text-surface-600 truncate">Will use: {pendingDress}</span>
          </div>
        )}

        {hasFailed && dbRecord?.error_message && (
          <p className="text-[10px] text-danger-400 leading-relaxed line-clamp-2">
            {dbRecord.error_message}
          </p>
        )}

        {identityCode && (
          <p className="text-[10px] text-surface-600 font-mono truncate">{identityCode}</p>
        )}

        <button
          onClick={onGenerate}
          disabled={!identityCode || status === 'generating'}
          className={[
            'w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all border',
            !identityCode || status === 'generating'
              ? 'opacity-40 cursor-not-allowed bg-surface-800 border-surface-700 text-surface-500'
              : hasImage
                ? 'bg-surface-800 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200'
                : hasFailed
                  ? 'bg-danger-500/10 border-danger-500/20 text-danger-400 hover:bg-danger-500/15'
                  : 'bg-primary-500/10 border-primary-500/20 text-primary-400 hover:bg-primary-500/15',
          ].join(' ')}
        >
          {status === 'generating' ? (
            <><Loader2 className="w-3 h-3 animate-spin" />Generating</>
          ) : hasImage ? (
            <><RefreshCw className="w-3 h-3" />Regenerate</>
          ) : hasFailed ? (
            <><RefreshCw className="w-3 h-3" />Retry</>
          ) : (
            <><Sparkles className="w-3 h-3" />Generate</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'generated') return (
    <span className="flex items-center gap-1 text-[10px] text-accent-400 bg-accent-500/10 px-1.5 py-0.5 rounded border border-accent-500/20">
      <CheckCircle2 className="w-2.5 h-2.5" />Done
    </span>
  );
  if (status === 'generating') return (
    <span className="flex items-center gap-1 text-[10px] text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded border border-primary-500/20">
      <Loader2 className="w-2.5 h-2.5 animate-spin" />Generating
    </span>
  );
  if (status === 'failed') return (
    <span className="flex items-center gap-1 text-[10px] text-danger-400 bg-danger-500/10 px-1.5 py-0.5 rounded border border-danger-500/20">
      <AlertCircle className="w-2.5 h-2.5" />Failed
    </span>
  );
  return (
    <span className="text-[10px] text-surface-600 bg-surface-800 px-1.5 py-0.5 rounded border border-surface-700">
      Empty
    </span>
  );
}
