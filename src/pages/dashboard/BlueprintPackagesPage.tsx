import { useState, useEffect, useCallback } from 'react';
import {
  Package, Plus, Search, Loader2, AlertCircle, RefreshCw,
  ChevronRight, Copy, Archive, FileText, Layers,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { BlueprintPackage, BlueprintStatus } from '../../types/blueprint';
import BlueprintPackageDetails from './BlueprintPackageDetails';
import AppearanceLibrary from './AppearanceLibrary';

type BlueprintTab = 'packages' | 'appearance';

const STATUS_STYLES: Record<BlueprintStatus, string> = {
  draft:     'bg-surface-700/50 text-surface-300',
  published: 'bg-success-600/15 text-success-400',
  archived:  'bg-surface-800 text-surface-500',
};

const STATUS_LABELS: Record<BlueprintStatus, string> = {
  draft:     'Draft',
  published: 'Published',
  archived:  'Archived',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function BlueprintPackagesPage({ creatorId }: { creatorId: string }) {
  const [packages, setPackages] = useState<BlueprintPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<BlueprintTab>('packages');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('blueprint_packages')
      .select('*')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (err) {
      setError(err.message);
    } else {
      setPackages((data ?? []) as BlueprintPackage[]);
    }
    setLoading(false);
  }, [creatorId, refreshKey]);

  useEffect(() => { load(); }, [load]);

  const filtered = packages.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q) ||
      p.status.toLowerCase().includes(q)
    );
  });

  const activeCount = packages.filter(p => p.status !== 'archived').length;

  if (selectedId) {
    return (
      <BlueprintPackageDetails
        packageId={selectedId}
        creatorId={creatorId}
        onBack={() => {
          setSelectedId(null);
          setRefreshKey(k => k + 1);
        }}
        onNavigateToPackage={(newId: string) => setSelectedId(newId)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-600/15 border border-accent-600/20 flex items-center justify-center">
            <Package className="w-5 h-5 text-accent-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-surface-100">Master AI Blueprints</h2>
            <p className="text-xs text-surface-500">
              {activeCount} published blueprint{activeCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {tab === 'packages' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-surface-100 bg-accent-600 hover:bg-accent-500 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Package
            </button>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {([
          { id: 'packages', label: 'Blueprints', icon: Package },
          { id: 'appearance', label: 'Appearance', icon: Layers },
        ] as { id: BlueprintTab; label: string; icon: typeof Package }[]).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 border',
            tab === id ? 'bg-accent-600/15 text-accent-400 border-accent-600/20' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800 border-transparent',
          ].join(' ')}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === 'appearance' && <AppearanceLibrary creatorId={creatorId} />}

      {tab === 'packages' && (<>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, code, or status…"
          className="w-full pl-9 pr-3 py-2.5 text-sm text-surface-200 bg-surface-900 border border-surface-700 rounded-lg focus:outline-none focus:border-accent-600/40 transition-colors placeholder:text-surface-600"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="card flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="card flex items-center gap-3 py-4 px-4 border-danger-500/20">
          <AlertCircle className="w-5 h-5 text-danger-400 flex-shrink-0" />
          <p className="text-sm text-danger-300">{error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-800 flex items-center justify-center mb-4">
            <Package className="w-6 h-6 text-surface-600" />
          </div>
          <p className="text-sm text-surface-400">
            {packages.length === 0 ? 'No Blueprint Packages yet' : 'No results match your search'}
          </p>
          <p className="text-xs text-surface-600 mt-1">
            {packages.length === 0
              ? 'Create your first package to define what should be generated.'
              : 'Try a different search term.'}
          </p>
          {packages.length === 0 && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-surface-100 bg-accent-600 hover:bg-accent-500 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Package
            </button>
          )}
        </div>
      )}

      {/* List */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((pkg) => (
            <PackageRow key={pkg.id} pkg={pkg} onClick={() => setSelectedId(pkg.id)} />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreatePackageModal
          creatorId={creatorId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setRefreshKey(k => k + 1);
          }}
        />
      )}

      </>
      )}
    </div>
  );
}

// ── Package Row ───────────────────────────────────────────────────────────

function PackageRow({ pkg, onClick }: { pkg: BlueprintPackage; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="card w-full flex items-center gap-4 p-3 text-left hover:border-accent-600/30 transition-colors group"
    >
      <div className="w-12 h-12 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
        <Package className="w-5 h-5 text-surface-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-surface-100 truncate">{pkg.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[pkg.status]}`}>
            {STATUS_LABELS[pkg.status]}
          </span>
          <span className="text-[10px] text-surface-500 bg-surface-800 px-1.5 py-0.5 rounded">
            v{pkg.version}
          </span>
        </div>
        <p className="text-xs text-surface-500 truncate">
          {pkg.code} · {formatDate(pkg.created_at)}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-surface-400 flex-shrink-0 transition-colors" />
    </button>
  );
}

// ── Create Modal ──────────────────────────────────────────────────────────

function CreatePackageModal({
  creatorId, onClose, onCreated,
}: {
  creatorId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      setError('Name and code are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('blueprint_packages')
      .insert({
        creator_id: creatorId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
      });
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      onCreated();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface-900 border border-surface-700 rounded-xl shadow-2xl">
        <div className="flex items-center gap-3 p-4 border-b border-surface-800">
          <div className="w-9 h-9 rounded-lg bg-accent-600/15 flex items-center justify-center">
            <Package className="w-4 h-4 text-accent-400" />
          </div>
          <h3 className="text-sm font-semibold text-surface-100">New Blueprint Package</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 text-xs text-danger-300 bg-danger-500/10 border border-danger-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full text-sm text-surface-200 bg-surface-950 border border-surface-700 rounded-lg p-2.5 focus:outline-none focus:border-accent-600/40 transition-colors"
              placeholder="e.g. MT001 Café Scene"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full text-sm text-surface-200 bg-surface-950 border border-surface-700 rounded-lg p-2.5 focus:outline-none focus:border-accent-600/40 transition-colors font-mono"
              placeholder="e.g. MT001_CAFE"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full text-sm text-surface-200 bg-surface-950 border border-surface-700 rounded-lg p-2.5 resize-y focus:outline-none focus:border-accent-600/40 transition-colors"
              placeholder="What this package represents…"
            />
          </div>
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
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-surface-100 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
