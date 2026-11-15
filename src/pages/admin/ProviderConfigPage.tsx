import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Server, KeyRound, Edit2, Save, X, RefreshCw, Plus,
  Wifi, WifiOff, AlertCircle, CheckCircle, Clock, Zap, ShieldCheck, Image,
  Route, Upload, Sparkles, Activity, FileDown, Video,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import AdminNav from '../../components/AdminNav';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProviderConfig {
  id:                          string;
  provider_name:               string;
  provider_url:                string;
  api_key_configured:          boolean;
  service_type:                string;
  provider_type:               string;
  auth_method:                 string;
  test_endpoint:               string;
  asset_upload_endpoint:       string;
  generation_endpoint:         string;
  generation_status_endpoint:  string;
  generation_result_endpoint:  string;
  video_generation_endpoint:   string;
  connection_status:           string;
  health_status:               string;
  is_active:                   boolean;
  last_health_check:           string | null;
  created_at:                  string;
  updated_at:                  string;
}

interface DebugInfo {
  request_url:            string | null;
  http_status:            number | null;
  response_body:          string | null;
  response_content_type:  string | null;
  body_preview:           string | null;
  json_parse_result:      string | null;
  error_message:          string | null;
  timed_out:              boolean;
  duration_ms:            number;
}

interface FormState {
  provider_name:               string;
  provider_url:                string;
  auth_method:                 string;
  provider_type:               string;
  new_api_key:                 string;
  is_active:                   boolean;
  test_endpoint:               string;
  asset_upload_endpoint:       string;
  generation_endpoint:         string;
  generation_status_endpoint:  string;
  generation_result_endpoint:  string;
  video_generation_endpoint:   string;
}

const AUTH_METHODS = [
  { value: 'bearer',    label: 'Bearer Token',  hint: 'Authorization: Bearer <key>' },
  { value: 'key',       label: 'Key',            hint: 'Authorization: Key <key>' },
  { value: 'x-api-key', label: 'X-API-Key',      hint: 'x-api-key: <key>' },
  { value: 'none',      label: 'None',           hint: 'No auth header' },
];

const PROVIDER_TYPES = [
  { value: 'image',        label: 'Image',          hint: 'Image generation only' },
  { value: 'video',        label: 'Video',          hint: 'Video generation only' },
  { value: 'image+video',  label: 'Image + Video',  hint: 'Both image and video generation' },
  { value: 'chat',         label: 'Chat',           hint: 'Text / chat completion' },
  { value: 'audio',        label: 'Audio',          hint: 'Audio / speech generation' },
  { value: 'multi-modal',  label: 'Multi-Modal',    hint: 'Multiple modalities' },
];

// Default endpoints for well-known providers (used when creating a new provider).
const PROVIDER_DEFAULTS: Record<string, Partial<FormState>> = {
  ZenCreator: {
    provider_type: 'image+video',
    auth_method: 'bearer',
    test_endpoint: '/api/public/v1/tools',
    asset_upload_endpoint: '/api/public/v1/assets',
    generation_endpoint: '/api/public/v1/generations',
    generation_status_endpoint: '/api/public/v1/generations/{generation_id}',
    generation_result_endpoint: '/api/public/v1/generations/{generation_id}/result',
    video_generation_endpoint: '/api/public/v1/generations',
  },
  'Fal.ai': {
    provider_type: 'image',
    auth_method: 'key',
    test_endpoint: '/',
  },
  Promptchan: {
    provider_type: 'image',
    auth_method: 'x-api-key',
    test_endpoint: '/api/external/create',
    generation_endpoint: '/api/external/create',
  },
  'Hugging Face': {
    provider_type: 'image',
    auth_method: 'bearer',
    generation_endpoint: '/gradio_api/call/v2/edit_image',
    generation_status_endpoint: '/gradio_api/call/edit_image/{generation_id}',
  },
};

