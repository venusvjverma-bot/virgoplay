import { useState, useEffect, useCallback } from 'react';
import {
  FileText, ChevronRight, Loader2, AlertCircle, RefreshCw,
  Image as ImageIcon, Video, Music, FileCode, Search,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { GenerationRow, GenerationSnapshot } from '../../types/generation';
import GenerationDetailsPage from './GenerationDetailsPage';

const ASSET_TYPE_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  text: FileCode,
  face_swap: ImageIcon,
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export default function PromptManagerPage({ creatorId }: { creatorId: string }) {
  const [generations, setGenerations] = useState<GenerationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');

  const loadGenerations = useCallback(async () => {
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

  useEffect(() => {
    loadGenerations();
  }, [loadGenerations]);

  const handleBack = () => {
    setSelectedId(null);
    setRefreshKey(k => k + 1);
  };

  // Filter by search (asset type, subtype, prompt text, provider)
  const filtered = generations.filter((g) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const prompt = g.snapshot?.prompt ?? '';
    return (
      g.asset_type.toLowerCase().includes(q) ||
      (g.asset_subtype ?? '').toLowerCase().includes(q) ||
      (g.provider_name ?? '').toLowerCase().includes(q) ||
      prompt.toLowerCase().includes(q)
    );
  });

  // If a generation is selected, show the details page (which contains the
  // editable prompt area + Generate Again / Regenerate / Save Prompt buttons)
  if (selectedId) {
    return (
      <GenerationDetailsPage
        generationId={selectedId}
        creatorId={creatorId}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
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
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by type, subtype, provider, or prompt text…"
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
            <FileText className="w-6 h-6 text-surface-600" />
          </div>
          <p className="text-sm text-surface-400">
            {generations.length === 0 ? 'No generations yet' : 'No results match your search'}
          </p>
          <p className="text-xs text-surface-600 mt-1">
            {generations.length === 0
              ? 'Generations will appear here once you create them.'
              : 'Try a different search term.'}
          </p>
        </div>
      )}

      {/* List */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((gen) => {
            const AssetIcon = ASSET_TYPE_ICON[gen.asset_type] ?? ImageIcon;
            const snapshot = gen.snapshot as GenerationSnapshot | null;
            const prompt = snapshot?.prompt ?? '';
            return (
              <button
                key={gen.id}
                onClick={() => setSelectedId(gen.id)}
                className="card w-full flex items-center gap-4 p-3 text-left hover:border-accent-600/30 transition-colors group"
              >
                {/* Preview */}
                <div className="w-14 h-14 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {gen.output_public_url && gen.status === 'completed' ? (
                    <img
                      src={gen.output_public_url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <AssetIcon className="w-5 h-5 text-surface-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-surface-100 truncate">
                      {gen.asset_subtype ?? gen.asset_type}
                    </span>
                    <span className="text-[10px] text-surface-500 bg-surface-800 px-1.5 py-0.5 rounded">
                      v{gen.version}
                    </span>
                  </div>
                  <p className="text-xs text-surface-500 truncate mb-0.5">
                    {gen.asset_type}
                    {gen.asset_subtype ? ` / ${gen.asset_subtype}` : ''}
                    {' · '}
                    {gen.provider_name ?? '—'}
                    {' · '}
                    {formatDate(gen.created_at)}
                  </p>
                  {prompt && (
                    <p className="text-xs text-surface-400 truncate font-mono">
                      {truncate(prompt, 80)}
                    </p>
                  )}
                </div>

                {/* Chevron */}
                <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-surface-400 flex-shrink-0 transition-colors" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
