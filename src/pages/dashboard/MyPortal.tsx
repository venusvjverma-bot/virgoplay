import { useState, useEffect } from 'react';
import {
  Link2, Video, MessageSquare, Users, Package, Sparkles,
  Palette, ChevronDown, ChevronRight, ImageIcon, CheckCircle2,
  Clock, AlertCircle, Loader2, BoxSelect, Shirt, Pencil,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { RELATIONSHIP_DYNAMIC_TO_ROLE_CODE } from '../../lib/engineCodes';
import type { CreatorProfile } from '../../types';
import AppearanceLibrary from './AppearanceLibrary';
import ImageLibraryPage from './ImageLibraryPage';
import UniformLibraryPage from './UniformLibraryPage';
import ScenarioLibrary from './ScenarioLibrary';

// ── Types ─────────────────────────────────────────────────────────────────────

type LibrarySection = 'appearance' | 'uniforms' | 'image' | 'video' | 'message' | 'scenario' | 'role' | 'package' | 'companion';

interface PackageRow {
  code: string;
  label: string;
  description: string | null;
  package_type: string;
  parent_code: string | null;
  package_group: string;
  sort_order: number;
  trigger_seq: number | null;
  is_active: boolean;
}

interface DialogueRecord {
  id: string;
  package_code: string;
  seq: number;
  path: string;
  message: string;
  created_at: string;
}

interface DlgAsset {
  id: string;
  asset_type: string;
  asset_code: string;
  is_primary: boolean;
  sort_order: number;
}

interface DlgResponse {
  id: string;
  sort_order: number;
  display_text: string;
  internal_intent: string;
  next_package_code: string | null;
  next_dialogue_code: string | null;
  conditions: Record<string, unknown>;
}

interface DlgPackage {
  id: string;
  package_code: string;
  role_code: string;
  stage: 'beginning' | 'middle' | 'ending';
  sequence: number;
  version: number;
  status: 'draft' | 'active' | 'archived';
  dialogue_text: string;
  dialogue_text_a: string;
  dialogue_text_b: string;
  dialogue_text_c: string;
  emotion: string;
  camera_angle: string;
  scene_context: string;
  generation_status: 'pending' | 'generating' | 'generated' | 'failed';
  generation_error: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  dialogue_package_assets: DlgAsset[];
  dialogue_package_responses: DlgResponse[];
}

interface DlgEditState {
  dialogue_text:   string;
  dialogue_text_a: string;
  dialogue_text_b: string;
  dialogue_text_c: string;
  emotion:         string;
  camera_angle:    string;
  scene_context:   string;
  assets: {
    id:         string;
    asset_type: string;
    asset_code: string;
    is_primary: boolean;
    sort_order: number;
  }[];
  responses: {
    id:                  string;
    sort_order:          number;
    display_text:        string;
    internal_intent:     string;
    next_dialogue_code:  string | null;
    conditions_json:     string;
  }[];
}

interface RoleDefRow {
  package_code: string;
  description: string;
  core_characteristics: string[];
  stage_objectives: Record<string, string[]>;
}

// ── Section navigation config ─────────────────────────────────────────────────

const SECTIONS: { id: LibrarySection; label: string; icon: React.ElementType }[] = [
  { id: 'appearance', label: 'Appearance',     icon: Palette      },
  { id: 'uniforms',   label: 'Uniform Library', icon: Shirt        },
  { id: 'image',      label: 'Image',           icon: ImageIcon    },
  { id: 'video',      label: 'Video',           icon: Video        },
  { id: 'message',    label: 'Message',         icon: MessageSquare},
  { id: 'scenario',   label: 'Scenario',        icon: BoxSelect    },
  { id: 'role',       label: 'Role',            icon: Users        },
  { id: 'package',    label: 'Package',         icon: Package      },
  { id: 'companion',  label: 'Companion',       icon: Sparkles     },
];

// ── Main component ────────────────────────────────────────────────────────────

interface MyPortalProps {
  creatorId: string;
  username: string;
  profile: CreatorProfile | null;
}

export default function MyPortal({ creatorId, username, profile }: MyPortalProps) {
  const [section, setSection] = useState<LibrarySection>('appearance');
  const portalUrl = `${window.location.origin}/creator/${username}`;

  const preferredRoleCode = profile?.ai_rel_dynamic
    ? RELATIONSHIP_DYNAMIC_TO_ROLE_CODE[profile.ai_rel_dynamic]
    : undefined;

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h2 className="page-header">My Portal</h2>
        <p className="text-sm text-surface-400 mt-1">
          Canonical content (Message, Scenario, Role, Video, Package) is managed by the Master Content Account and shared platform-wide.
          Creator-specific sections (Appearance, Uniforms, Images, Companion) belong to your account.
</p>
      </div>

      {/* Portal URL */}
      <div className="card border-primary-500/20 bg-primary-500/5">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="w-4 h-4 text-primary-400" />
          <span className="text-sm font-medium text-primary-400">Portal URL</span>
        </div>
        <div className="flex items-center gap-3 bg-surface-900 border border-surface-700 rounded-lg px-4 py-2.5">
          <code className="text-sm text-surface-200 flex-1 font-mono break-all">{portalUrl}</code>
          <button
            onClick={() => navigator.clipboard.writeText(portalUrl)}
            className="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Library sub-nav */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 border',
              section === id
                ? 'bg-primary-600/15 text-primary-400 border-primary-600/20'
                : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800 border-transparent',
            ].join(' ')}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div>
        {section === 'appearance' && <AppearanceLibrary creatorId={creatorId} />}
        {section === 'uniforms'   && <UniformLibraryPage creatorId={creatorId} defaultRoleCode={preferredRoleCode} />}
        {section === 'image'      && <ImageLibraryPage creatorId={creatorId} defaultRoleCode={preferredRoleCode} />}
        {section === 'video'      && <VideoLibrary />}
        {section === 'message'    && <MessageLibrary defaultRoleCode={preferredRoleCode} />}
        {section === 'scenario'   && <ScenarioLibrary onViewPackage={() => setSection('message')} />}
        {section === 'role'       && <RoleLibrary />}
        {section === 'package'    && <PackageLibrary />}
        {section === 'companion'  && <CompanionSettings profile={profile} />}
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionShell({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
        <Icon className="w-4 h-4 text-surface-400" />
        <h3 className="text-sm font-semibold text-surface-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Placeholder({ description }: { description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-10 h-10 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center mb-3">
        <Clock className="w-5 h-5 text-surface-500" />
      </div>
      <p className="text-sm text-surface-500 max-w-xs leading-relaxed">{description}</p>
    </div>
  );
}

