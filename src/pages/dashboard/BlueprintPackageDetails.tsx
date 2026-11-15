import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Loader2, AlertCircle, Save, Copy, Archive, Package,
  Plus, Trash2, X, Search, Layers, History, CheckCircle2, GitBranch, Lock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  BlueprintPackage, BlueprintComponent, BlueprintComponentType,
  BlueprintPackageComponentDetail, BlueprintStatus,
} from '../../types/blueprint';

const STATUS_STYLES: Record<BlueprintStatus, string> = {
  draft:     'bg-surface-700/50 text-surface-300',
  published: 'bg-success-600/15 text-success-400',
  archived:  'bg-surface-800 text-surface-500',
};
const STATUS_LABELS: Record<BlueprintStatus, string> = {
  draft: 'Draft', published: 'Published', archived: 'Archived',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function BlueprintPackageDetails({
  packageId, creatorId, onBack, onNavigateToPackage,
}: {
  packageId: string;
  creatorId: string;
  onBack: () => void;
  onNavigateToPackage: (id: string) => void;
}) {
  const [pkg, setPkg] = useState<BlueprintPackage | null>(null);
  const [refs, setRefs] = useState<BlueprintPackageComponentDetail[]>([]);
  const [versions, setVersions] = useState<BlueprintPackage[]>([]);
  const [componentTypes, setComponentTypes] = useState<BlueprintComponentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showAddComponent, setShowAddComponent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [pkgRes, refsRes, typesRes] = await Promise.all([
      supabase.from('blueprint_packages').select('*').eq('id', packageId).maybeSingle(),
      supabase
        .from('blueprint_package_components')
        .select(`
          *,
          component:blueprint_components (
            id, name, code, description, metadata, status, version,
            component_type_id
          ),
          component_type:blueprint_component_types (id, code, label)
        `)
        .eq('package_id', packageId)
        .order('display_order', { ascending: true }),
      supabase.from('blueprint_component_types').select('*').order('display_order'),
    ]);

    if (pkgRes.error) { setError(pkgRes.error.message); setLoading(false); return; }
    if (!pkgRes.data) { setError('Package not found.'); setLoading(false); return; }

    setPkg(pkgRes.data as BlueprintPackage);
    setEditName((pkgRes.data as BlueprintPackage).name);
    setEditDesc((pkgRes.data as BlueprintPackage).description ?? '');

    if (refsRes.error) {
      setError(refsRes.error.message);
    } else {
      setRefs((refsRes.data ?? []) as unknown as BlueprintPackageComponentDetail[]);
    }
    setComponentTypes((typesRes.data ?? []) as BlueprintComponentType[]);

    // Load version history
    const current = pkgRes.data as BlueprintPackage;
    const rootId = current.version_root_id ?? current.id;
    const verRes = await supabase
      .from('blueprint_packages')
      .select('*')
      .or(`id.eq.${rootId},version_root_id.eq.${rootId}`)
      .order('version', { ascending: false });
    if (!verRes.error) {
      setVersions((verRes.data ?? []) as BlueprintPackage[]);
    }

    setLoading(false);
  }, [packageId]);

  useEffect(() => { load(); }, [load]);

  // ── Save edits (draft only — published packages are immutable) ──────────
  const handleSave = async () => {
    if (!pkg) return;
    setSaving(true);
    setActionMsg(null);
    const { error: err } = await supabase
      .from('blueprint_packages')
      .update({ name: editName.trim(), description: editDesc.trim() || null })
      .eq('id', pkg.id);
    setSaving(false);
    if (err) {
      setActionMsg({ type: 'error', text: err.message });
    } else {
      setActionMsg({ type: 'success', text: 'Package updated.' });
      setEditing(false);
      load();
    }
  };

  // ── Create new version (for published packages) ───────────────────────
  // Inserts a new row with version = current+1, copies content + component
  // refs, then navigates to the new draft version.
  const handleNewVersion = async () => {
    if (!pkg) return;
    setSaving(true);
    setActionMsg(null);

    const rootId = pkg.version_root_id ?? pkg.id;
    const newVersion = pkg.version + 1;
    const newCode = `${pkg.code}_V${newVersion}`;

    const { data, error: err } = await supabase
      .from('blueprint_packages')
      .insert({
        creator_id: creatorId,
        name: pkg.name,
        code: newCode,
        description: pkg.description,
        metadata: pkg.metadata,
        status: 'draft',
        version: newVersion,
        version_root_id: rootId,
        parent_package_id: pkg.id,
      })
      .select()
      .maybeSingle();

    if (err) {
      setSaving(false);
      setActionMsg({ type: 'error', text: err.message });
      return;
    }

    const newPkg = data as BlueprintPackage | null;

    // Copy component references to the new version
    if (newPkg && refs.length > 0) {
      const newRefs = refs.map((r, i) => ({
        package_id: newPkg.id,
        component_id: r.component_id,
        component_type_id: r.component_type_id,
        display_order: r.display_order ?? i,
        metadata: r.metadata,
      }));
      const { error: refErr } = await supabase.from('blueprint_package_components').insert(newRefs);
      if (refErr) {
        setSaving(false);
        setActionMsg({ type: 'error', text: refErr.message });
        return;
      }
    }

    setSaving(false);
    onNavigateToPackage(newPkg!.id);
  };

  // ── Duplicate ───────────────────────────────────────────────────────────
  const handleDuplicate = async () => {
    if (!pkg) return;
    setSaving(true);
    setActionMsg(null);
    const newCode = `${pkg.code}_COPY_${Date.now().toString(36).toUpperCase()}`;
    const { data, error: err } = await supabase
      .from('blueprint_packages')
      .insert({
        creator_id: creatorId,
        name: `${pkg.name} (Copy)`,
        code: newCode,
        description: pkg.description,
        metadata: pkg.metadata,
        status: 'draft',
      })
      .select()
      .maybeSingle();

    if (err) {
      setSaving(false);
      setActionMsg({ type: 'error', text: err.message });
      return;
    }

    // Copy component references
    if (data && refs.length > 0) {
      const newRefs = refs.map((r, i) => ({
        package_id: (data as BlueprintPackage).id,
        component_id: r.component_id,
        component_type_id: r.component_type_id,
        display_order: r.display_order ?? i,
        metadata: r.metadata,
      }));
      await supabase.from('blueprint_package_components').insert(newRefs);
    }

    setSaving(false);
    setActionMsg({ type: 'success', text: 'Package duplicated as draft.' });
    load();
  };

  // ── Archive ────────────────────────────────────────────────────────────
  const handleArchive = async () => {
    if (!pkg) return;
    setSaving(true);
    setActionMsg(null);
    const { error: err } = await supabase
      .from('blueprint_packages')
      .update({ status: 'archived' })
      .eq('id', pkg.id);
    setSaving(false);
    if (err) {
      setActionMsg({ type: 'error', text: err.message });
    } else {
      setActionMsg({ type: 'success', text: 'Package archived.' });
      load();
    }
  };

  // ── Publish ─────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!pkg) return;
    setSaving(true);
    setActionMsg(null);
    const { error: err } = await supabase
      .from('blueprint_packages')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', pkg.id);
    setSaving(false);
    if (err) {
      setActionMsg({ type: 'error', text: err.message });
    } else {
      setActionMsg({ type: 'success', text: 'Package published.' });
      load();
    }
  };

  // ── Remove component ──────────────────────────────────────────────────
  const handleRemoveComponent = async (refId: string) => {
    const { error: err } = await supabase
      .from('blueprint_package_components')
      .delete()
      .eq('id', refId);
    if (err) {
      setActionMsg({ type: 'error', text: err.message });
    } else {
      load();
    }
  };

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
      </div>
    );
  }
  if (error && !pkg) {
    return (
      <div className="card flex items-center gap-3 py-4 px-4 border-danger-500/20">
        <AlertCircle className="w-5 h-5 text-danger-400 flex-shrink-0" />
        <p className="text-sm text-danger-300">{error}</p>
      </div>
    );
  }
  if (!pkg) return null;

  return (
    <div className="space-y-4">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="text-lg font-semibold text-surface-100 bg-surface-950 border border-surface-700 rounded-lg px-2 py-1 focus:outline-none focus:border-accent-600/40 w-full"
            />
          ) : (
            <h2 className="text-lg font-semibold text-surface-100 truncate">{pkg.name}</h2>
          )}
          <p className="text-xs text-surface-500 font-mono">{pkg.code}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {editing ? (
            <>
              <button
                onClick={() => { setEditing(false); setEditName(pkg.name); setEditDesc(pkg.description ?? ''); }}
                className="px-3 py-2 rounded-lg text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-surface-100 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </>
          ) : (
            <>
              {pkg.status === 'draft' && (
                <button
                  onClick={handlePublish}
                  disabled={saving}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-surface-100 bg-success-600 hover:bg-success-500 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Publish
                </button>
              )}
              {pkg.status === 'draft' && (
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-2 rounded-lg text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
                >
                  Edit
                </button>
              )}
              {pkg.status === 'published' && (
                <button
                  onClick={handleNewVersion}
                  disabled={saving}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-surface-100 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
                  New Version
                </button>
              )}
              {pkg.status === 'draft' && (
                <button
                  onClick={handleDuplicate}
                  disabled={saving}
                  title="Duplicate as draft"
                  className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
              {pkg.status !== 'archived' && (
                <button
                  onClick={handleArchive}
                  disabled={saving}
                  title="Archive"
                  className="p-2 rounded-lg text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-colors"
                >
                  <Archive className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Status + meta */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-xs px-2 py-1 rounded ${STATUS_STYLES[pkg.status]}`}>
          {STATUS_LABELS[pkg.status]}
        </span>
        <span className="text-xs text-surface-500 bg-surface-800 px-2 py-1 rounded">
          v{pkg.version}
        </span>
        <span className="text-xs text-surface-500">Created {formatDate(pkg.created_at)}</span>
        {pkg.published_at && (
          <span className="text-xs text-surface-500">Published {formatDate(pkg.published_at)}</span>
        )}
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
          actionMsg.type === 'success'
            ? 'text-success-300 bg-success-600/10 border border-success-600/20'
            : 'text-danger-300 bg-danger-500/10 border border-danger-500/20'
        }`}>
          {actionMsg.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {actionMsg.text}
        </div>
      )}

      {/* Description */}
      <div className="card p-4 space-y-2">
        <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wide">Description</h3>
        {editing ? (
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={2}
            className="w-full text-sm text-surface-200 bg-surface-950 border border-surface-700 rounded-lg p-2.5 resize-y focus:outline-none focus:border-accent-600/40 transition-colors"
            placeholder="What this package represents…"
          />
        ) : (
          <p className="text-sm text-surface-300">
            {pkg.description || <span className="text-surface-600 italic">No description</span>}
          </p>
        )}
      </div>

      {/* Components */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-semibold text-surface-200">Components</h3>
            <span className="text-xs text-surface-500">({refs.length})</span>
          </div>
          {pkg.status === 'draft' ? (
            <button
              onClick={() => setShowAddComponent(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-surface-600">
              <Lock className="w-3.5 h-3.5" />
              Locked
            </span>
          )}
        </div>

        {refs.length === 0 ? (
          <p className="text-xs text-surface-500 italic py-4 text-center">
            {pkg.status === 'draft'
              ? 'No components attached. Add components to define what this package generates.'
              : 'No components attached. Use “New Version” to add components.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {refs.map((ref) => (
              <div
                key={ref.id}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-900 border border-surface-800"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-surface-200 truncate">
                      {ref.component?.name ?? 'Unknown'}
                    </span>
                    <span className="text-[10px] text-surface-500 bg-surface-800 px-1.5 py-0.5 rounded">
                      {ref.component_type?.label ?? '—'}
                    </span>
                  </div>
                  <p className="text-xs text-surface-500 font-mono truncate">
                    {ref.component?.code ?? '—'}
                  </p>
                </div>
                {pkg.status === 'draft' && (
                  <button
                    onClick={() => handleRemoveComponent(ref.id)}
                    title="Remove from package"
                    className="p-1.5 rounded text-surface-500 hover:text-danger-400 hover:bg-danger-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Version history */}
      {versions.length > 1 && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-surface-400" />
            <h3 className="text-sm font-semibold text-surface-200">Version History</h3>
          </div>
          <div className="space-y-1.5">
            {versions.map((v) => (
              <div
                key={v.id}
                className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                  v.id === pkg.id
                    ? 'bg-accent-600/10 border-accent-600/20'
                    : 'bg-surface-900 border-surface-800'
                }`}
              >
                <span className="text-sm font-medium text-surface-200 w-12">v{v.version}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[v.status]}`}>
                  {STATUS_LABELS[v.status]}
                </span>
                <span className="text-xs text-surface-500 flex-1">
                  {formatDate(v.created_at)}
                </span>
                {v.id === pkg.id && (
                  <span className="text-[10px] text-accent-400 font-medium">Current</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add component modal — draft packages only */}
      {showAddComponent && pkg.status === 'draft' && (
        <AddComponentModal
          creatorId={creatorId}
          packageId={packageId}
          componentTypes={componentTypes}
          existingComponentIds={refs.map(r => r.component_id)}
          onClose={() => setShowAddComponent(false)}
          onAdded={() => { setShowAddComponent(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Add Component Modal ───────────────────────────────────────────────────

function AddComponentModal({
  creatorId, packageId, componentTypes, existingComponentIds, onClose, onAdded,
}: {
  creatorId: string;
  packageId: string;
  componentTypes: BlueprintComponentType[];
  existingComponentIds: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [components, setComponents] = useState<BlueprintComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('blueprint_components')
        .select('*')
        .eq('creator_id', creatorId)
        .in('status', ['draft', 'published'])
        .order('name', { ascending: true })
        .limit(200);

      if (!error) setComponents((data ?? []) as BlueprintComponent[]);
      setLoading(false);
    })();
  }, [creatorId]);

  const filtered = components.filter((c) => {
    if (existingComponentIds.includes(c.id)) return false;
    if (typeFilter !== 'all' && c.component_type_id !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
  });

  const handleAdd = async (component: BlueprintComponent) => {
    setAdding(component.id);
    const { error } = await supabase
      .from('blueprint_package_components')
      .insert({
        package_id: packageId,
        component_id: component.id,
        component_type_id: component.component_type_id,
        display_order: existingComponentIds.length,
      });
    setAdding(null);
    if (error) {
      // keep modal open on error
      return;
    }
    onAdded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface-900 border border-surface-700 rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-surface-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-600/15 flex items-center justify-center">
              <Layers className="w-4 h-4 text-accent-400" />
            </div>
            <h3 className="text-sm font-semibold text-surface-100">Add Component</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 border-b border-surface-800">
          <div className="relative">
            <Search className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search components…"
              className="w-full pl-9 pr-3 py-2 text-sm text-surface-200 bg-surface-950 border border-surface-700 rounded-lg focus:outline-none focus:border-accent-600/40 transition-colors placeholder:text-surface-600"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setTypeFilter('all')}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                typeFilter === 'all'
                  ? 'bg-accent-600/20 text-accent-400'
                  : 'bg-surface-800 text-surface-400 hover:text-surface-200'
              }`}
            >
              All
            </button>
            {componentTypes.map((t) => (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  typeFilter === t.id
                    ? 'bg-accent-600/20 text-accent-400'
                    : 'bg-surface-800 text-surface-400 hover:text-surface-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-surface-500 italic py-8 text-center">
              No components available. Create Blueprint Components first.
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((c) => {
                const type = componentTypes.find(t => t.id === c.component_type_id);
                return (
                  <button
                    key={c.id}
                    onClick={() => handleAdd(c)}
                    disabled={adding === c.id}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left hover:bg-surface-800 transition-colors disabled:opacity-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-surface-200 truncate">{c.name}</span>
                        {type && (
                          <span className="text-[10px] text-surface-500 bg-surface-800 px-1.5 py-0.5 rounded">
                            {type.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-surface-500 font-mono truncate">{c.code}</p>
                    </div>
                    {adding === c.id ? (
                      <Loader2 className="w-4 h-4 text-surface-500 animate-spin flex-shrink-0" />
                    ) : (
                      <Plus className="w-4 h-4 text-surface-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
