import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  MessageSquare, KeyRound, Edit2, Save, X, RefreshCw, Wifi, WifiOff,
  AlertCircle, CheckCircle, ShieldCheck, Power, Thermometer, Hash,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import AdminNav from '../../components/AdminNav';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LlmChatConfig {
  id:                   string;
  provider_name:        string;
  base_url:             string;
  api_key_configured:   boolean;
  default_model:        string;
  temperature:          number;
  max_tokens:           number;
  status:               string;
  reasoning_level:      string | null;
  created_at:           string;
  updated_at:           string;
}

interface FormState {
  provider_name:  string;
  base_url:       string;
  new_api_key:    string;
  default_model:  string;
  temperature:    number;
  max_tokens:     number;
  status:         string;
  reasoning_level: string; // '' = not set
}

const EMPTY_FORM: FormState = {
  provider_name:  'Venice',
  base_url:       'https://api.venice.ai/api/v1',
  new_api_key:    '',
  default_model:  'venice-uncensored-1-2',
  temperature:    0.8,
  max_tokens:     300,
  status:         'Active',
  reasoning_level: '',
};

const REASONING_LEVEL_OPTIONS = [
  { value: '',      label: 'Not set (no reasoning parameter sent)' },
  { value: 'none',  label: 'None — disables reasoning' },
  { value: 'low',   label: 'Low — light reasoning' },
  { value: 'medium', label: 'Medium — balanced reasoning' },
  { value: 'high',  label: 'High — deep reasoning' },
];

// ── Root component ────────────────────────────────────────────────────────────

export default function LLMChatConfigPage() {
  const { creator } = useAuth();

  if (creator && !creator.is_super_admin) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="min-h-screen bg-surface-950">
      <AdminNav />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <LLMChatConfigContent />
      </div>
    </div>
  );
}

// ── Content ───────────────────────────────────────────────────────────────────