const EMPTY_FORM: FormState = {
  provider_name: '',
  provider_url:  '',
  auth_method:    'bearer',
  provider_type:  'image',
  new_api_key:    '',
  is_active:       true,
  test_endpoint:               '',
  asset_upload_endpoint:       '',
  generation_endpoint:         '',
  generation_status_endpoint:  '',
  generation_result_endpoint:  '',
  video_generation_endpoint:   '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status: string) {
  if (status === 'connected') return 'text-accent-400';
  if (status === 'offline')   return 'text-danger-400';
  return 'text-surface-500';
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'connected' ? 'bg-accent-400' :
    status === 'offline'   ? 'bg-danger-400' :
    'bg-surface-600';
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5`} />
  );
}

function formatTimestamp(ts: string | null) {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleString('en-US', {
    month:  'short', day: 'numeric', year: 'numeric',
    hour:   '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function authMethodLabel(value: string) {
  return AUTH_METHODS.find(m => m.value === value)?.label ?? value;
}

function providerTypeLabel(value: string) {
  return PROVIDER_TYPES.find(m => m.value === value)?.label ?? value;
}

// ── Root component ────────────────────────────────────────────────────────────

export default function ProviderConfigPage() {
  const { creator } = useAuth();

  if (creator && !creator.is_super_admin) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="min-h-screen bg-surface-950">
      <AdminNav />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <ProviderConfigContent />
      </div>
    </div>
  );
}

// ── Content ───────────────────────────────────────────────────────────────────

function ProviderConfigContent() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm]             = useState<FormState>(EMPTY_FORM);
  const [creating, setCreating]     = useState(false);
  const [editing, setEditing]      = useState(false);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]        = useState(false);
  const [testing, setTesting]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [debugInfo, setDebugInfo]  = useState<DebugInfo | null>(null);
  const [toast, setToast]         = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const baseUrl    = import.meta.env.VITE_SUPABASE_URL ?? 'https://osatedtxkkymvrodczlg.supabase.co';
  const testFnUrl  = `${baseUrl}/functions/v1/test-provider-connection`;
  const saveFnUrl  = `${baseUrl}/functions/v1/save-provider-config`;

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Load all image providers ──────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('provider_configurations')
        .select('id, provider_name, provider_url, api_key_configured, service_type, provider_type, auth_method, test_endpoint, asset_upload_endpoint, generation_endpoint, generation_status_endpoint, generation_result_endpoint, video_generation_endpoint, connection_status, health_status, is_active, last_health_check, created_at, updated_at')
        .eq('service_type', 'image')
        .order('created_at', { ascending: true });
      if (err) throw new Error(err.message);

      const rows = (data as ProviderConfig[]) ?? [];
      setProviders(rows);

      // Auto-select the active provider, or the first one, or null.
      if (rows.length > 0) {
        const active = rows.find(r => r.is_active);
        const id = active?.id ?? rows[0].id;
        setSelectedId(id);
        const cfg = rows.find(r => r.id === id)!;
        setForm(cfgToForm(cfg));
        setCreating(false);
        setEditing(false);
      } else {
        setSelectedId(null);
        setForm(EMPTY_FORM);
        setCreating(true);
        setEditing(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function cfgToForm(cfg: ProviderConfig): FormState {
    return {
      provider_name:               cfg.provider_name,
      provider_url:                cfg.provider_url,
      auth_method:                 cfg.auth_method,
      provider_type:               cfg.provider_type ?? 'image',
      new_api_key:                 '',
      is_active:                   cfg.is_active,
      test_endpoint:               cfg.test_endpoint               ?? '',
      asset_upload_endpoint:       cfg.asset_upload_endpoint       ?? '',
      generation_endpoint:         cfg.generation_endpoint         ?? '',
      generation_status_endpoint:  cfg.generation_status_endpoint  ?? '',
      generation_result_endpoint:  cfg.generation_result_endpoint  ?? '',
      video_generation_endpoint:   cfg.video_generation_endpoint   ?? '',
    };
  }

  // Selecting a provider from the dropdown loads its saved configuration.
  function handleSelect(id: string) {
    const cfg = providers.find(p => p.id === id);
    if (!cfg) return;
    setSelectedId(id);
    setForm(cfgToForm(cfg));
    setCreating(false);
    setEditing(false);
    setDebugInfo(null);
  }

  function handleNewProvider() {
    setCreating(true);
    setEditing(true);
    setSelectedId(null);
    setForm({ ...EMPTY_FORM, is_active: true });
    setDebugInfo(null);
  }

  // Auto-fill endpoint defaults when the user types a known provider name.
  function handleProviderNameChange(name: string) {
    const defaults = PROVIDER_DEFAULTS[name];
    if (defaults) {
      setForm(f => ({ ...f, provider_name: name, ...defaults } as FormState));
    } else {
      setForm(f => ({ ...f, provider_name: name }));
    }
  }

  function handleCancel() {
    if (creating) {
      setCreating(false);
      // Re-select the active provider or first one.
      if (providers.length > 0) {
        const active = providers.find(r => r.is_active);
        const id = active?.id ?? providers[0].id;
        handleSelect(id);
      } else {
        setSelectedId(null);
        setForm(EMPTY_FORM);
      }
    } else if (selectedId) {
      handleSelect(selectedId);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.provider_name.trim()) {
      showToast('error', 'Provider Name is required.');
      return;
    }
    if (!form.provider_url.trim()) {
      showToast('error', 'Base URL is required.');
      return;
    }
    if (creating && !form.new_api_key.trim()) {
      showToast('error', 'API Key is required for a new provider.');
      return;
    }
    setSaving(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const body: Record<string, unknown> = {
        provider_name: form.provider_name.trim(),
        provider_url:  form.provider_url.trim(),
        auth_method:   form.auth_method,
        provider_type: form.provider_type,
        service_type:  'image',
        is_active:     form.is_active,
        test_endpoint:                form.test_endpoint.trim(),
        asset_upload_endpoint:        form.asset_upload_endpoint.trim(),
        generation_endpoint:          form.generation_endpoint.trim(),
        generation_status_endpoint:   form.generation_status_endpoint.trim(),
        generation_result_endpoint:   form.generation_result_endpoint.trim(),
        video_generation_endpoint:    form.video_generation_endpoint.trim(),
      };
      if (selectedId && !creating) body.config_id = selectedId;
      if (form.new_api_key.trim()) body.api_key = form.new_api_key.trim();

      const res  = await fetch(saveFnUrl, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

      showToast('success', 'Image provider saved.');
      await load();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── Test Connection ───────────────────────────────────────────────────────

  async function handleTest() {
    if (!selectedId || creating) return;
    setTesting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(testFnUrl, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ config_id: selectedId }),
      });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
      if (body.debug) setDebugInfo(body.debug as DebugInfo);

      // Refresh provider rows in-place without resetting the dropdown selection.
      setProviders(prev => prev.map(p =>
        p.id === selectedId
          ? {
              ...p,
              connection_status: body.connection_status ?? p.connection_status,
              last_health_check: body.last_health_check ?? p.last_health_check,
            }
          : p,
      ));

      const connected = body.connection_status === 'connected';
      showToast(
        connected ? 'success' : 'error',
        connected
          ? `${body.provider_name} is reachable — Status: Connected`
          : 'Provider is unreachable — Status: Offline',
      );
    } catch (e) {
      showToast('error', `Test failed: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selected = providers.find(p => p.id === selectedId) ?? null;
  const displayStatus = selected?.connection_status ?? 'unknown';

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Image className="w-5 h-5 text-primary-400" />
            <h1 className="text-xl font-semibold text-surface-100">Image Provider Library</h1>
          </div>
          <p className="text-sm text-surface-500">
            Manages external AI image generation providers. Endpoints are stored per-provider,
            so new providers can be added by configuration alone. Visible to Mother Platform Super Admin only.
          </p>
        </div>
        {providers.length > 0 && !creating && (
          <button
            onClick={handleNewProvider}
            className="btn-secondary text-xs gap-1.5 flex-shrink-0">
            <Plus className="w-3.5 h-3.5" />Add Provider
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Provider Selector (only when 2+ providers) ──────────────────── */}
      {providers.length > 1 && !creating && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
            <Server className="w-4 h-4 text-primary-400" />
            <h2 className="font-semibold text-surface-100 text-sm">Select Image Provider</h2>
          </div>
          <select
            value={selectedId ?? ''}
            onChange={e => handleSelect(e.target.value)}
            className="input-field">
            {providers.map(p => (
              <option key={p.id} value={p.id}>
                {p.provider_name}{p.is_active ? ' (Active)' : ''}
              </option>
            ))}
          </select>
          {selected && (
            <div className="flex items-center gap-3 flex-wrap text-xs text-surface-500">
              {selected.is_active ? (
                <span className="badge-approved">Active</span>
              ) : (
                <span className="badge-pending">Inactive</span>
              )}
              <span>Type: {providerTypeLabel(selected.provider_type)}</span>
              <span>Auth: {authMethodLabel(selected.auth_method)}</span>
              <span>Last tested: {formatTimestamp(selected.last_health_check)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Configuration Form ─────────────────────────────────────────── */}
      {(selected || creating) && (
        <div className="card space-y-5">
          <div className="flex items-center gap-2 pb-4 border-b border-surface-800">
            <Zap className="w-4 h-4 text-primary-400" />
            <h2 className="font-semibold text-surface-100 text-sm">
              {creating ? 'New Image Provider' : 'Provider Settings'}
            </h2>
            {!editing && !creating && (
              <button
                onClick={() => setEditing(true)}
                className="ml-auto btn-secondary text-xs gap-1.5">
                <Edit2 className="w-3.5 h-3.5" />Edit
              </button>
            )}
            {!editing && !creating && (
              <span className="text-[10px] font-mono text-surface-600 uppercase tracking-wider">
                View Only
              </span>
            )}
          </div>

          {/* Provider Name */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
            <label className="text-sm font-medium text-surface-400 pt-2">Provider Name</label>
            {editing ? (
              <input
                type="text"
                value={form.provider_name}
                onChange={e => handleProviderNameChange(e.target.value)}
                placeholder="e.g. ZenCreator, Fal.ai, Promptchan, RunPod"
                className="input-field" />
            ) : (
              <div className="py-2">
                <span className="text-sm font-semibold text-surface-100">{selected?.provider_name ?? '—'}</span>
              </div>
            )}
          </div>

          {/* Provider Type */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
            <label className="text-sm font-medium text-surface-400 pt-2">Provider Type</label>
            {editing ? (
              <div>
                <select
                  value={form.provider_type}
                  onChange={e => setForm(f => ({ ...f, provider_type: e.target.value }))}
                  className="input-field">
                  {PROVIDER_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-surface-500 font-mono">
                  {PROVIDER_TYPES.find(t => t.value === form.provider_type)?.hint}
                </p>
              </div>
            ) : (
              <div className="py-2">
                <span className="text-sm text-surface-100">{providerTypeLabel(selected?.provider_type ?? 'image')}</span>
                <p className="mt-1 text-xs text-surface-500 font-mono">
                  {PROVIDER_TYPES.find(t => t.value === (selected?.provider_type ?? 'image'))?.hint}
                </p>
              </div>
            )}
          </div>

          {/* Base URL */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
            <label className="text-sm font-medium text-surface-400 pt-2">Base URL</label>
            {editing ? (
              <input
                type="url"
                value={form.provider_url}
                onChange={e => setForm(f => ({ ...f, provider_url: e.target.value }))}
                placeholder="https://api.zencreator.pro"
                className="input-field font-mono text-sm" />
            ) : (
              <div className="py-2">
                <span className="text-sm font-mono text-surface-200 break-all">
                  {selected?.provider_url || '—'}
                </span>
              </div>
            )}
          </div>

          {/* Authentication Method */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
            <label className="text-sm font-medium text-surface-400 pt-2">Authentication Method</label>
            {editing ? (
              <div>
                <select
                  value={form.auth_method}
                  onChange={e => setForm(f => ({ ...f, auth_method: e.target.value }))}
                  className="input-field">
                  {AUTH_METHODS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-surface-500 font-mono">
                  {AUTH_METHODS.find(m => m.value === form.auth_method)?.hint}
                </p>
              </div>
            ) : (
              <div className="py-2">
                <span className="text-sm text-surface-100">{authMethodLabel(selected?.auth_method ?? 'bearer')}</span>
                <p className="mt-1 text-xs text-surface-500 font-mono">
                  {AUTH_METHODS.find(m => m.value === (selected?.auth_method ?? 'bearer'))?.hint}
                </p>
              </div>
            )}
          </div>

          {/* API Key — write-only */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
            <label className="text-sm font-medium text-surface-400 pt-2">API Key</label>
            {editing ? (
              <div>
                <input
                  type="password"
                  value={form.new_api_key}
                  onChange={e => setForm(f => ({ ...f, new_api_key: e.target.value }))}
                  placeholder={selected?.api_key_configured || (!creating && selected) ? 'Enter new key to replace existing' : 'Enter API key'}
                  autoComplete="new-password"
                  className="input-field font-mono text-sm" />
                {selected?.api_key_configured && !form.new_api_key && !creating && (
                  <p className="mt-1.5 text-xs text-surface-500">
                    Leave blank to keep the current key.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 py-2">
                {selected?.api_key_configured ? (
                  <span className="flex items-center gap-1.5 text-sm text-accent-400">
                    <ShieldCheck className="w-4 h-4" />
                    Key configured — stored server-side only
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-warning-400">
                    <KeyRound className="w-4 h-4" />
                    Not configured
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Endpoint Configuration ──────────────────────────────────── */}
          {editing && (
            <div className="pt-2 border-t border-surface-800">
              <div className="flex items-center gap-2 mb-4 mt-2">
                <Route className="w-4 h-4 text-primary-400" />
                <h3 className="text-sm font-semibold text-surface-200">Endpoint Configuration</h3>
                <span className="text-[10px] font-mono text-surface-600 uppercase tracking-wider ml-auto">
                  Appended to Base URL
                </span>
              </div>
              <p className="text-xs text-surface-500 mb-4">
                Store API paths per provider. Use <code className="text-surface-300 bg-surface-800 px-1 rounded">{'{generation_id}'}</code> as a placeholder
                where a runtime ID is needed. New providers can be added by configuration alone — no code changes required.
              </p>

              <div className="space-y-4">
                <EndpointField icon={<Activity className="w-3.5 h-3.5" />} label="Test Endpoint"
                  value={form.test_endpoint}
                  onChange={v => setForm(f => ({ ...f, test_endpoint: v }))}
                  placeholder="/api/public/v1/tools" />

                <EndpointField icon={<Upload className="w-3.5 h-3.5" />} label="Asset Upload Endpoint"
                  value={form.asset_upload_endpoint}
                  onChange={v => setForm(f => ({ ...f, asset_upload_endpoint: v }))}
                  placeholder="/api/public/v1/assets" />

                <EndpointField icon={<Sparkles className="w-3.5 h-3.5" />} label="Generation Endpoint"
                  value={form.generation_endpoint}
                  onChange={v => setForm(f => ({ ...f, generation_endpoint: v }))}
                  placeholder="/api/public/v1/generations" />

                <EndpointField icon={<Clock className="w-3.5 h-3.5" />} label="Generation Status Endpoint"
                  value={form.generation_status_endpoint}
                  onChange={v => setForm(f => ({ ...f, generation_status_endpoint: v }))}
                  placeholder="/api/public/v1/generations/{generation_id}" />

                <EndpointField icon={<FileDown className="w-3.5 h-3.5" />} label="Generation Result Endpoint"
                  value={form.generation_result_endpoint}
                  onChange={v => setForm(f => ({ ...f, generation_result_endpoint: v }))}
                  placeholder="/api/public/v1/generations/{generation_id}/result" />

                <EndpointField icon={<Video className="w-3.5 h-3.5" />} label="Video Generation Endpoint"
                  value={form.video_generation_endpoint}
                  onChange={v => setForm(f => ({ ...f, video_generation_endpoint: v }))}
                  placeholder="/api/v1/model/generateVideo" />
              </div>
            </div>
          )}

          {/* Set as active checkbox (edit/create mode) */}
          {editing && (
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
              <label className="text-sm font-medium text-surface-400 pt-2">Active Provider</label>
              <label className="flex items-center gap-2 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-surface-300">
                  Set as the active image provider {selected?.is_active && !creating ? '(currently active)' : ''}
                </span>
              </label>
            </div>
          )}

          {/* Edit mode actions */}
          {editing && (
            <div className="flex items-center gap-3 pt-2 border-t border-surface-800">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary gap-1.5">
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : creating ? 'Create Provider' : 'Save Changes'}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="btn-secondary gap-1.5">
                <X className="w-3.5 h-3.5" />Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Connection Status Card ────────────────────────────────────── */}
      {selected && !editing && !creating && (
        <div className="card">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-surface-800 mb-5">
            <div className="flex items-center gap-2">
              {displayStatus === 'connected'
                ? <Wifi    className="w-4 h-4 text-accent-400" />
                : <WifiOff className="w-4 h-4 text-danger-400" />}
              <h2 className="font-semibold text-surface-100 text-sm">Connection Status</h2>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-surface-500">
              <Clock className="w-3 h-3" />
              <span>Last tested: {formatTimestamp(selected.last_health_check)}</span>
            </div>
          </div>

          {/* Terminal-style status block */}
          <div className="bg-surface-950 border border-surface-800 rounded-xl p-5 font-mono text-sm space-y-1 mb-5">
            <div className="text-surface-600 text-xs mb-3 select-none">────────────────────</div>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <span className="text-surface-500">Provider</span>
              <span className={`font-semibold ${displayStatus === 'connected' ? 'text-surface-100' : 'text-surface-500'}`}>
                {selected.provider_name}
              </span>
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <span className="text-surface-500">Status</span>
              <span className={`font-semibold ${statusColor(displayStatus)}`}>
                <StatusDot status={displayStatus} />
                {displayStatus === 'connected' ? 'Connected' : displayStatus === 'offline' ? 'Offline' : 'Unknown'}
              </span>
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <span className="text-surface-500">Type</span>
              <span className="text-surface-300 font-semibold">{providerTypeLabel(selected.provider_type)}</span>
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <span className="text-surface-500">Auth</span>
              <span className="text-surface-300 font-semibold">{authMethodLabel(selected.auth_method)}</span>
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <span className="text-surface-500">Test EP</span>
              <span className="text-surface-300 font-semibold break-all">{selected.test_endpoint || '—'}</span>
            </div>
            <div className="text-surface-600 text-xs mt-3 select-none">────────────────────</div>
          </div>

          {/* Status summary */}
          {displayStatus === 'connected' ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-accent-500/5 border border-accent-500/15 text-sm text-accent-400 mb-5">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Provider is reachable. Image generation will use this provider.
            </div>
          ) : displayStatus === 'offline' ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-500/5 border border-danger-500/15 text-sm text-danger-400 mb-5">
              <WifiOff className="w-4 h-4 flex-shrink-0" />
              Provider is offline. Image generation cannot proceed until this is resolved.
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-800/50 border border-surface-700 text-sm text-surface-400 mb-5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Connection has not been tested yet. Press Test Connection to check the provider.
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleTest}
              disabled={testing}
              className="btn-primary gap-2">
              {testing
                ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Testing…</>
                : <><Wifi className="w-3.5 h-3.5" />Test Connection</>}
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className="btn-secondary gap-2">
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              Refresh Status
            </button>
          </div>
        </div>
      )}

      {/* ── Debug Response ───────────────────────────────────────────── */}
      {debugInfo && <DebugResponseCard info={debugInfo} />}

      {/* No-providers state */}
      {providers.length === 0 && !creating && !loading && (
        <div className="card border-surface-700/40 bg-surface-800/30 text-center py-8">
          <Image className="w-8 h-8 text-surface-600 mx-auto mb-3" />
          <p className="text-sm text-surface-400 mb-1">No image providers configured yet.</p>
          <p className="text-xs text-surface-600 mb-4">
            Add your first image generation provider to get started.
          </p>
          <button onClick={handleNewProvider} className="btn-primary gap-1.5">
            <Plus className="w-3.5 h-3.5" />Add First Provider
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={[
          'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium',
          'border animate-slide-up max-w-sm',
          toast.type === 'success'
            ? 'bg-accent-500/10 border-accent-500/30 text-accent-300'
            : 'bg-danger-500/10 border-danger-500/30 text-danger-300',
        ].join(' ')}>
          {toast.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── EndpointField ──────────────────────────────────────────────────────────────

function EndpointField({
  icon, label, value, onChange, placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
      <label className="text-sm font-medium text-surface-400 pt-2 flex items-center gap-2">
        <span className="text-primary-400">{icon}</span>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-field font-mono text-sm" />
    </div>
  );
}

// ── DebugResponseCard ─────────────────────────────────────────────────────────

function DebugResponseCard({ info }: { info: DebugInfo }) {
  const reachable = info.http_status !== null;

  return (
    <div className="card">
      <div className="flex items-center gap-2 pb-4 border-b border-surface-800 mb-4">
        <AlertCircle className={`w-4 h-4 ${reachable ? 'text-accent-400' : 'text-warning-400'}`} />
        <h2 className="font-semibold text-surface-100 text-sm">Debug Response</h2>
        <span className="ml-auto text-[10px] font-mono text-surface-600 uppercase tracking-wider">
          {info.duration_ms}ms
        </span>
      </div>

      <div className="space-y-3 font-mono text-xs">

        {/* Request URL */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">Request URL</div>
          <div className="bg-surface-950 border border-surface-800 rounded-lg px-3 py-2 text-surface-300 break-all">
            {info.request_url ?? <span className="text-surface-600 italic">—</span>}
          </div>
        </div>

        {/* HTTP Status + Timed Out */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">HTTP Status</div>
            <div className={`bg-surface-950 border rounded-lg px-3 py-2 font-bold ${
              !reachable
                ? 'border-surface-800 text-surface-600'
                : 'border-accent-500/30 text-accent-400'
            }`}>
              {info.http_status !== null ? info.http_status : 'N/A (network error)'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">Timed Out</div>
            <div className={`bg-surface-950 border rounded-lg px-3 py-2 font-bold ${
              info.timed_out
                ? 'border-warning-500/30 text-warning-400'
                : 'border-surface-800 text-surface-500'
            }`}>
              {info.timed_out ? 'YES — exceeded 15s' : 'No'}
            </div>
          </div>
        </div>

        {/* Content-Type + JSON Parse Result */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">Content-Type (response)</div>
            <div className={`bg-surface-950 border rounded-lg px-3 py-2 break-all ${
              info.response_content_type
                ? 'border-surface-700 text-surface-300'
                : 'border-surface-800 text-surface-600 italic'
            }`}>
              {info.response_content_type ?? '(not sent by server)'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">JSON.Parse Result</div>
            <div className={`bg-surface-950 border rounded-lg px-3 py-2 break-all ${
              info.json_parse_result === 'success'
                ? 'border-accent-500/30 text-accent-400'
                : info.json_parse_result && info.json_parse_result.startsWith('failed')
                  ? 'border-danger-500/30 text-danger-400'
                  : 'border-surface-800 text-surface-500'
            }`}>
              {info.json_parse_result ?? '—'}
            </div>
          </div>
        </div>

        {/* Body Preview (first 100 chars) */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">Body Preview (first 100 chars)</div>
          <div className={`bg-surface-950 border border-surface-800 rounded-lg px-3 py-2 break-all whitespace-pre-wrap ${
            info.body_preview ? 'text-surface-300' : 'text-surface-600 italic'
          }`}>
            {info.body_preview ?? '(empty body)'}
          </div>
        </div>

        {/* Error Message */}
        {info.error_message && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">Error Message</div>
            <div className="bg-danger-500/5 border border-danger-500/20 rounded-lg px-3 py-2 text-danger-300 break-all whitespace-pre-wrap">
              {info.error_message}
            </div>
          </div>
        )}

        {/* Response Body */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">
            Response Body
            {info.response_body && info.response_body.length >= 500 && (
              <span className="ml-2 text-surface-600 normal-case">(truncated to 500 chars)</span>
            )}
          </div>
          <div className={`bg-surface-950 border border-surface-800 rounded-lg px-3 py-2 whitespace-pre-wrap break-all leading-relaxed min-h-[60px] ${
            info.response_body ? 'text-surface-300' : 'text-surface-600 italic'
          }`}>
            {info.response_body ?? '(no response body)'}
          </div>
        </div>

      </div>
    </div>
  );
}
