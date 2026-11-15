import { useState, useEffect, useRef } from 'react';
import {
  Shirt, Sparkles, RefreshCw, ExternalLink, Trash2, Search,
  Loader2, AlertCircle, CheckCircle2, ImageOff,
  StickyNote, Check, X, Zap, Box, Cpu,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Dress {
  id:                          string;
  dress_code:                  string;
  dress_name:                  string;
  garment_type:                string | null;
  role_code:                   string | null;
  category:                    string | null;
  description:                 string | null;
  generation_prompt_fragment:  string | null;
  image_url:                   string | null;
  metadata:                    Record<string, unknown>;
  sort_order:                  number;
  compatible_accessories:      string[];
  animation_ready:             boolean;
  gpu_ready:                   boolean;
  reusable_layer:              boolean;
  physics_preset:              Record<string, unknown>;
}

interface CreatorUniform {
  id:                    string;
  dress_id:              string;
  master_ai_identity_id: string | null;
  preview_image_url:     string | null;
  generation_status:     GenStatus;
  error_message:         string | null;
  version:               number;
  render_base:           string | null;
  creator_notes:         string | null;
  metadata:              Record<string, unknown>;
}

type GenStatus = 'pending' | 'generating' | 'generated' | 'failed';

// ── Static configuration ───────────────────────────────────────────────────────

const ROLE_TABS = [
  { code: 'all',    name: 'All' },
  { code: 'MT-001', name: 'Massage Therapist' },
  { code: 'GF-001', name: 'Girlfriend' },
  { code: 'DF-001', name: 'Dating' },
  { code: 'PE-001', name: 'Personal Escort' },
  { code: 'RP-001', name: 'Roleplay' },
  { code: 'UNI',    name: 'Universal' },
];

const ROLE_GRADIENT: Record<string, string> = {
  'MT-001': 'linear-gradient(160deg,#1a2e2e,#0d4a3a)',
  'GF-001': 'linear-gradient(160deg,#2e1a2e,#5a1a4a)',
  'DF-001': 'linear-gradient(160deg,#1a1a3d,#2a2a6e)',
  'PE-001': 'linear-gradient(160deg,#2e2010,#6a4010)',
  'RP-001': 'linear-gradient(160deg,#1a0a2e,#3a1a5a)',
  'UNI':    'linear-gradient(160deg,#1a2a1a,#2a4a2a)',
};

function roleForDress(dress: Dress): string {
  return dress.role_code ?? 'UNI';
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function UniformLibraryPage({ creatorId, defaultRoleCode }: { creatorId: string; defaultRoleCode?: string }) {
  const [dresses,        setDresses]        = useState<Dress[]>([]);
  const [creatorLibrary, setCreatorLibrary] = useState<Map<string, CreatorUniform>>(new Map());
  const [generatingIds,  setGeneratingIds]  = useState<Set<string>>(new Set());
  const [activeRoleCode, setActiveRoleCode] = useState<string>(defaultRoleCode ?? 'all');
  const [searchQuery,    setSearchQuery]    = useState<string>('');
  const [loading,        setLoading]        = useState(true);

  // ── Load catalog and creator records ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: dressRows } = await supabase
        .from('ai_dress_library')
        .select('id, dress_code, dress_name, garment_type, role_code, category, description, generation_prompt_fragment, image_url, metadata, sort_order, compatible_accessories, animation_ready, gpu_ready, reusable_layer, physics_preset')
        .eq('is_active', true)
        .order('sort_order');

      const allDresses = (dressRows ?? []) as Dress[];
      setDresses(allDresses);

      if (allDresses.length > 0) {
        const { data: libRows } = await supabase
          .from('creator_uniform_library')
          .select('*')
          .eq('creator_id', creatorId);

        const map = new Map<string, CreatorUniform>();
        for (const row of libRows ?? []) map.set(row.dress_id, row as CreatorUniform);
        setCreatorLibrary(map);
      }

      setLoading(false);
    })();
  }, [creatorId]);

  // ── Generate dress asset ───────────────────────────────────────────────────
  async function generate(dress: Dress) {
    if (generatingIds.has(dress.id)) return;

    setGeneratingIds(prev => new Set(prev).add(dress.id));

    // Optimistic update
    setCreatorLibrary(prev => {
      const next     = new Map(prev);
      const existing = next.get(dress.id);
      next.set(dress.id, {
        id:                    existing?.id ?? '',
        dress_id:              dress.id,
        master_ai_identity_id: null,
        preview_image_url:     existing?.preview_image_url ?? null,
        generation_status:     'generating',
        error_message:         null,
        version:               (existing?.version ?? 0) + 1,
        render_base:           'text_to_image',
        creator_notes:         existing?.creator_notes ?? null,
        metadata:              existing?.metadata ?? {},
      });
      return next;
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token ?? '';

      setCreatorLibrary(prev => {
        const next = new Map(prev);
        const existing = next.get(dress.id);
        if (existing) next.set(dress.id, { ...existing, generation_status: 'failed', error_message: 'This generation tool has been retired.' });
        return next;
      });
    } finally {
      setGeneratingIds(prev => { const n = new Set(prev); n.delete(dress.id); return n; });
    }
  }

  async function deletePreview(dressId: string) {
    await supabase.from('creator_uniform_library').delete()
      .eq('creator_id', creatorId).eq('dress_id', dressId);
    setCreatorLibrary(prev => { const n = new Map(prev); n.delete(dressId); return n; });
  }

  async function saveNotes(dressId: string, notes: string) {
    await supabase.from('creator_uniform_library').upsert(
      { creator_id: creatorId, dress_id: dressId, creator_notes: notes, updated_at: new Date().toISOString() },
      { onConflict: 'creator_id,dress_id' },
    );
    setCreatorLibrary(prev => {
      const next     = new Map(prev);
      const existing = next.get(dressId) ?? {
        id: '', dress_id: dressId, master_ai_identity_id: null,
        preview_image_url: null, generation_status: 'pending' as GenStatus,
        error_message: null, version: 1, render_base: null,
        creator_notes: notes, metadata: {},
      };
      next.set(dressId, { ...existing, creator_notes: notes });
      return next;
    });
  }

  // ── Filter + group ─────────────────────────────────────────────────────────
  const q = searchQuery.toLowerCase().trim();

  const visibleDresses = dresses.filter(d => {
    const matchesRole =
      activeRoleCode === 'all' ||
      (activeRoleCode === 'UNI' ? !d.role_code : d.role_code === activeRoleCode);
    const matchesSearch = !q || (
      d.dress_name.toLowerCase().includes(q) ||
      d.dress_code.toLowerCase().includes(q) ||
      (d.garment_type ?? '').toLowerCase().includes(q) ||
      (d.category ?? '').toLowerCase().includes(q) ||
      (d.description ?? '').toLowerCase().includes(q)
    );
    return matchesRole && matchesSearch;
  });

  const grouped = visibleDresses.reduce<Record<string, Dress[]>>((acc, d) => {
    const key = d.category ?? 'Uncategorised';
    (acc[key] ??= []).push(d);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  function genCountForRole(roleCode: string): number {
    const relevant = dresses.filter(d =>
      roleCode === 'all' ? true : roleCode === 'UNI' ? !d.role_code : d.role_code === roleCode,
    );
    return relevant.filter(d => creatorLibrary.get(d.id)?.generation_status === 'generated').length;
  }

  function totalForRole(roleCode: string): number {
    return dresses.filter(d =>
      roleCode === 'all' ? true : roleCode === 'UNI' ? !d.role_code : d.role_code === roleCode,
    ).length;
  }

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-600/15 border border-primary-600/20 flex items-center justify-center flex-shrink-0">
              <Shirt className="w-4 h-4 text-primary-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-surface-200">Dress Library</h3>
                <span className="text-[10px] font-mono text-primary-500 bg-primary-500/8 border border-primary-500/20 px-1.5 py-0.5 rounded">Reusable Assets</span>
              </div>
              <p className="text-[11px] text-surface-500 mt-0.5">Generate garment layer assets for the Image Library rendering pipeline</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-surface-500 flex-shrink-0">
            <Box className="w-3 h-3" />
            <span className="font-mono">{dresses.filter(d => d.image_url).length}/{dresses.length} assets</span>
          </div>
        </div>

        {/* Architecture note */}
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          {[
            { label: 'Garment Only',     desc: 'No face, no body, no anatomy',   icon: Shirt },
            { label: 'Invisible Mannequin', desc: 'Product photography technique', icon: Box },
            { label: 'Reusable Layer',   desc: 'Applied per image during render', icon: Cpu },
          ].map(({ label, desc, icon: Icon }) => (
            <div key={label} className="bg-surface-800/50 border border-surface-700/60 rounded-lg px-2.5 py-2 flex items-start gap-2">
              <Icon className="w-3 h-3 text-surface-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-surface-300">{label}</div>
                <div className="text-surface-600 leading-relaxed">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Catalog ─────────────────────────────────────────────────────────── */}
      <div className="card !p-0 overflow-hidden">

        {/* Search + role tabs */}
        <div className="border-b border-surface-800">
          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-600" />
              <input
                type="text"
                placeholder="Search dresses…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/50 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex overflow-x-auto pb-px" style={{ scrollbarWidth: 'none' }}>
            {ROLE_TABS.map(tab => {
              const active = tab.code === activeRoleCode;
              const count  = genCountForRole(tab.code);
              const total  = totalForRole(tab.code);
              return (
                <button
                  key={tab.code}
                  onClick={() => setActiveRoleCode(tab.code)}
                  className={[
                    'flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2',
                    active
                      ? 'border-primary-500 text-primary-300 bg-primary-500/5'
                      : 'border-transparent text-surface-500 hover:text-surface-300 hover:bg-surface-800/50',
                  ].join(' ')}
                >
                  <span>{tab.name}</span>
                  {count > 0 ? (
                    <span className="text-[10px] font-mono text-accent-400 bg-accent-500/10 px-1 py-px rounded">
                      {count}/{total}
                    </span>
                  ) : total > 0 ? (
                    <span className="text-[10px] font-mono text-surface-600 bg-surface-800 px-1 py-px rounded">
                      {total}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dress grid */}
        <div className="p-4 space-y-7">
          {categories.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ImageOff className="w-8 h-8 text-surface-700 mb-3" />
              <p className="text-sm text-surface-500">No dresses match your search.</p>
            </div>
          )}

          {categories.map(category => (
            <div key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-widest px-2 py-0.5 bg-surface-800 border border-surface-700 rounded">
                  {category}
                </span>
                <div className="flex-1 h-px bg-surface-800" />
                <span className="text-[10px] text-surface-600">{grouped[category].length}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {grouped[category].map(dress => (
                  <DressCard
                    key={dress.id}
                    dress={dress}
                    creatorEntry={creatorLibrary.get(dress.id) ?? null}
                    isGenerating={generatingIds.has(dress.id)}
                    onGenerate={() => generate(dress)}
                    onDelete={() => deletePreview(dress.id)}
                    onSaveNotes={(notes) => saveNotes(dress.id, notes)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Dress Card ─────────────────────────────────────────────────────────────────

function DressCard({
  dress,
  creatorEntry,
  isGenerating,
  onGenerate,
  onDelete,
  onSaveNotes,
}: {
  dress:        Dress;
  creatorEntry: CreatorUniform | null;
  isGenerating: boolean;
  onGenerate:   () => void;
  onDelete:     () => void;
  onSaveNotes:  (notes: string) => void;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue,   setNotesValue]   = useState(creatorEntry?.creator_notes ?? '');
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setNotesValue(creatorEntry?.creator_notes ?? ''); }, [creatorEntry?.creator_notes]);
  useEffect(() => { if (editingNotes) notesRef.current?.focus(); }, [editingNotes]);

  const status    = isGenerating ? 'generating' : (creatorEntry?.generation_status ?? 'pending');
  // Prefer the canonical catalog image (shared asset), fall back to per-creator record
  const imageUrl  = dress.image_url ?? creatorEntry?.preview_image_url ?? null;
  const hasImage  = !!imageUrl && (status === 'generated' || !!dress.image_url);
  const hasFailed = status === 'failed';
  const gradient  = ROLE_GRADIENT[roleForDress(dress)] ?? ROLE_GRADIENT['UNI'];

  function commitNotes() { onSaveNotes(notesValue.trim()); setEditingNotes(false); }
  function cancelNotes() { setNotesValue(creatorEntry?.creator_notes ?? ''); setEditingNotes(false); }

  return (
    <div className="rounded-xl border border-surface-700 bg-surface-900 overflow-hidden flex flex-col group">

      {/* ── Image area ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ aspectRatio: '3/4' }}>
        <div className="absolute inset-0" style={{ background: gradient }} />

        {hasImage && (
          <img
            src={imageUrl!}
            alt={dress.dress_name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {hasImage && <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />}

        {status === 'generating' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-900/80 backdrop-blur-sm">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-primary-500/10 border border-primary-500/20 animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />
              </div>
            </div>
            <p className="text-[10px] text-surface-400">Generating asset…</p>
          </div>
        )}

        {!hasImage && status !== 'generating' && (
          <div className="absolute inset-0 flex items-center justify-center">
            {hasFailed
              ? <AlertCircle className="w-7 h-7 text-danger-500/40" />
              : <Shirt className="w-7 h-7 text-white/10" />
            }
          </div>
        )}

        {/* Version badge */}
        {hasImage && creatorEntry && creatorEntry.version > 1 && (
          <div className="absolute top-2 left-2 text-[10px] font-mono text-white/70 bg-black/50 px-1.5 py-0.5 rounded">
            v{creatorEntry.version}
          </div>
        )}

        {/* Capability badges */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {dress.animation_ready && (
            <span className="text-[9px] text-accent-400 bg-black/60 border border-accent-500/30 px-1 py-0.5 rounded flex items-center gap-0.5">
              <Zap className="w-2 h-2" />Anim
            </span>
          )}
          {dress.gpu_ready && (
            <span className="text-[9px] text-primary-400 bg-black/60 border border-primary-500/30 px-1 py-0.5 rounded flex items-center gap-0.5">
              <Cpu className="w-2 h-2" />GPU
            </span>
          )}
        </div>

        {/* Open/delete when image present */}
        {hasImage && (
          <div className="absolute bottom-8 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <a
              href={imageUrl!}
              target="_blank"
              rel="noreferrer"
              className="w-6 h-6 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center hover:bg-black/80 transition-colors"
              title="Open full size"
            >
              <ExternalLink className="w-3 h-3 text-white/70" />
            </a>
            <button
              onClick={onDelete}
              className="w-6 h-6 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center hover:bg-danger-500/40 transition-colors"
              title="Delete record"
            >
              <Trash2 className="w-3 h-3 text-white/70" />
            </button>
          </div>
        )}

        {/* Category + status chips */}
        <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-1">
          <div>
            {dress.category && (
              <span className="text-[9px] font-medium text-white/60 bg-black/50 px-1.5 py-0.5 rounded">
                {dress.category}
              </span>
            )}
          </div>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* ── Card footer ─────────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 space-y-2 flex-1 flex flex-col">

        <div>
          <span className="text-[10px] font-mono text-surface-600">{dress.dress_code}</span>
          {dress.garment_type && (
            <span className="ml-2 text-[9px] text-surface-700">· {dress.garment_type}</span>
          )}
          <p className="text-[12px] font-semibold text-surface-200 leading-tight mt-0.5">{dress.dress_name}</p>
          {dress.description && (
            <p className="text-[10px] text-surface-600 leading-relaxed mt-0.5 line-clamp-2">{dress.description}</p>
          )}
        </div>

        <DressMetaChips dress={dress} />

        {hasFailed && creatorEntry?.error_message && (
          <p className="text-[10px] text-danger-400 leading-relaxed line-clamp-2">
            {creatorEntry.error_message}
          </p>
        )}

        {/* Creator notes */}
        <div className="mt-auto pt-1">
          {editingNotes ? (
            <div className="space-y-1.5">
              <textarea
                ref={notesRef}
                value={notesValue}
                onChange={e => setNotesValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commitNotes();
                  if (e.key === 'Escape') cancelNotes();
                }}
                placeholder="Add creator notes…"
                rows={2}
                className="w-full bg-surface-800 border border-surface-600 rounded-lg px-2 py-1.5 text-[11px] text-surface-200 placeholder-surface-600 resize-none focus:outline-none focus:border-primary-500/50 transition-colors"
              />
              <div className="flex gap-1.5">
                <button onClick={commitNotes} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-primary-500/15 border border-primary-500/25 text-primary-400 hover:bg-primary-500/20 transition-colors">
                  <Check className="w-2.5 h-2.5" />Save
                </button>
                <button onClick={cancelNotes} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-surface-800 border border-surface-700 text-surface-500 hover:text-surface-300 transition-colors">
                  <X className="w-2.5 h-2.5" />Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingNotes(true)}
              className="w-full flex items-start gap-1.5 text-left group/notes"
            >
              <StickyNote className="w-3 h-3 text-surface-700 flex-shrink-0 mt-px group-hover/notes:text-surface-500 transition-colors" />
              <span className={[
                'text-[10px] leading-relaxed line-clamp-2 transition-colors',
                creatorEntry?.creator_notes
                  ? 'text-surface-500 group-hover/notes:text-surface-300'
                  : 'text-surface-700 group-hover/notes:text-surface-500',
              ].join(' ')}>
                {creatorEntry?.creator_notes ?? 'Add notes…'}
              </span>
            </button>
          )}
        </div>

        {/* Generate button */}
        <button
          onClick={onGenerate}
          disabled={status === 'generating'}
          className={[
            'w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all border mt-1',
            status === 'generating'
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
            <><RefreshCw className="w-3 h-3" />Regenerate Asset</>
          ) : hasFailed ? (
            <><RefreshCw className="w-3 h-3" />Retry</>
          ) : (
            <><Sparkles className="w-3 h-3" />Generate Asset</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Dress Metadata Chips ───────────────────────────────────────────────────────

function DressMetaChips({ dress }: { dress: Dress }) {
  const { metadata, compatible_accessories } = dress;
  const chips: string[] = [];

  if (metadata.primary_color) chips.push(String(metadata.primary_color).replace(/-/g, ' '));
  if (metadata.length)        chips.push(String(metadata.length).replace(/-/g, ' '));
  if (metadata.fit)           chips.push(String(metadata.fit).replace(/-/g, ' '));
  if (metadata.neckline)      chips.push(String(metadata.neckline).replace(/-/g, ' '));

  const accChips = (compatible_accessories ?? []).slice(0, 2);
  const hasChips = chips.length > 0 || accChips.length > 0;
  if (!hasChips) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {chips.slice(0, 3).map(chip => (
        <span key={chip} className="text-[9px] text-surface-600 bg-surface-800 border border-surface-700/60 px-1.5 py-0.5 rounded capitalize">
          {chip}
        </span>
      ))}
      {accChips.map(acc => (
        <span key={acc} className="text-[9px] text-surface-700 bg-surface-800 border border-surface-700/40 px-1.5 py-0.5 rounded font-mono">
          {acc}
        </span>
      ))}
    </div>
  );
}

// ── Status Badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'generated') return (
    <span className="flex items-center gap-0.5 text-[9px] text-accent-400 bg-black/50 px-1.5 py-0.5 rounded border border-accent-500/30">
      <CheckCircle2 className="w-2 h-2" />Done
    </span>
  );
  if (status === 'generating') return (
    <span className="flex items-center gap-0.5 text-[9px] text-primary-400 bg-black/50 px-1.5 py-0.5 rounded border border-primary-500/30">
      <Loader2 className="w-2 h-2 animate-spin" />Generating
    </span>
  );
  if (status === 'failed') return (
    <span className="flex items-center gap-0.5 text-[9px] text-danger-400 bg-black/50 px-1.5 py-0.5 rounded border border-danger-500/30">
      <AlertCircle className="w-2 h-2" />Failed
    </span>
  );
  return null;
}