function LLMChatConfigContent() {
  const [config, setConfig] = useState<LlmChatConfig | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    | { success: boolean; reply?: string; error?: string; model?: string; endpoint?: string }
    | null
  >(null);

  const edgeFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-llm-chat-config`;
  const testFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-llm-chat-connection`;

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Load config ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(edgeFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ action: 'load' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

      if (data.config) {
        const cfg = data.config as LlmChatConfig;
        setConfig(cfg);
        setForm({
          provider_name:  cfg.provider_name,
          base_url:       cfg.base_url,
          new_api_key:    '',
          default_model:  cfg.default_model,
          temperature:    cfg.temperature,
          max_tokens:     cfg.max_tokens,
          status:         cfg.status,
          reasoning_level: cfg.reasoning_level ?? '',
        });
        setEditing(false);
      } else {
        setConfig(null);
        setForm(EMPTY_FORM);
        setEditing(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [edgeFnUrl]);

  useEffect(() => { load(); }, [load]);

  function handleCancel() {
    if (config) {
      setForm({
        provider_name:  config.provider_name,
        base_url:       config.base_url,
        new_api_key:    '',
        default_model:  config.default_model,
        temperature:   config.temperature,
        max_tokens:     config.max_tokens,
        status:         config.status,
        reasoning_level: config.reasoning_level ?? '',
      });
      setEditing(false);
    } else {
      setForm(EMPTY_FORM);
      setEditing(false);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.provider_name.trim()) {
      showToast('error', 'Provider Name is required.');
      return;
    }
    if (!form.base_url.trim()) {
      showToast('error', 'Base URL is required.');
      return;
    }
    if (!config && !form.new_api_key.trim()) {
      showToast('error', 'API Key is required for initial configuration.');
      return;
    }
    setSaving(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const body: Record<string, unknown> = {
        action: 'save',
        provider_name: form.provider_name.trim(),
        base_url:      form.base_url.trim(),
        default_model: form.default_model.trim(),
        temperature:   form.temperature,
        max_tokens:    form.max_tokens,
        status:        form.status,
        reasoning_level: form.reasoning_level || null,
      };
      if (form.new_api_key.trim()) body.api_key = form.new_api_key.trim();

      const res = await fetch(edgeFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

      showToast('success', 'LLM Chat configuration saved.');
      await load();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── Test Connection ──────────────────────────────────────────────────────
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(testFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

      if (data.success) {
        setTestResult({
          success: true,
          reply: data.reply,
          model: data.model,
          endpoint: data.endpoint,
        });
      } else {
        setTestResult({
          success: false,
          error: data.error ?? 'Unknown error',
          model: data.model,
          endpoint: data.endpoint,
        });
      }
    } catch (e) {
      setTestResult({ success: false, error: (e as Error).message });
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

  const isActive = (config?.status ?? form.status) === 'Active';

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-5 h-5 text-primary-400" />
          <h1 className="text-xl font-semibold text-surface-100">LLM Chat Config</h1>
          {config && (
            <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-mono tracking-wider ${
              isActive
                ? 'bg-accent-500/10 border border-accent-500/20 text-accent-400'
                : 'bg-surface-800 border border-surface-700 text-surface-500'
            }`}>
              {config.status}
            </span>
          )}
        </div>
        <p className="text-sm text-surface-500">
          Configures the LLM chat provider (Venice) for chat generation. Separate from image
          provider settings. Visible to Super Admin only. The API key is stored encrypted
          server-side and never sent to the browser.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Configuration Form ─────────────────────────────────────────── */}
      <div className="card space-y-5">
        <div className="flex items-center gap-2 pb-4 border-b border-surface-800">
          <MessageSquare className="w-4 h-4 text-primary-400" />
          <h2 className="font-semibold text-surface-100 text-sm">
            {config ? 'LLM Chat Settings' : 'New LLM Chat Configuration'}
          </h2>
          {config && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="ml-auto btn-secondary text-xs gap-1.5">
              <Edit2 className="w-3.5 h-3.5" />Edit
            </button>
          )}
          {config && !editing && (
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
              onChange={e => setForm(f => ({ ...f, provider_name: e.target.value }))}
              placeholder="Venice"
              className="input-field" />
          ) : (
            <div className="py-2">
              <span className="text-sm font-semibold text-surface-100">{config?.provider_name ?? '—'}</span>
            </div>
          )}
        </div>

        {/* Base URL */}
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
          <label className="text-sm font-medium text-surface-400 pt-2">Base URL</label>
          {editing ? (
            <input
              type="url"
              value={form.base_url}
              onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
              placeholder="https://api.venice.ai/api/v1"
              className="input-field font-mono text-sm" />
          ) : (
            <div className="py-2">
              <span className="text-sm font-mono text-surface-200 break-all">
                {config?.base_url || '—'}
              </span>
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
                placeholder={config?.api_key_configured ? 'Enter new key to replace existing' : 'Enter API key'}
                autoComplete="new-password"
                className="input-field font-mono text-sm" />
              {config?.api_key_configured && !form.new_api_key && (
                <p className="mt-1.5 text-xs text-surface-500">
                  Leave blank to keep the current key.
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-2">
              {config?.api_key_configured ? (
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

        {/* Default Model */}
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
          <label className="text-sm font-medium text-surface-400 pt-2">Default Model</label>
          {editing ? (
            <input
              type="text"
              value={form.default_model}
              onChange={e => setForm(f => ({ ...f, default_model: e.target.value }))}
              placeholder="venice-uncensored-1-2"
              className="input-field font-mono text-sm" />
          ) : (
            <div className="py-2">
              <span className="text-sm font-mono text-surface-200">{config?.default_model || '—'}</span>
            </div>
          )}
        </div>

        {/* Reasoning Level */}
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
          <label className="text-sm font-medium text-surface-400 pt-2">Reasoning Level</label>
          {editing ? (
            <div className="space-y-1">
              <select
                value={form.reasoning_level}
                onChange={e => setForm(f => ({ ...f, reasoning_level: e.target.value }))}
                className="input-field">
                {REASONING_LEVEL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-surface-600">
                Applies to every outgoing chat request. Low/Medium/High are validated against the
                selected model's supported reasoning options before saving — if the model does not
                support effort levels, only None can be selected.
              </p>
            </div>
          ) : (
            <div className="py-2">
              <span className="text-sm text-surface-200">
                {config?.reasoning_level
                  ? config.reasoning_level.charAt(0).toUpperCase() + config.reasoning_level.slice(1)
                  : '—'}
              </span>
            </div>
          )}
        </div>

        {/* Temperature */}
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
          <label className="text-sm font-medium text-surface-400 pt-2 flex items-center gap-2">
            <Thermometer className="w-3.5 h-3.5 text-primary-400" />
            Temperature
          </label>
          {editing ? (
            <div className="flex items-center gap-3">
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={form.temperature}
                onChange={e => setForm(f => ({ ...f, temperature: parseFloat(e.target.value) || 0 }))}
                className="input-field text-sm w-24" />
              <span className="text-xs text-surface-500">0.0 – 2.0 (default 0.8)</span>
            </div>
          ) : (
            <div className="py-2">
              <span className="text-sm text-surface-200">{config?.temperature ?? '—'}</span>
            </div>
          )}
        </div>

        {/* Max Tokens */}
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
          <label className="text-sm font-medium text-surface-400 pt-2 flex items-center gap-2">
            <Hash className="w-3.5 h-3.5 text-primary-400" />
            Max Tokens
          </label>
          {editing ? (
            <div className="flex items-center gap-3">
              <input
                type="number"
                step="1"
                min="1"
                max="4096"
                value={form.max_tokens}
                onChange={e => setForm(f => ({ ...f, max_tokens: parseInt(e.target.value) || 0 }))}
                className="input-field text-sm w-24" />
              <span className="text-xs text-surface-500">1 – 4096 (default 300)</span>
            </div>
          ) : (
            <div className="py-2">
              <span className="text-sm text-surface-200">{config?.max_tokens ?? '—'}</span>
            </div>
          )}
        </div>

        {/* Status */}
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
          <label className="text-sm font-medium text-surface-400 pt-2 flex items-center gap-2">
            <Power className="w-3.5 h-3.5 text-primary-400" />
            Status
          </label>
          {editing ? (
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="input-field">
              <option value="Active">Active</option>
              <option value="Disabled">Disabled</option>
            </select>
          ) : (
            <div className="py-2">
              <span className={`text-sm font-medium ${
                isActive ? 'text-accent-400' : 'text-surface-500'
              }`}>
                {config?.status ?? '—'}
              </span>
            </div>
          )}
        </div>

        {/* Edit mode actions */}
        {editing && (
          <div className="flex items-center gap-3 pt-2 border-t border-surface-800">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary gap-1.5">
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : config ? 'Save Changes' : 'Create Configuration'}
            </button>
            {config && (
              <button
                onClick={handleCancel}
                disabled={saving}
                className="btn-secondary gap-1.5">
                <X className="w-3.5 h-3.5" />Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {/* No-config state */}
      {!config && !editing && !loading && (
        <div className="card border-surface-700/40 bg-surface-800/30 text-center py-8">
          <MessageSquare className="w-8 h-8 text-surface-600 mx-auto mb-3" />
          <p className="text-sm text-surface-400 mb-1">No LLM chat configuration set up yet.</p>
          <p className="text-xs text-surface-600 mb-4">
            Configure your Venice API key and default model to enable chat generation.
          </p>
          <button onClick={() => setEditing(true)} className="btn-primary gap-1.5">
            <Edit2 className="w-3.5 h-3.5" />Configure Now
          </button>
        </div>
      )}

      {/* ── Test Connection ───────────────────────────────────────────── */}
      {config && !editing && (
        <div className="card">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-surface-800 mb-5">
            <div className="flex items-center gap-2">
              {testResult?.success
                ? <Wifi    className="w-4 h-4 text-accent-400" />
                : testResult
                  ? <WifiOff className="w-4 h-4 text-danger-400" />
                  : <Wifi    className="w-4 h-4 text-surface-500" />}
              <h2 className="font-semibold text-surface-100 text-sm">Connection Test</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="btn-primary gap-2 text-sm">
                {testing
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Testing…</>
                  : <><Wifi className="w-3.5 h-3.5" />Test Connection</>}
              </button>
              <button
                onClick={load}
                disabled={testing}
                className="btn-secondary text-xs gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />Refresh
              </button>
            </div>
          </div>

          {testResult && (
            <div className="space-y-3">
              {testResult.success ? (
                <>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-accent-500/5 border border-accent-500/15 text-sm text-accent-400">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    Connection successful — Venice responded.
                  </div>
                  <div className="bg-surface-950 border border-surface-800 rounded-xl p-4 font-mono text-sm space-y-2">
                    <div className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="text-surface-500">Model</span>
                      <span className="text-surface-300 break-all">{testResult.model ?? '—'}</span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="text-surface-500">Endpoint</span>
                      <span className="text-surface-300 break-all">{testResult.endpoint ?? '—'}</span>
                    </div>
                    <div className="text-surface-600 text-xs select-none">────────────────────</div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">Reply</div>
                      <div className="text-surface-100 whitespace-pre-wrap">{testResult.reply}</div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-500/5 border border-danger-500/15 text-sm text-danger-400">
                    <WifiOff className="w-4 h-4 flex-shrink-0" />
                    Connection failed.
                  </div>
                  <div className="bg-surface-950 border border-danger-500/20 rounded-xl p-4 font-mono text-sm">
                    <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">Error</div>
                    <div className="text-danger-300 whitespace-pre-wrap break-all">{testResult.error}</div>
                  </div>
                </>
              )}
            </div>
          )}

          {!testResult && !testing && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-800/50 border border-surface-700 text-sm text-surface-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Press Test Connection to verify the Venice API key and model.
            </div>
          )}
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