function SpinnerRow() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-danger-400 py-4">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      {message}
    </div>
  );
}

function Badge({ label, variant }: { label: string; variant: 'ready' | 'pending' | 'neutral' | 'error' }) {
  const cls = {
    ready:   'bg-success-500/10 text-success-400 border-success-500/20',
    pending: 'bg-warning-500/10 text-warning-400 border-warning-500/20',
    neutral: 'bg-surface-700/50 text-surface-400 border-surface-700',
    error:   'bg-danger-500/10 text-danger-400 border-danger-500/20',
  }[variant];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ── Video Library ─────────────────────────────────────────────────────────────

function VideoLibrary() {
  return (
    <SectionShell title="Video Library" icon={Video}>
      <Placeholder description="Video packages are reserved for a future release. No video content has been configured yet." />
    </SectionShell>
  );
}

// ── Dialogue Package Editor ───────────────────────────────────────────────────

function DlgPackageEditor({
  editState,
  onChange,
  variantOptions,
  imagePkgOptions,
  saving,
  saveError,
  onSave,
  onCancel,
  sequence,
  packageCode,
}: {
  editState:       DlgEditState;
  onChange:        (next: DlgEditState) => void;
  variantOptions:  { code: string; label: string }[];
  imagePkgOptions: { code: string; label: string }[];
  saving:          boolean;
  saveError:       string | null;
  onSave:          () => void;
  onCancel:        () => void;
  sequence:        number;
  packageCode:     string;
}) {
  const F = 'input-field text-xs py-2';
  const L = 'block text-[11px] font-medium text-surface-500 mb-1';
  const SEL = 'w-full bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-[7px] text-xs text-surface-200 focus:outline-none focus:border-primary-500 transition-colors';

  function updateAsset(idx: number, patch: Partial<DlgEditState['assets'][number]>) {
    const next = editState.assets.map((a, i) => i === idx ? { ...a, ...patch } : a);
    onChange({ ...editState, assets: next });
  }

  function updateResponse(idx: number, patch: Partial<DlgEditState['responses'][number]>) {
    const next = editState.responses.map((r, i) => i === idx ? { ...r, ...patch } : r);
    onChange({ ...editState, responses: next });
  }

  return (
    <div className="px-5 pb-5 pt-4 space-y-5">

      {saveError && <ErrorRow message={saveError} />}

      {/* ── Dialogue Package Fields ─────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider pb-2 border-b border-surface-800">
          Dialogue Package Fields
        </p>

        {sequence >= 2 ? (
          <div className="space-y-3">
            <p className="text-[11px] text-surface-500">
              3 branching dialogue variants — each maps to one client response choice.
            </p>
            {(['a', 'b', 'c'] as const).map((variant) => {
              const key = `dialogue_text_${variant}` as `dialogue_text_a` | `dialogue_text_b` | `dialogue_text_c`;
              const code = `${packageCode}${variant.toUpperCase()}`;
              return (
                <div key={variant}>
                  <label className={L}>
                    Dialogue {variant.toUpperCase()}
                    <span className="ml-2 font-mono text-surface-600">{code}</span>
                  </label>
                  <textarea
                    className={`${F} resize-y w-full`}
                    rows={4}
                    value={editState[key]}
                    onChange={e => onChange({ ...editState, [key]: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <label className={L}>Dialogue Text</label>
            <textarea
              className={`${F} resize-y w-full`}
              rows={4}
              value={editState.dialogue_text}
              onChange={e => onChange({ ...editState, dialogue_text: e.target.value })}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={L}>Emotion</label>
            <input
              type="text"
              className={`${F} w-full`}
              value={editState.emotion}
              placeholder="warm_welcoming"
              onChange={e => onChange({ ...editState, emotion: e.target.value })}
            />
          </div>
          <div>
            <label className={L}>Camera Angle</label>
            <input
              type="text"
              className={`${F} w-full`}
              value={editState.camera_angle}
              placeholder="medium_shot_level"
              onChange={e => onChange({ ...editState, camera_angle: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className={L}>Scene Context</label>
          <textarea
            className={`${F} resize-y w-full`}
            rows={2}
            value={editState.scene_context}
            placeholder="Brief description of the visual scene..."
            onChange={e => onChange({ ...editState, scene_context: e.target.value })}
          />
        </div>
      </div>

      {/* ── Linked Assets ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider pb-2 border-b border-surface-800">
          Linked Assets
        </p>

        {editState.assets.length === 0 && (
          <p className="text-[11px] text-surface-600 italic">No assets linked.</p>
        )}

        {editState.assets.map((asset, idx) => (
          <div
            key={asset.id}
            className="flex items-center gap-3 bg-surface-800/40 border border-surface-700 rounded-lg px-3 py-2.5"
          >
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-success-500/10 text-success-400 border border-success-500/20 uppercase flex-shrink-0">
              {asset.asset_type}
            </span>
            <select
              className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-surface-200 focus:outline-none focus:border-primary-500 transition-colors"
              value={asset.asset_code}
              onChange={e => updateAsset(idx, { asset_code: e.target.value })}
            >
              {!imagePkgOptions.some(o => o.code === asset.asset_code) && (
                <option value={asset.asset_code}>{asset.asset_code}</option>
              )}
              {imagePkgOptions.map(opt => (
                <option key={opt.code} value={opt.code}>{opt.code} — {opt.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[11px] text-surface-400 cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={asset.is_primary}
                onChange={e => updateAsset(idx, { is_primary: e.target.checked })}
                className="rounded border-surface-600 bg-surface-700 text-primary-500 focus:ring-primary-500"
              />
              Primary
            </label>
          </div>
        ))}
      </div>

      {/* ── Client Responses ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider pb-2 border-b border-surface-800">
          Client Responses ({editState.responses.length} / 3)
        </p>

        {editState.responses.map((resp, idx) => (
          <div
            key={resp.id}
            className="border border-surface-700 rounded-xl bg-surface-800/30 overflow-hidden"
          >
            <div className="flex items-center px-3 py-2 bg-surface-800/50 border-b border-surface-700">
              <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">
                Response {resp.sort_order}
              </span>
            </div>

            <div className="p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={L}>Display Text</label>
                  <input
                    type="text"
                    className={`${F} w-full`}
                    value={resp.display_text}
                    placeholder="What the client says..."
                    onChange={e => updateResponse(idx, { display_text: e.target.value })}
                  />
                </div>
                <div>
                  <label className={L}>Internal Intent</label>
                  <input
                    type="text"
                    className={`${F} w-full`}
                    value={resp.internal_intent}
                    placeholder="client_ready_to_start"
                    onChange={e => updateResponse(idx, { internal_intent: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className={L}>Next Dialogue Variant</label>
                <select
                  className={SEL}
                  value={resp.next_dialogue_code ?? ''}
                  onChange={e => updateResponse(idx, { next_dialogue_code: e.target.value || null })}
                >
                  <option value="">— Terminal (session ends) —</option>
                  {variantOptions.map(opt => (
                    <option key={opt.code} value={opt.code}>{opt.code}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={L}>Conditions (JSON)</label>
                <textarea
                  className={`${F} resize-y w-full font-mono`}
                  rows={2}
                  value={resp.conditions_json}
                  placeholder="{}"
                  onChange={e => updateResponse(idx, { conditions_json: e.target.value })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-2 border-t border-surface-800">
        <button
          onClick={onSave}
          disabled={saving}
          className="btn-primary text-xs px-4 py-2"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="btn-secondary text-xs px-3 py-2"
        >
          Cancel
        </button>
      </div>

    </div>
  );
}

// ── Message Library ───────────────────────────────────────────────────────────

function MessageLibrary({ defaultRoleCode }: { defaultRoleCode?: string } = {}) {
  const { creator } = useAuth();

  function canEditPkg(pkg: DlgPackage): boolean {
    if (!creator) return false;
    if (creator.is_super_admin) return true;
    if (creator.is_content_master && pkg.is_system) return true;
    return false;
  }

  const [packages, setPackages]               = useState<DlgPackage[]>([]);
  const [roleLabels, setRoleLabels]           = useState<Record<string, string>>({});
  const [activeRoleCode, setActiveRoleCode]   = useState<string>(defaultRoleCode ?? 'all');
  const [expanded, setExpanded]               = useState<string | null>('MT-BEG-001');
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<string | null>(null);
  const [editingPkg, setEditingPkg]           = useState<string | null>(null);
  const [editState, setEditState]             = useState<DlgEditState | null>(null);
  const [imagePkgOptions, setImagePkgOptions] = useState<{ code: string; label: string }[]>([]);
  const [saving, setSaving]                   = useState(false);
  const [saveError, setSaveError]             = useState<string | null>(null);

  async function loadData() {
    const [pkgRes, roleRes, imgRes] = await Promise.all([
      supabase
        .from('dialogue_packages')
        .select('*, dialogue_package_assets(*), dialogue_package_responses(*)')
        .eq('is_system', true)
        .order('role_code')
        .order('sequence'),
      supabase.from('engine_package_registry').select('code, label').eq('package_type', 'role'),
      supabase.from('engine_package_registry').select('code, label').eq('package_type', 'image').order('sort_order'),
    ]);

    if (pkgRes.error) { setError(pkgRes.error.message); setLoading(false); return; }

    const sorted = ((pkgRes.data ?? []) as DlgPackage[]).map(pkg => ({
      ...pkg,
      dialogue_package_assets:    [...pkg.dialogue_package_assets].sort((a, b) => a.sort_order - b.sort_order),
      dialogue_package_responses: [...pkg.dialogue_package_responses].sort((a, b) => a.sort_order - b.sort_order),
    }));

    setPackages(sorted);
    const labels: Record<string, string> = {};
    for (const r of (roleRes.data ?? [])) labels[r.code] = r.label;
    setRoleLabels(labels);
    setImagePkgOptions((imgRes.data ?? []) as { code: string; label: string }[]);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [creator?.id]);

  function startEdit(pkg: DlgPackage) {
    setExpanded(pkg.package_code);
    setEditingPkg(pkg.package_code);
    setSaveError(null);
    setEditState({
      dialogue_text:   pkg.dialogue_text,
      dialogue_text_a: pkg.dialogue_text_a,
      dialogue_text_b: pkg.dialogue_text_b,
      dialogue_text_c: pkg.dialogue_text_c,
      emotion:         pkg.emotion,
      camera_angle:    pkg.camera_angle,
      scene_context:   pkg.scene_context,
      assets: pkg.dialogue_package_assets.map(a => ({
        id: a.id, asset_type: a.asset_type, asset_code: a.asset_code,
        is_primary: a.is_primary, sort_order: a.sort_order,
      })),
      responses: pkg.dialogue_package_responses.map(r => ({
        id: r.id, sort_order: r.sort_order, display_text: r.display_text,
        internal_intent: r.internal_intent, next_dialogue_code: r.next_dialogue_code,
        conditions_json: JSON.stringify(r.conditions ?? {}, null, 2),
      })),
    });
  }

  function cancelEdit() {
    setEditingPkg(null);
    setEditState(null);
    setSaveError(null);
  }

  async function saveDraft(pkg: DlgPackage) {
    if (!editState) return;
    setSaving(true);
    setSaveError(null);
    try {
      const isBranching = pkg.sequence >= 2;
      const pkgUpdate: Record<string, unknown> = {
        emotion:       editState.emotion,
        camera_angle:  editState.camera_angle,
        scene_context: editState.scene_context,
        updated_at:    new Date().toISOString(),
      };
      if (isBranching) {
        pkgUpdate.dialogue_text_a = editState.dialogue_text_a;
        pkgUpdate.dialogue_text_b = editState.dialogue_text_b;
        pkgUpdate.dialogue_text_c = editState.dialogue_text_c;
      } else {
        pkgUpdate.dialogue_text = editState.dialogue_text;
      }
      const { error: pkgErr } = await supabase
        .from('dialogue_packages')
        .update(pkgUpdate)
        .eq('id', pkg.id);
      if (pkgErr) throw pkgErr;

      for (const a of editState.assets) {
        const { error: aErr } = await supabase
          .from('dialogue_package_assets')
          .update({ asset_code: a.asset_code, is_primary: a.is_primary })
          .eq('id', a.id);
        if (aErr) throw aErr;
      }

      for (const r of editState.responses) {
        let conditions: Record<string, unknown> = {};
        try { conditions = JSON.parse(r.conditions_json); } catch { /* invalid JSON — fallback to {} */ }
        const { error: rErr } = await supabase
          .from('dialogue_package_responses')
          .update({
            display_text:       r.display_text,
            internal_intent:    r.internal_intent,
            next_dialogue_code: r.next_dialogue_code ?? null,
            conditions,
          })
          .eq('id', r.id);
        if (rErr) throw rErr;
      }

      setEditingPkg(null);
      setEditState(null);
      setLoading(true);
      await loadData();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Check permissions.');
    } finally {
      setSaving(false);
    }
  }

  const STAGE_ORDER: Record<string, number> = { beginning: 1, middle: 2, ending: 3 };

  const STAGE_STYLE: Record<string, { abbr: string; color: string }> = {
    beginning: { abbr: 'BEG', color: 'text-accent-400 border-accent-400/20 bg-accent-400/5'   },
    middle:    { abbr: 'MID', color: 'text-primary-400 border-primary-400/20 bg-primary-400/5' },
    ending:    { abbr: 'END', color: 'text-warning-400 border-warning-400/20 bg-warning-400/5' },
  };

  const GEN_VARIANT: Record<string, 'ready' | 'pending' | 'neutral' | 'error'> = {
    generated: 'ready', pending: 'pending', generating: 'pending', failed: 'error',
  };

  const STATUS_VARIANT: Record<string, 'ready' | 'pending' | 'neutral' | 'error'> = {
    active: 'ready', draft: 'neutral', archived: 'neutral',
  };

  const roleGroups = packages.reduce<Record<string, DlgPackage[]>>((acc, pkg) => {
    if (pkg.is_system) (acc[pkg.role_code] ??= []).push(pkg);
    return acc;
  }, {});

  const visibleGroups = activeRoleCode === 'all'
    ? Object.entries(roleGroups)
    : Object.entries(roleGroups).filter(([code]) => code === activeRoleCode);

  return (
    <SectionShell title="Message Library" icon={MessageSquare}>
      <div className="bg-surface-900 border border-surface-800 rounded-lg px-3 py-2.5 text-[11px] text-surface-500 leading-relaxed">
        <span className="text-surface-400 font-medium">Architecture: </span>
        Canonical dialogue packages managed by the Master Content Account.
        All creators automatically receive the latest published version.
        Content is defined once and inherited by the entire platform without duplication.
        {(creator?.is_content_master || creator?.is_super_admin) && (
          <span className="text-warning-400/80 ml-1">
            • Content master: direct editing enabled.
          </span>
        )}
      </div>

      {loading && <SpinnerRow />}
      {error   && <ErrorRow message={error} />}
      {!loading && !error && packages.filter(p => p.is_system).length === 0 && (
        <Placeholder description="No dialogue packages have been configured yet." />
      )}

      {/* Role filter tabs — only shown once packages are loaded and multiple roles exist */}
      {!loading && !error && Object.keys(roleGroups).length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {[{ code: 'all', label: 'All Roles' }, ...Object.entries(roleGroups).map(([code]) => ({ code, label: roleLabels[code] ?? code }))].map(tab => (
            <button
              key={tab.code}
              onClick={() => setActiveRoleCode(tab.code)}
              className={[
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap',
                activeRoleCode === tab.code
                  ? 'bg-primary-600/15 text-primary-400 border-primary-600/20'
                  : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800 border-transparent',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {!loading && !error && visibleGroups.map(([roleCode, rolePkgs]) => {
        const sortedPkgs = [...rolePkgs].sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]);
        return (
          <div key={roleCode} className="border border-surface-800 rounded-xl overflow-hidden">

            {/* Role header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-900/60">
              <Users className="w-4 h-4 text-primary-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-surface-200 flex-1">
                {roleLabels[roleCode] ?? roleCode}
              </span>
              <span className="text-[10px] font-mono text-surface-600">{roleCode}</span>
              <span className="text-[10px] text-surface-600">{sortedPkgs.length} packages</span>
            </div>

            {/* Packages */}
            <div className="divide-y divide-surface-800/50">
              {sortedPkgs.map(pkg => {
                const isOpen    = expanded === pkg.package_code;
                const isEditing = editingPkg === pkg.package_code;
                const st        = STAGE_STYLE[pkg.stage] ?? STAGE_STYLE.beginning;

                return (
                  <div key={pkg.package_code}>

                    {/* Package row — div not button to allow nested interactive elements */}
                    <div
                      className="flex items-center gap-2 px-3 sm:px-5 py-3 hover:bg-surface-800/40 transition-colors cursor-pointer select-none"
                      onClick={() => {
                        if (isEditing) return;
                        setExpanded(prev => prev === pkg.package_code ? null : pkg.package_code);
                      }}
                    >
                      {isOpen
                        ? <ChevronDown  className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
                      }
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${st.color} w-10 text-center flex-shrink-0`}>
                        {st.abbr}
                      </span>
                      <span className="hidden sm:block text-[11px] font-mono text-surface-400 w-24 flex-shrink-0">
                        {pkg.package_code}
                      </span>
                      <span className="text-xs text-surface-300 flex-1 truncate min-w-0">
                        {pkg.sequence >= 2
                          ? `[A] ${pkg.dialogue_text_a.slice(0, 65)}…`
                          : `${pkg.dialogue_text.slice(0, 72)}…`
                        }
                      </span>

                      {/* Action area — stopPropagation prevents toggle when clicking buttons */}
                      <div
                        className="flex items-center gap-1.5 flex-shrink-0"
                        onClick={e => e.stopPropagation()}
                      >
                        {isEditing ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border border-warning-500/30 bg-warning-500/10 text-warning-400">
                            <Pencil className="w-2.5 h-2.5" />
                            Editing
                          </span>
                        ) : (
                          <>
                            <span className="hidden sm:inline-flex">
                              <Badge label={pkg.status} variant={STATUS_VARIANT[pkg.status] ?? 'neutral'} />
                            </span>
                            <span className="hidden sm:inline-flex">
                              <Badge label={pkg.generation_status} variant={GEN_VARIANT[pkg.generation_status] ?? 'neutral'} />
                            </span>
                            {canEditPkg(pkg) && (
                              <button
                                onClick={() => startEdit(pkg)}
                                className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1"
                              >
                                <Pencil className="w-3 h-3" />
                                Edit
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Detail panel — read-only or edit form */}
                    {isOpen && (
                      <div className="bg-surface-950/30 border-t border-surface-800/50">
                        {isEditing && editState ? (
                          <DlgPackageEditor
                            editState={editState}
                            onChange={next => setEditState(next)}
                            variantOptions={packages
                              .filter(p => p.sequence >= 2)
                              .flatMap(p => [
                                { code: `${p.package_code}A`, label: `${p.package_code}A` },
                                { code: `${p.package_code}B`, label: `${p.package_code}B` },
                                { code: `${p.package_code}C`, label: `${p.package_code}C` },
                              ])
                            }
                            imagePkgOptions={imagePkgOptions}
                            saving={saving}
                            saveError={saveError}
                            onSave={() => saveDraft(pkg)}
                            onCancel={cancelEdit}
                            sequence={pkg.sequence}
                            packageCode={pkg.package_code}
                          />
                        ) : (
                          <div className="px-5 pb-5 space-y-4 pt-4">

                            {/* Metadata grid */}
                            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                              {([
                                ['Package Code',      pkg.package_code],
                                ['Stage',             pkg.stage],
                                ['Sequence',          String(pkg.sequence)],
                                ['Version',           `v${pkg.version}`],
                                ['Emotion',           pkg.emotion || '—'],
                                ['Camera Angle',      pkg.camera_angle || '—'],
                                ['Status',            pkg.status],
                                ['Generation Status', pkg.generation_status],
                              ] as [string, string][]).map(([label, value]) => (
                                <div key={label}>
                                  <dt className="text-[10px] text-surface-600 mb-0.5">{label}</dt>
                                  <dd className="text-[11px] font-mono text-surface-300 break-all">{value}</dd>
                                </div>
                              ))}
                            </dl>

                            {/* Dialogue text */}
                            {pkg.sequence >= 2 ? (
                              <div className="space-y-3">
                                <p className="text-[11px] font-medium text-surface-500">Dialogue Variants</p>
                                {(['a', 'b', 'c'] as const).map((variant) => {
                                  const key = `dialogue_text_${variant}` as `dialogue_text_a` | `dialogue_text_b` | `dialogue_text_c`;
                                  const code = `${pkg.package_code}${variant.toUpperCase()}`;
                                  return (
                                    <div key={variant}>
                                      <p className="text-[10px] font-mono text-accent-400 mb-1">
                                        Dialogue {variant.toUpperCase()} · {code}
                                      </p>
                                      <p className="text-xs text-surface-300 leading-relaxed bg-surface-900 border border-surface-800 rounded-lg px-3 py-3">
                                        {pkg[key] || <span className="text-surface-600 italic">No content yet.</span>}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div>
                                <p className="text-[11px] font-medium text-surface-500 mb-1.5">Dialogue Text</p>
                                <p className="text-xs text-surface-300 leading-relaxed bg-surface-900 border border-surface-800 rounded-lg px-3 py-3">
                                  {pkg.dialogue_text}
                                </p>
                              </div>
                            )}

                            {/* Scene context */}
                            {pkg.scene_context && (
                              <div>
                                <p className="text-[11px] font-medium text-surface-500 mb-1.5">Scene Context</p>
                                <p className="text-xs text-surface-400 leading-relaxed italic">
                                  {pkg.scene_context}
                                </p>
                              </div>
                            )}

                            {/* Assets */}
                            <div>
                              <p className="text-[11px] font-medium text-surface-500 mb-1.5">
                                Linked Assets ({pkg.dialogue_package_assets.length})
                              </p>
                              {pkg.dialogue_package_assets.length === 0
                                ? <p className="text-[11px] text-surface-600 italic">No assets linked.</p>
                                : (
                                  <div className="space-y-1.5">
                                    {pkg.dialogue_package_assets.map(a => (
                                      <div key={a.id} className="flex items-center gap-2.5 py-2 px-2.5 bg-surface-900 border border-surface-800 rounded-lg">
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-success-500/10 text-success-400 border border-success-500/20 uppercase flex-shrink-0">
                                          {a.asset_type}
                                        </span>
                                        <span className="text-[11px] font-mono text-surface-300 flex-1">
                                          {a.asset_code}
                                        </span>
                                        {a.is_primary && (
                                          <span className="text-[10px] font-medium text-primary-400">Primary</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )
                              }
                            </div>

                            {/* Client responses */}
                            <div>
                              <p className="text-[11px] font-medium text-surface-500 mb-1.5">
                                Client Responses ({pkg.dialogue_package_responses.length})
                              </p>
                              {pkg.dialogue_package_responses.length === 0
                                ? <p className="text-[11px] text-surface-600 italic">No responses defined.</p>
                                : (
                                  <div className="space-y-1.5">
                                    {pkg.dialogue_package_responses.map(r => (
                                      <div key={r.id} className="flex items-start gap-2.5 py-2 px-2.5 bg-surface-900 border border-surface-800 rounded-lg">
                                        <span className="text-[10px] font-mono text-surface-600 w-4 flex-shrink-0 mt-0.5">{r.sort_order}.</span>
                                        <span className="text-[11px] text-surface-300 flex-1 leading-relaxed">"{r.display_text}"</span>
                                        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                                          <ChevronRight className="w-3 h-3 text-surface-600" />
                                          <span className={`text-[10px] font-mono ${r.next_dialogue_code ? 'text-accent-400' : 'text-surface-600 italic'}`}>
                                            {r.next_dialogue_code ?? 'terminal'}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )
                              }
                            </div>

                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </SectionShell>
  );
}

// ── Role Library ──────────────────────────────────────────────────────────────

const KNOWN_ROLES: { code: string; label: string; note?: string }[] = [
  { code: 'MT-001', label: 'Massage Therapist' },
  { code: 'CP-001', label: 'Romantic Partner',  note: 'Coming soon' },
  { code: 'DF-001', label: 'Date Friend',        note: 'Coming soon' },
  { code: 'PE-001', label: 'Personal Escort',    note: 'Coming soon' },
  { code: 'RP-001', label: 'Role Player',        note: 'Coming soon' },
];

function RoleLibrary() {
  const [defs, setDefs]           = useState<RoleDefRow[]>([]);
  const [pkgs, setPkgs]           = useState<PackageRow[]>([]);
  const [expanded, setExpanded]   = useState<string | null>('MT-001');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [defsRes, pkgsRes] = await Promise.all([
        supabase.from('engine_role_definitions').select('package_code, description, core_characteristics, stage_objectives'),
        supabase.from('engine_package_registry').select('code, label, description, package_type, parent_code, package_group, sort_order, trigger_seq, is_active').eq('package_type', 'role'),
      ]);
      if (defsRes.error) { setError(defsRes.error.message); setLoading(false); return; }
      setDefs((defsRes.data ?? []) as RoleDefRow[]);
      setPkgs((pkgsRes.data ?? []) as PackageRow[]);
      setLoading(false);
    })();
  }, []);

  return (
    <SectionShell title="Role Library" icon={Users}>
      {loading && <SpinnerRow />}
      {error   && <ErrorRow message={error} />}
      {!loading && !error && (
        <div className="space-y-2">
          {KNOWN_ROLES.map(({ code, label, note }) => {
            const def     = defs.find(d => d.package_code === code);
            const pkg     = pkgs.find(p => p.code === code);
            const installed = !!def;
            const isOpen  = expanded === code && installed;

            return (
              <div key={code} className="border border-surface-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => installed ? setExpanded(prev => prev === code ? null : code) : undefined}
                  disabled={!installed}
                  className={[
                    'w-full flex items-center gap-3 px-4 py-3 transition-colors text-left',
                    installed ? 'hover:bg-surface-800/40 cursor-pointer' : 'cursor-default',
                  ].join(' ')}
                >
                  {installed
                    ? isOpen
                      ? <ChevronDown className="w-4 h-4 text-surface-500 flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-surface-500 flex-shrink-0" />
                    : <span className="w-4 h-4 flex-shrink-0" />
                  }
                  <span className="text-xs font-mono text-surface-500 w-16 flex-shrink-0">{code}</span>
                  <span className="text-sm text-surface-200 flex-1">{label}</span>
                  {note
                    ? <Badge label={note} variant="neutral" />
                    : pkg
                      ? <Badge label="Installed" variant="ready" />
                      : null
                  }
                </button>

                {isOpen && def && (
                  <div className="px-6 pb-5 border-t border-surface-800/60 space-y-4 bg-surface-950/30">
                    <p className="text-xs text-surface-400 leading-relaxed pt-4">{def.description}</p>

                    {/* Core characteristics */}
                    {(def.core_characteristics?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-[11px] font-medium text-surface-500 mb-2">Core Characteristics</p>
                        <ul className="space-y-1">
                          {def.core_characteristics.map((c: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-surface-400">
                              <CheckCircle2 className="w-3 h-3 text-success-400 mt-0.5 flex-shrink-0" />
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Stage objectives */}
                    {Object.keys(def.stage_objectives ?? {}).length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium text-surface-500 mb-2">Stage Objectives</p>
                        {Object.entries(def.stage_objectives).map(([stageCode, objs]) => (
                          <div key={stageCode} className="mb-3">
                            <p className="text-[11px] font-mono text-accent-400 mb-1">{stageCode}</p>
                            <ul className="space-y-1 pl-2">
                              {(objs as string[]).map((obj, i) => (
                                <li key={i} className="text-[11px] text-surface-400">• {obj}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Linked packages */}
                    <div>
                      <p className="text-[11px] font-medium text-surface-500 mb-1">Package Code</p>
                      <span className="text-xs font-mono text-surface-400">{code}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionShell>
  );
}

// ── Package Library ───────────────────────────────────────────────────────────

function PackageLibrary() {
  const [packages, setPackages]   = useState<PackageRow[]>([]);
  const [expanded, setExpanded]   = useState<string | null>('MT-BEG-001');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from('engine_package_registry')
        .select('code, label, description, package_type, parent_code, package_group, sort_order, trigger_seq, is_active')
        .eq('package_group', 'MT')
        .order('sort_order');
      if (err) { setError(err.message); } else { setPackages((data ?? []) as PackageRow[]); }
      setLoading(false);
    })();
  }, []);

  const TYPE_COLOR: Record<string, string> = {
    role:    'text-primary-400',
    stage:   'text-accent-400',
    image:   'text-success-400',
    video:   'text-warning-400',
    modifier: 'text-surface-400',
  };

  function renderTree(parentCode: string | null, depth = 0): React.ReactNode {
    const children = packages.filter(p => p.parent_code === parentCode);
    return children.map(pkg => {
      const imgChildren   = packages.filter(p => p.parent_code === pkg.code && p.package_type === 'image');
      const hasChildren   = packages.some(p => p.parent_code === pkg.code);
      const isOpen        = expanded === pkg.code;
      const colorClass    = TYPE_COLOR[pkg.package_type] ?? 'text-surface-400';
      const indent        = depth * 16;

      return (
        <div key={pkg.code}>
          <div
            className="flex items-center gap-2 py-2 hover:bg-surface-800/30 rounded-lg px-2 cursor-pointer transition-colors"
            style={{ paddingLeft: `${8 + indent}px` }}
            onClick={() => hasChildren ? setExpanded(p => p === pkg.code ? null : pkg.code) : undefined}
          >
            {hasChildren
              ? isOpen
                ? <ChevronDown className="w-3 h-3 text-surface-600 flex-shrink-0" />
                : <ChevronRight className="w-3 h-3 text-surface-600 flex-shrink-0" />
              : <span className="w-3 h-3 flex-shrink-0" />
            }
            <span className={`text-[11px] font-mono font-semibold ${colorClass} w-24 flex-shrink-0`}>{pkg.code}</span>
            <span className="text-[11px] text-surface-400 flex-1">{pkg.label}</span>
            <span className="text-[10px] text-surface-600 font-mono">{pkg.package_type}</span>
          </div>

          {/* Image package children under a stage */}
          {isOpen && imgChildren.length > 0 && (
            <div className="ml-6 border-l border-surface-800 pl-3 mb-1">
              {imgChildren.map(img => (
                <div key={img.code} className="flex items-center gap-2 py-1.5 px-2">
                  <span className="w-3 h-3 flex-shrink-0" />
                  <span className="text-[11px] font-mono text-success-400 w-24 flex-shrink-0">{img.code}</span>
                  <span className="text-[11px] text-surface-500 flex-1">{img.label}</span>
                  {img.trigger_seq !== null && (
                    <span className="text-[10px] font-mono text-surface-600">SEQ-{String(img.trigger_seq).padStart(2, '0')}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Recurse non-image children */}
          {isOpen && renderTree(pkg.code, depth + 1)}
        </div>
      );
    });
  }

  return (
    <SectionShell title="Package Library" icon={Package}>
      {loading && <SpinnerRow />}
      {error   && <ErrorRow message={error} />}
      {!loading && !error && (
        <div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4 pb-3 border-b border-surface-800">
            {Object.entries(TYPE_COLOR).map(([type, cls]) => (
              <span key={type} className={`text-[10px] font-medium ${cls}`}>
                ● {type}
              </span>
            ))}
          </div>
          <div className="space-y-0.5">
            {renderTree(null)}
          </div>
        </div>
      )}
    </SectionShell>
  );
}

// ── AI Companion Settings ─────────────────────────────────────────────────────

function CompanionSettings({ profile }: { profile: CreatorProfile | null }) {
  if (!profile) {
    return (
      <SectionShell title="AI Companion Settings" icon={Sparkles}>
        <Placeholder description="AI companion settings have not been configured yet. Complete the AI Companion setup to see your configuration here." />
      </SectionShell>
    );
  }

  const fields: { label: string; value: string | number | null | undefined }[] = [
    { label: 'Companion Name',       value: profile.ai_companion_name },
    { label: 'Gender',               value: profile.ai_companion_gender },
    { label: 'Age',                  value: profile.ai_companion_age },
    { label: 'Personality Type',     value: profile.ai_companion_personality_type },
    { label: 'Emotional Style',      value: profile.ai_companion_emotional_style },
    { label: 'Relationship Dynamic', value: profile.ai_rel_dynamic },
    { label: 'Attachment Level',     value: profile.ai_rel_attachment },
    { label: 'Conversation Pace',    value: profile.ai_comm_conversation_pace },
    { label: 'Media Permissions',    value: profile.ai_bp_media_permissions },
  ];

  return (
    <SectionShell title="AI Companion Settings" icon={Sparkles}>
      <p className="text-xs text-surface-500 mb-4">
        Read-only snapshot of your configured companion profile. Edit settings via the AI Companion tab.
      </p>
      <dl className="space-y-2.5">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex gap-3 items-start">
            <dt className="text-[11px] text-surface-600 w-40 flex-shrink-0">{label}</dt>
            <dd className="text-xs text-surface-300">
              {(value !== null && value !== undefined && value !== '')
                ? String(value)
                : <span className="text-surface-600 italic">Not set</span>
              }
            </dd>
          </div>
        ))}
      </dl>
      {profile.bio && (
        <div className="mt-4 pt-4 border-t border-surface-800">
          <p className="text-[11px] text-surface-600 mb-1.5">Bio</p>
          <p className="text-xs text-surface-300 leading-relaxed">{profile.bio}</p>
        </div>
      )}
    </SectionShell>
  );
}
