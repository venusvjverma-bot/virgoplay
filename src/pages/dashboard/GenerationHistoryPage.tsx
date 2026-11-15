import { useState, useEffect, useCallback } from 'react';
import {
  History, ChevronRight, Loader2, AlertCircle, RefreshCw,
  Image as ImageIcon, FileText, Video, Music, Eye,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { GenerationRow, GenerationStatus } from '../../types/generation';
import GenerationDetailsPage from './GenerationDetailsPage';

const STATUS_STYLES: Record<GenerationStatus, string> = {
  queued:           'text-surface-400 bg-surface-500/10 border-surface-500/20',
  uploading_assets: 'text-accent-400 bg-accent-500/10 border-accent-500/20',
  generating:       'text-primary-400 bg-primary-500/10 border-primary-500/20',
  processing:       'text-primary-400 bg-primary-500/10 border-primary-500/20',
  downloading:      'text-primary-400 bg-primary-500/10 border-primary-500/20',
  storing:          'text-primary-400 bg-primary-500/10 border-primary-500/20',
  completed:        'text-success-400 bg-success-500/10 border-success-500/20',
  failed:           'text-danger-400 bg-danger-500/10 border-danger-500/20',
};

const ASSET_TYPE_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  text: FileText,
  face_swap: ImageIcon,
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function GenerationHistoryPage({ creatorId }: { creatorId: string }) {
  const [generations, setGenerations] = useState<GenerationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
          <div className="w-10 h-10 rounded-xl bg-primary-600/15 border border-primary-600/20 flex items-center justify-center">
            <History className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-surface-100">Generation History</h2>
            <p className="text-xs text-surface-500">Every generation from the Generation Engine</p>
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
      {!loading && !error && generations.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-800 flex items-center justify-center mb-4">
            <History className="w-6 h-6 text-surface-600" />
          </div>
          <p className="text-sm text-surface-400">No generations yet</p>
          <p className="text-xs text-surface-600 mt-1">Generations will appear here once you create them.</p>
        </div>
      )}

      {/* List */}
      {!loading && !error && generations.length > 0 && (
        <div className="space-y-2">
          {generations.map((gen) => {
            const StatusIcon = ASSET_TYPE_ICON[gen.asset_type] ?? ImageIcon;
            return (
              <button
                key={gen.id}
                onClick={() => setSelectedId(gen.id)}
                className="card w-full flex items-center gap-4 p-3 text-left hover:border-primary-600/30 transition-colors group"
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
                    <StatusIcon className="w-5 h-5 text-surface-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-surface-100 truncate">
                      {gen.asset_subtype ?? gen.asset_type}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[gen.status]}`}>
                      {gen.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-surface-500">
                    <span>{gen.asset_type}</span>
                    {gen.asset_subtype && (
                      <>
                        <span className="text-surface-700">/</span>
                        <span>{gen.asset_subtype}</span>
                      </>
                    )}
                    <span className="text-surface-700">·</span>
                    <span className="truncate">{gen.provider_name}</span>
                  </div>
                </div>

                {/* Date */}
                <div className="text-xs text-surface-500 flex-shrink-0 hidden sm:block">
                  {formatDate(gen.created_at)}
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
