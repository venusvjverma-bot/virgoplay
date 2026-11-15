/**
 * Generation Page — Step 7 of the Mother Creator workflow.
 *
 * Combines:
 *   - Blueprint Package selection + orchestrator generation entry point
 *   - Generation queue / running jobs / completed jobs / failed jobs
 *   - Generation history
 *   - Downloads
 *
 * All generation actions flow through the Generation Orchestrator.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Package, Search, Loader2, AlertCircle, RefreshCw,
  ChevronRight, Zap, ArrowLeft, History, CheckCircle2,
  Cpu, Clock, Download,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { orchestrateGeneration, type OrchestratorRequest } from '../../lib/generation-orchestrator';
import type { BlueprintPackage, BlueprintStatus } from '../../types/blueprint';
import type { GenerationRow, GenerationStatus } from '../../types/generation';
import GenerationDetailsPage from './GenerationDetailsPage';

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

const GEN_STATUS_STYLES: Record<GenerationStatus, string> = {
  queued:           'text-surface-400 bg-surface-500/10 border-surface-500/20',
  uploading_assets: 'text-accent-400 bg-accent-500/10 border-accent-500/20',
  generating:       'text-primary-400 bg-primary-500/10 border-primary-500/20',
  processing:       'text-primary-400 bg-primary-500/10 border-primary-500/20',
  downloading:      'text-primary-400 bg-primary-500/10 border-primary-500/20',
  storing:          'text-primary-400 bg-primary-500/10 border-primary-500/20',
  completed:        'text-success-400 bg-success-500/10 border-success-500/20',
  failed:           'text-danger-400 bg-danger-500/10 border-danger-500/20',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

type View = 'list' | 'details' | 'history' | 'gen-details';

export default function GenerationPage({ creatorId }: { creatorId: string }) {
  const [view, setView] = useState<View>('list');
  const [selectedPackage, setSelectedPackage] = useState<BlueprintPackage | null>(null);
  const [selectedGenId, setSelectedGenId] = useState<string | null>(null);
  const [recentGenId, setRecentGenId] = useState<string | null>(null);
  const [recentGenStatus, setRecentGenStatus] = useState<GenerationStatus | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate(pkg: BlueprintPackage) {
    setGenerating(true);
    setGenError(null);
    setRecentGenId(null);
    setRecentGenStatus(null);

    const request: OrchestratorRequest = {
      packageId: pkg.id,
      asset_type: 'image',
      asset_subtype: 'scene',
      render_technique: 'text_to_image',
    };

    const result = await orchestrateGeneration(supabase, request);

    if (result.ok) {
      setRecentGenId(result.generationId);
      setRecentGenStatus(result.status);
    } else {
      setGenError(result.error.message);
    }

    setGenerating(false);
  }

  function handleSelectPackage(pkg: BlueprintPackage) {
    setSelectedPackage(pkg);
    setView('details');
    setGenError(null);
    setRecentGenId(null);
    setRecentGenStatus(null);
  }

  function handleBackToList() {
    setView('list');
    setSelectedPackage(null);
    setGenError(null);
    setRecentGenId(null);
    setRecentGenStatus(null);
  }

  function handleOpenHistory() {
    setView('history');
  }

  function handleOpenGenDetails(genId: string) {
    setSelectedGenId(genId);
    setView('gen-details');
  }

  function handleBackFromGenDetails() {
    setSelectedGenId(null);
    setView('history');
  }

  function handleBackFromHistory() {
    if (selectedPackage) {
      setView('details');
    } else {
      setView('list');
    }
  }

  if (view === 'gen-details' && selectedGenId) {
    return (
      <GenerationDetailsPage
        generationId={selectedGenId}
        creatorId={creatorId}
        onBack={handleBackFromGenDetails}
      />
    );
  }

  if (view === 'history') {
    return (
      <HistoryView
        creatorId={creatorId}
        onBack={handleBackFromHistory}
        onSelectGen={handleOpenGenDetails}
      />
    );
  }

  if (view === 'details' && selectedPackage) {
    return (
      <PackageDetailView
        pkg={selectedPackage}
        creatorId={creatorId}
        onBack={handleBackToList}
        onGenerate={handleGenerate}
        onOpenHistory={handleOpenHistory}
        generating={generating}
        recentGenId={recentGenId}
        recentGenStatus={recentGenStatus}
        genError={genError}
        onViewGenDetails={handleOpenGenDetails}
      />
    );
  }

  return (
    <PackageListView
      creatorId={creatorId}
      onSelectPackage={handleSelectPackage}
      onOpenHistory={handleOpenHistory}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Package List View — browse Blueprint Packages to generate from
// ═══════════════════════════════════════════════════════════════════════════

function PackageListView({
  creatorId, onSelectPackage, onOpenHistory,
}: {
  creatorId: string;
  onSelectPackage: (pkg: BlueprintPackage) => void;
  onOpenHistory: () => void;
}) {
  const [packages, setPackages] = useState<BlueprintPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

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

  const filtered = packages.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600/15 border border-primary-600/20 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-surface-100">Generation</h2>
            <p className="text-xs text-surface-500">Select a published Blueprint Package to generate</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenHistory}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">History</span>
          </button>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search packages…"
          className="w-full pl-9 pr-3 py-2.5 text-sm text-surface-200 bg-surface-900 border border-surface-700 rounded-lg focus:outline-none focus:border-primary-600/40 transition-colors placeholder:text-surface-600"
        />
      </div>

      {loading && (
        <div className="card flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="card flex items-center gap-3 py-4 px-4 border-danger-500/20">
          <AlertCircle className="w-5 h-5 text-danger-400 flex-shrink-0" />
          <p className="text-sm text-danger-300">{error}</p>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-800 flex items-center justify-center mb-4">
            <Package className="w-6 h-6 text-surface-600" />
          </div>
          <p className="text-sm text-surface-400">No Blueprint Packages found</p>
          <p className="text-xs text-surface-600 mt-1">Publish a Blueprint from the Master AI Blueprint tab first.</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(pkg => (
            <button
              key={pkg.id}
              onClick={() => onSelectPackage(pkg)}
              className="card w-full flex items-center gap-4 p-3 text-left hover:border-primary-600/30 transition-colors group"
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
                  <span className="text-[10px] text-surface-500 bg-surface-800 px-1.5 py-0.5 rounded">v{pkg.version}</span>
                </div>
                <p className="text-xs text-surface-500 truncate">{pkg.code} · {formatDate(pkg.created_at)}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-surface-400 flex-shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Package Detail View — review info and generate
// ═══════════════════════════════════════════════════════════════════════════

function PackageDetailView({
  pkg, creatorId, onBack, onGenerate, onOpenHistory,
  generating, recentGenId, recentGenStatus, genError, onViewGenDetails,
}: {
  pkg: BlueprintPackage;
  creatorId: string;
  onBack: () => void;
  onGenerate: (pkg: BlueprintPackage) => void;
  onOpenHistory: () => void;
  generating: boolean;
  recentGenId: string | null;
  recentGenStatus: GenerationStatus | null;
  genError: string | null;
  onViewGenDetails: (genId: string) => void;
}) {
  const [componentCount, setComponentCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from('blueprint_package_components')
        .select('*', { count: 'exact', head: true })
        .eq('package_id', pkg.id);
      setComponentCount(count ?? 0);
    })();
  }, [pkg.id]);

  const canGenerate = pkg.status === 'published' && (componentCount ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-surface-100 truncate">{pkg.name}</h2>
          <p className="text-xs text-surface-500 font-mono">{pkg.code}</p>
        </div>
        <button
          onClick={onOpenHistory}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
        >
          <History className="w-4 h-4" />
          <span className="hidden sm:inline">History</span>
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-xs px-2 py-1 rounded ${STATUS_STYLES[pkg.status]}`}>
          {STATUS_LABELS[pkg.status]}
        </span>
        <span className="text-xs text-surface-500 bg-surface-800 px-2 py-1 rounded">v{pkg.version}</span>
        <span className="text-xs text-surface-500">Created {formatDate(pkg.created_at)}</span>
        {componentCount !== null && (
          <span className="text-xs text-surface-500 bg-surface-800 px-2 py-1 rounded">
            {componentCount} component{componentCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="card p-4 space-y-2">
        <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wide">Description</h3>
        <p className="text-sm text-surface-300">
          {pkg.description || <span className="text-surface-600 italic">No description</span>}
        </p>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-semibold text-surface-200">Generation</h3>
          </div>
          <button
            onClick={() => onGenerate(pkg)}
            disabled={generating || !canGenerate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-surface-100 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Generate
          </button>
        </div>

        {!canGenerate && !generating && (
          <p className="text-xs text-surface-500">
            {pkg.status !== 'published'
              ? 'Only published packages can be generated. Publish this package first.'
              : 'This package has no components. Add components before generating.'}
          </p>
        )}

        {recentGenId && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-900 border border-surface-800">
            <span className={`text-xs px-2 py-1 rounded-full border ${recentGenStatus ? GEN_STATUS_STYLES[recentGenStatus] : ''}`}>
              {recentGenStatus ?? 'queued'}
            </span>
            <span className="text-xs text-surface-400 font-mono">{recentGenId.slice(0, 8)}…</span>
            <button
              onClick={() => onViewGenDetails(recentGenId)}
              className="ml-auto text-xs text-primary-400 hover:text-primary-300 transition-colors"
            >
              View Details
            </button>
          </div>
        )}

        {genError && (
          <div className="flex items-center gap-2 text-xs text-danger-300 bg-danger-500/10 border border-danger-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {genError}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// History View — all generations with status, queue, and downloads
// ═══════════════════════════════════════════════════════════════════════════

function HistoryView({
  creatorId, onBack, onSelectGen,
}: {
  creatorId: string;
  onBack: () => void;
  onSelectGen: (genId: string) => void;
}) {
  const [generations, setGenerations] = useState<GenerationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('generations')
      .select('*')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (err) {
      setError(err.message);
    } else {
      setGenerations((data ?? []) as GenerationRow[]);
    }
    setLoading(false);
  }, [creatorId, refreshKey]);

  useEffect(() => { load(); }, [load]);

  const active = generations.filter(g =>
    ['queued', 'uploading_assets', 'generating', 'processing', 'downloading', 'storing'].includes(g.status)
  );
  const completed = generations.filter(g => g.status === 'completed');
  const failed = generations.filter(g => g.status === 'failed');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-600/15 border border-primary-600/20 flex items-center justify-center">
              <History className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-100">Generation History</h2>
              <p className="text-xs text-surface-500">Queue, completed jobs, failed jobs, and downloads</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <div className="text-lg font-semibold text-primary-400">{active.length}</div>
          <div className="text-[10px] text-surface-500 uppercase tracking-wide">Active</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-lg font-semibold text-success-400">{completed.length}</div>
          <div className="text-[10px] text-surface-500 uppercase tracking-wide">Completed</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-lg font-semibold text-danger-400">{failed.length}</div>
          <div className="text-[10px] text-surface-500 uppercase tracking-wide">Failed</div>
        </div>
      </div>

      {loading && (
        <div className="card flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="card flex items-center gap-3 py-4 px-4 border-danger-500/20">
          <AlertCircle className="w-5 h-5 text-danger-400 flex-shrink-0" />
          <p className="text-sm text-danger-300">{error}</p>
        </div>
      )}

      {!loading && !error && generations.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-800 flex items-center justify-center mb-4">
            <History className="w-6 h-6 text-surface-600" />
          </div>
          <p className="text-sm text-surface-400">No generations yet</p>
          <p className="text-xs text-surface-600 mt-1">Select a Blueprint Package to generate.</p>
        </div>
      )}

      {!loading && !error && generations.length > 0 && (
        <div className="space-y-2">
          {generations.map(gen => (
            <div
              key={gen.id}
              className="card w-full flex items-center gap-4 p-3 group"
            >
              <div className="w-14 h-14 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {gen.output_public_url && gen.status === 'completed' ? (
                  <img src={gen.output_public_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <Clock className="w-5 h-5 text-surface-600" />
                )}
              </div>
              <button
                onClick={() => onSelectGen(gen.id)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-surface-100 truncate">
                    {gen.asset_subtype ?? gen.asset_type}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${GEN_STATUS_STYLES[gen.status]}`}>
                    {gen.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-surface-500">
                  <span>{gen.asset_type}</span>
                  <span className="text-surface-700">·</span>
                  <span className="truncate">{gen.provider_name}</span>
                </div>
              </button>
              <div className="text-xs text-surface-500 flex-shrink-0 hidden sm:block">
                {formatDate(gen.created_at)}
              </div>
              {gen.output_public_url && gen.status === 'completed' && (
                <a
                  href={gen.output_public_url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-surface-400 hover:text-primary-400 hover:bg-surface-800 transition-colors flex-shrink-0"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </a>
              )}
              <button
                onClick={() => onSelectGen(gen.id)}
                className="p-1 rounded-lg text-surface-600 group-hover:text-surface-400 transition-colors flex-shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
