import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Loader2, AlertCircle, Save, RefreshCw, Copy,
  CheckCircle2, XCircle, Clock, ExternalLink, Image as ImageIcon,
  FileText, Video, Music, Cpu, Zap, Layers,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { orchestrateRegeneration } from '../../lib/generation-orchestrator';
import type {
  GenerationRow,
  GenerationHistoryRow,
  GenerationStatus,
} from '../../types/generation';

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

const STATUS_ICON: Record<GenerationStatus, typeof Clock> = {
  queued: Clock,
  uploading_assets: RefreshCw,
  generating: Cpu,
  processing: Cpu,
  downloading: RefreshCw,
  storing: Save,
  completed: CheckCircle2,
  failed: XCircle,
};

const ASSET_TYPE_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  text: FileText,
  face_swap: ImageIcon,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function GenerationDetailsPage({
  generationId,
  creatorId,
  onBack,
}: {
  generationId: string;
  creatorId: string;
  onBack: () => void;
}) {
  const [generation, setGeneration] = useState<GenerationRow | null>(null);
  const [history, setHistory] = useState<GenerationHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editablePrompt, setEditablePrompt] = useState('');
  const [promptDirty, setPromptDirty] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Prompt Components — UI-only structured fields for future prompt assembly.
  // These never touch the Generation Engine or the snapshot.
  const COMPONENT_FIELDS = [
    'Subject',
    'Environment',
    'Pose',
    'Expression',
    'Camera',
    'Lighting',
    'Composition',
    'Quality',
    'Style',
    'Negative Prompt',
    'Extra Instructions',
  ] as const;
  type ComponentField = typeof COMPONENT_FIELDS[number];
  type ComponentState = Record<ComponentField, string>;
  const emptyComponents = (): ComponentState =>
    COMPONENT_FIELDS.reduce((acc, f) => { acc[f] = ''; return acc; }, {} as ComponentState);
  const [components, setComponents] = useState<ComponentState>(emptyComponents);
  const [componentsDirty, setComponentsDirty] = useState(false);

  const handleComponentChange = (field: ComponentField, value: string) => {
    setComponents((prev) => ({ ...prev, [field]: value }));
    setComponentsDirty(true);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [genRes, histRes] = await Promise.all([
      supabase.from('generations').select('*').eq('id', generationId).maybeSingle(),
      supabase
        .from('generation_history')
        .select('*')
        .eq('generation_id', generationId)
        .order('created_at', { ascending: true }),
    ]);

    if (genRes.error) {
      setError(genRes.error.message);
    } else if (!genRes.data) {
      setError('Generation not found.');
    } else {
      const gen = genRes.data as GenerationRow;
      setGeneration(gen);
      setEditablePrompt(gen.snapshot?.prompt ?? '');
      setPromptDirty(false);
      setComponents(emptyComponents());
      setComponentsDirty(false);
    }

    if (!histRes.error) {
      setHistory((histRes.data ?? []) as GenerationHistoryRow[]);
    }
    setLoading(false);
  }, [generationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll if generation is still active
  useEffect(() => {
    if (!generation) return;
    const activeStatuses: GenerationStatus[] = ['queued', 'uploading_assets', 'generating', 'processing', 'downloading', 'storing'];
    if (!activeStatuses.includes(generation.status)) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [generation, load]);

  const handlePromptChange = (val: string) => {
    setEditablePrompt(val);
    setPromptDirty(val !== (generation?.snapshot?.prompt ?? ''));
  };

  // Generate Again: same snapshot, new generation, no parent link.
  // Routes through the Generation Orchestrator — never calls the dispatcher directly.
  async function handleGenerateAgain() {
    if (!generation) return;
    setActionLoading('again');
    setActionMsg(null);
    try {
      const result = await orchestrateRegeneration(supabase, {
        generationId: generation.id,
      });
      if (result.ok) {
        setActionMsg({ type: 'success', text: `New generation created: ${result.generationId.slice(0, 8)}…` });
        setTimeout(() => onBack(), 1500);
      } else {
        setActionMsg({ type: 'error', text: result.error.message });
      }
    } catch (e) {
      setActionMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setActionLoading(null);
    }
  }

  // Regenerate: same snapshot, new generation with parent link for version chain.
  // Routes through the Generation Orchestrator.
  async function handleRegenerate() {
    if (!generation) return;
    setActionLoading('regen');
    setActionMsg(null);
    try {
      const result = await orchestrateRegeneration(supabase, {
        generationId: generation.id,
        parentGenerationId: generation.id,
      });
      if (result.ok) {
        setActionMsg({ type: 'success', text: `Regeneration created: ${result.generationId.slice(0, 8)}…` });
        setTimeout(() => onBack(), 1500);
      } else {
        setActionMsg({ type: 'error', text: result.error.message });
      }
    } catch (e) {
      setActionMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setActionLoading(null);
    }
  }

  // Save Prompt: creates a new generation with the edited prompt.
  // The original generation's snapshot is never modified.
  // Routes through the Generation Orchestrator.
  async function handleSavePrompt() {
    if (!generation || !promptDirty) return;
    setActionLoading('save');
    setActionMsg(null);
    try {
      const result = await orchestrateRegeneration(supabase, {
        generationId: generation.id,
        promptOverride: editablePrompt,
      });
      if (result.ok) {
        setActionMsg({ type: 'success', text: `New generation with edited prompt created: ${result.generationId.slice(0, 8)}…` });
        setPromptDirty(false);
        setTimeout(() => onBack(), 1500);
      } else {
        setActionMsg({ type: 'error', text: result.error.message });
      }
    } catch (e) {
      setActionMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
      </div>
    );
  }

  if (error || !generation) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-200 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to History
        </button>
        <div className="card flex items-center gap-3 py-4 px-4 border-danger-500/20">
          <AlertCircle className="w-5 h-5 text-danger-400 flex-shrink-0" />
          <p className="text-sm text-danger-300">{error ?? 'Generation not found.'}</p>
        </div>
      </div>
    );
  }

  const snapshot = generation.snapshot;
  const StatusIcon = STATUS_ICON[generation.status] ?? Clock;
  const AssetIcon = ASSET_TYPE_ICON[generation.asset_type] ?? ImageIcon;

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-200 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to History
      </button>

      {/* Header */}
      <div className="card p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-600/15 border border-primary-600/20 flex items-center justify-center">
              <AssetIcon className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-100">
                {generation.asset_subtype ?? generation.asset_type}
              </h2>
              <p className="text-xs text-surface-500 font-mono">{generation.id.slice(0, 8)}</p>
            </div>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full border flex items-center gap-1.5 ${STATUS_STYLES[generation.status]}`}>
            <StatusIcon className="w-3 h-3" />
            {generation.status}
          </span>
        </div>

        {/* Action message */}
        {actionMsg && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
            actionMsg.type === 'success'
              ? 'bg-success-500/10 text-success-300 border border-success-500/20'
              : 'bg-danger-500/10 text-danger-300 border border-danger-500/20'
          }`}>
            {actionMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {actionMsg.text}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleGenerateAgain}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-primary-600/15 text-primary-300 border border-primary-600/20 hover:bg-primary-600/25 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'again' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Generate Again
          </button>
          <button
            onClick={handleRegenerate}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-accent-600/15 text-accent-300 border border-accent-600/20 hover:bg-accent-600/25 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'regen' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Regenerate
          </button>
          <button
            onClick={handleSavePrompt}
            disabled={actionLoading !== null || !promptDirty}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-success-600/15 text-success-300 border border-success-600/20 hover:bg-success-600/25 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Prompt
          </button>
        </div>
      </div>

      {/* Output */}
      {generation.output_public_url && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-surface-200">Output</h3>
          <div className="rounded-lg overflow-hidden bg-surface-800 flex items-center justify-center max-h-96">
            {generation.asset_type === 'image' || generation.asset_type === 'face_swap' ? (
              <img src={generation.output_public_url} alt="Generation output" className="w-full h-auto object-contain" />
            ) : generation.asset_type === 'video' ? (
              <video src={generation.output_public_url} controls className="w-full h-auto" />
            ) : generation.asset_type === 'audio' ? (
              <audio src={generation.output_public_url} controls className="w-full" />
            ) : (
              <div className="p-4 text-sm text-surface-400 font-mono whitespace-pre-wrap break-words">
                {generation.output_public_url}
              </div>
            )}
          </div>
          <a
            href={generation.output_public_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Open original
          </a>
        </div>
      )}

      {/* Error details */}
      {generation.status === 'failed' && generation.error_message && (
        <div className="card p-4 space-y-2 border-danger-500/20">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-danger-400" />
            <h3 className="text-sm font-semibold text-danger-300">Error</h3>
          </div>
          <p className="text-sm text-surface-300">{generation.error_message}</p>
          {generation.failed_at_step && (
            <p className="text-xs text-surface-500">Failed at step: <span className="font-mono">{generation.failed_at_step}</span></p>
          )}
          {generation.error_details && (
            <pre className="text-xs text-surface-400 bg-surface-950 rounded-lg p-3 overflow-x-auto max-h-48">
              {JSON.stringify(generation.error_details, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Action Prompt + Prompt Components side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Action Prompt (editable) */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-surface-200">Action Prompt</h3>
            {promptDirty && (
              <span className="text-xs text-accent-400">Edited — Save Prompt will create a new generation</span>
            )}
          </div>
          <textarea
            value={editablePrompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            rows={12}
            className="w-full text-sm text-surface-200 bg-surface-950 border border-surface-700 rounded-lg p-3 resize-y focus:outline-none focus:border-primary-600/40 transition-colors"
            placeholder="No prompt in snapshot"
          />
          <p className="text-xs text-surface-500">
            Editing the prompt and saving creates a new generation. The original snapshot is never modified.
          </p>
        </div>

        {/* Prompt Components (UI-only, future prompt assembly) */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent-400" />
              <h3 className="text-sm font-semibold text-surface-200">Prompt Components</h3>
            </div>
            {componentsDirty && (
              <span className="text-xs text-surface-500">Unsaved draft</span>
            )}
          </div>
          <p className="text-xs text-surface-500">
            Structured fields for assembling future prompts. These do not modify the current generation.
          </p>
          <div className="space-y-2.5">
            {COMPONENT_FIELDS.map((field) => (
              <div key={field} className="space-y-1">
                <label className="text-xs font-medium text-surface-400">{field}</label>
                {field === 'Negative Prompt' || field === 'Extra Instructions' ? (
                  <textarea
                    value={components[field]}
                    onChange={(e) => handleComponentChange(field, e.target.value)}
                    rows={2}
                    className="w-full text-sm text-surface-200 bg-surface-950 border border-surface-700 rounded-lg p-2.5 resize-y focus:outline-none focus:border-accent-600/40 transition-colors placeholder:text-surface-600"
                    placeholder={`Enter ${field.toLowerCase()}…`}
                  />
                ) : (
                  <input
                    type="text"
                    value={components[field]}
                    onChange={(e) => handleComponentChange(field, e.target.value)}
                    className="w-full text-sm text-surface-200 bg-surface-950 border border-surface-700 rounded-lg p-2.5 focus:outline-none focus:border-accent-600/40 transition-colors placeholder:text-surface-600"
                    placeholder={`Enter ${field.toLowerCase()}…`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Immutable Snapshot */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-surface-400" />
          <h3 className="text-sm font-semibold text-surface-200">Immutable Generation Snapshot</h3>
        </div>
        <pre className="text-xs text-surface-400 bg-surface-950 rounded-lg p-3 overflow-x-auto max-h-96 border border-surface-800">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </div>

      {/* Provider Information */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-surface-400" />
          <h3 className="text-sm font-semibold text-surface-200">Provider Information</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <InfoRow label="Provider" value={generation.provider_name} />
          <InfoRow label="Model / Endpoint" value={generation.provider_model ?? '—'} />
          <InfoRow label="Provider Generation ID" value={generation.provider_generation_id ?? '—'} mono />
          <InfoRow label="Provider ID" value={generation.provider_id ?? '—'} mono />
          {generation.provider_cost_amount != null && (
            <InfoRow
              label="Cost"
              value={`${generation.provider_cost_amount} ${generation.provider_cost_units ?? ''}`.trim()}
            />
          )}
        </div>
      </div>

      {/* Status Timeline */}
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-surface-200">Status Timeline</h3>
        {history.length === 0 ? (
          <p className="text-xs text-surface-500">No history entries.</p>
        ) : (
          <div className="space-y-0">
            {history.map((entry, idx) => {
              const FromIcon = entry.from_status ? STATUS_ICON[entry.from_status] : Clock;
              const ToIcon = STATUS_ICON[entry.to_status] ?? Clock;
              return (
                <div key={entry.id} className="flex gap-3">
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center border ${STATUS_STYLES[entry.to_status]}`}>
                      <ToIcon className="w-3 h-3" />
                    </div>
                    {idx < history.length - 1 && (
                      <div className="w-px flex-1 bg-surface-700 min-h-[2rem]" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-surface-200">{entry.to_status}</span>
                      {entry.from_status && (
                        <span className="text-xs text-surface-500">from {entry.from_status}</span>
                      )}
                    </div>
                    {entry.event_description && (
                      <p className="text-xs text-surface-400 mt-0.5">{entry.event_description}</p>
                    )}
                    <p className="text-[10px] text-surface-600 mt-1">{formatDate(entry.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-surface-200">Generation Metadata</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <InfoRow label="Created" value={formatDate(generation.created_at)} />
          <InfoRow label="Started" value={generation.started_at ? formatDate(generation.started_at) : '—'} />
          <InfoRow label="Completed" value={generation.completed_at ? formatDate(generation.completed_at) : '—'} />
          <InfoRow label="Duration" value={formatDuration(generation.started_at, generation.completed_at)} />
          <InfoRow label="Version" value={String(generation.version)} />
          <InfoRow label="Parent Generation" value={generation.parent_generation_id ? generation.parent_generation_id.slice(0, 8) : '—'} mono />
          <InfoRow label="Business Ref" value={generation.business_ref_type ?? '—'} />
          <InfoRow label="Business Ref ID" value={generation.business_ref_id ? generation.business_ref_id.slice(0, 8) : '—'} mono />
        </div>
        {generation.output_metadata && (
          <div className="pt-2">
            <p className="text-xs text-surface-500 mb-1">Output Metadata</p>
            <pre className="text-xs text-surface-400 bg-surface-950 rounded-lg p-3 overflow-x-auto max-h-48 border border-surface-800">
              {JSON.stringify(generation.output_metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-surface-500">{label}</span>
      <span className={`text-sm text-surface-200 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
