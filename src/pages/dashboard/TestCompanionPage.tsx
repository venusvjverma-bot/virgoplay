import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, FlaskConical, AlertCircle, Loader2, RefreshCw,
  ChevronDown, ChevronUp, ArrowRight, ImageIcon, Eye, EyeOff,
  Film, CheckCircle2, Circle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { TestSession, TestMessage, DialogueChoice, EngineState } from '../../types';

interface ChatResponse {
  messages:       TestMessage[];
  transition:     { from: string; to: string } | null;
  modifiers:      Record<string, string> | null;
  engineState:    EngineState | null;
  providerStatus: ProviderStatus | null;
}

interface ProviderStatus {
  provider: string;
  status:   string;
  health:   string;
  mode:     string;
}

const IMG_PACKAGE_SEQS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function seqToPackageCode(seq: number): string {
  return `MT-IMG-${String(seq).padStart(3, '0')}`;
}

// ── Image package view state ──────────────────────────────────────────────────
// readyPackages  — codes that have a generated image in storage
// loadedUrls     — URLs fetched on demand (only populated after first View Photo)
// expandedPkgs   — codes currently showing their image (session-scoped, resets per session)
// fetchingPkg    — codes currently having their URL fetched from DB
//
// Architecture note: handleViewPhoto is the single integration point for future
// monetization gates (credits, subscriptions, unlocks). Add guards there.

export default function TestCompanionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate      = useNavigate();
  const { user }      = useAuth();

  const [session,    setSession]    = useState<TestSession | null>(null);
  const [messages,   setMessages]   = useState<TestMessage[]>([]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(true);
  const [sending,    setSending]    = useState(false);
  const [error,      setError]      = useState('');
  const [transition, setTransition] = useState<{ from: string; to: string } | null>(null);
  const [modifiers,  setModifiers]  = useState<Record<string, string> | null>(null);
  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [debugOpen,    setDebugOpen]    = useState(false);
  const [storyPanelOpen, setStoryPanelOpen] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);

  // Image package state — all session-scoped (resets to empty on new session load)
  const [readyPackages, setReadyPackages] = useState<Set<string>>(new Set());
  const [loadedUrls,    setLoadedUrls]    = useState<Record<string, string>>({});
  const [expandedPkgs,  setExpandedPkgs]  = useState<Set<string>>(new Set());
  const [fetchingPkg,   setFetchingPkg]   = useState<Record<string, boolean>>({});
  const [imgGenerating, setImgGenerating] = useState<Record<string, boolean>>({});
  const [imgErrors,     setImgErrors]     = useState<Record<string, string>>({});

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const greetedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const isFetchMode = session?.blueprint.RS001 === 'Massage Therapist';

  const sendMessage = useCallback(async (text: string | null, choiceId?: string) => {
    if (!sessionId) return;
    setSending(true);
    setError('');

    if (text) {
      const optimistic: TestMessage = {
        id:         `opt-${Date.now()}`,
        session_id: sessionId,
        role:       'user',
        content:    text,
        choices:    null,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, optimistic]);
      setInput('');
    }

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('companion-chat', {
        body: { sessionId, message: text, choiceId: choiceId ?? null },
      });

      if (fnErr) throw new Error(fnErr.message);
      if (data.error) throw new Error(data.error);

      const payload = data as ChatResponse;
      const newMsgs = payload.messages ?? [];

      setMessages(prev => {
        const withoutOptimistic = prev.filter(m => !m.id.startsWith('opt-'));
        const ids   = new Set(withoutOptimistic.map(m => m.id));
        const fresh = newMsgs.filter(m => !ids.has(m.id));
        return [...withoutOptimistic, ...fresh];
      });

      if (payload.transition)     setTransition(payload.transition);
      if (payload.modifiers)      setModifiers(payload.modifiers);
      if (payload.engineState)    setEngineState(payload.engineState);
      if (payload.providerStatus) setProviderStatus(payload.providerStatus);

    } catch (err) {
      setMessages(prev => prev.filter(m => !m.id.startsWith('opt-')));
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !user) return;

    async function load() {
      setLoading(true);
      // Reset all session-scoped image state
      setReadyPackages(new Set());
      setLoadedUrls({});
      setExpandedPkgs(new Set());
      setFetchingPkg({});
      setImgGenerating({});
      setImgErrors({});

      const { data: sess, error: sessErr } = await supabase
        .from('companion_test_sessions')
        .select('*')
        .eq('id', sessionId!)
        .single();

      if (sessErr || !sess) {
        setError('Session not found.');
        setLoading(false);
        return;
      }

      const typedSess = sess as TestSession;
      setSession(typedSess);
      if (typedSess.engine_state) setEngineState(typedSess.engine_state);

      const { data: msgs } = await supabase
        .from('companion_test_messages')
        .select('*')
        .eq('session_id', sessionId!)
        .order('created_at', { ascending: true });

      setMessages((msgs ?? []) as TestMessage[]);

      // Load image availability from the Master Content Image Library (role_image_library).
      // Images here are creator-specific and updated live from My Portal → Image.
      if (typedSess.blueprint.RS001 === 'Massage Therapist') {
        const packageCodes = IMG_PACKAGE_SEQS.map(seqToPackageCode);
        const { data: pkgs } = await supabase
          .from('role_image_library')
          .select('image_code')
          .eq('creator_id', typedSess.creator_id)
          .eq('generation_status', 'generated')
          .in('image_code', packageCodes);

        if (pkgs) {
          const readyCodes = new Set(pkgs.map(p => p.image_code as string));
          setReadyPackages(readyCodes);

          // Restore previously expanded photos from sessionStorage.
          // Only restores packages that are still ready — never triggers generation.
          const toRestore = packageCodes.filter(
            code => readyCodes.has(code)
              && sessionStorage.getItem(`photo-visible-${sessionId!}-${code}`) === 'true',
          );

          if (toRestore.length > 0) {
            setExpandedPkgs(new Set(toRestore));
            // Fetch URLs for all restored packages in one query
            const { data: urlData } = await supabase
              .from('role_image_library')
              .select('image_code, image_url')
              .eq('creator_id', typedSess.creator_id)
              .eq('generation_status', 'generated')
              .in('image_code', toRestore);
            if (urlData) {
              const urlMap: Record<string, string> = {};
              for (const p of urlData) {
                if (p.image_url) urlMap[p.image_code as string] = p.image_url as string;
              }
              setLoadedUrls(urlMap);
            }
          }
        }
      }

      setLoading(false);

      const existing = (msgs ?? []) as TestMessage[];
      if (existing.length === 0 && !greetedRef.current) {
        greetedRef.current = true;
        await sendMessage(null);
      }
    }

    load();
  }, [sessionId, user, sendMessage]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || transition) return;
    sendMessage(text);
  }

  function handleChoice(choice: DialogueChoice) {
    if (sending || transition) return;
    sendMessage(choice.label, choice.id);
  }

  // ── View Photo / Hide Photo ───────────────────────────────────────────────────
  // This is the integration point for future monetization:
  // subscription checks, credit deductions, unlock flows, etc.
  async function handleViewPhoto(packageCode: string) {
    if (expandedPkgs.has(packageCode)) {
      setExpandedPkgs(prev => {
        const next = new Set(prev);
        next.delete(packageCode);
        return next;
      });
      sessionStorage.setItem(`photo-visible-${sessionId}-${packageCode}`, 'false');
      return;
    }

    // Expand immediately — show loading state while URL is fetched
    setExpandedPkgs(prev => new Set([...prev, packageCode]));
    sessionStorage.setItem(`photo-visible-${sessionId}-${packageCode}`, 'true');

    // URL is already cached from a prior View Photo click this session
    if (loadedUrls[packageCode]) return;

    setFetchingPkg(prev => ({ ...prev, [packageCode]: true }));
    try {
      const { data } = await supabase
        .from('role_image_library')
        .select('image_url')
        .eq('image_code', packageCode)
        .eq('creator_id', session!.creator_id)
        .eq('generation_status', 'generated')
        .maybeSingle();

      if (data?.image_url) {
        setLoadedUrls(prev => ({ ...prev, [packageCode]: data.image_url }));
      }
    } finally {
      setFetchingPkg(prev => ({ ...prev, [packageCode]: false }));
    }
  }

  // ── Generate Image ────────────────────────────────────────────────────────────
  async function generatePackage(packageCode: string) {
    setImgGenerating(prev => ({ ...prev, [packageCode]: true }));
    setImgErrors(prev => ({ ...prev, [packageCode]: '' }));
    try {
      setImgErrors(prev => ({ ...prev, [packageCode]: 'This generation tool has been retired.' }));
      return;
    } catch (e) {
      setImgErrors(prev => ({
        ...prev,
        [packageCode]: e instanceof Error ? e.message : 'Generation failed.',
      }));
    } finally {
      setImgGenerating(prev => ({ ...prev, [packageCode]: false }));
    }
  }

  // ── Batch generation — generates all missing packages sequentially ───────────
  // Skips packages that are already ready. Calls fal.ai once per missing package.
  async function generateAllPackages() {
    setBatchGenerating(true);
    for (const seq of IMG_PACKAGE_SEQS) {
      const code = seqToPackageCode(seq);
      if (!readyPackages.has(code)) {
        await generatePackage(code);
      }
    }
    setBatchGenerating(false);
  }

  const lastMsg = messages[messages.length - 1];
  const lastCompanionWithChoices = [...messages]
    .reverse()
    .find(m => m.role === 'companion' && m.choices && m.choices.length > 0);

  const activeChoices: DialogueChoice[] | null =
    lastMsg?.role === 'companion' && lastCompanionWithChoices?.id === lastMsg.id
      ? lastCompanionWithChoices.choices
      : null;

  const isTerminal    = transition !== null || engineState?.is_terminal;
  const inputDisabled = sending || !!transition || (isFetchMode && !!activeChoices?.length);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-900">
        <div className="flex flex-col items-center gap-3 text-surface-400">
          <Loader2 className="w-7 h-7 animate-spin" />
          <span className="text-sm">Loading session…</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-900 p-6">
        <div className="card max-w-sm w-full text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-danger-400 mx-auto" />
          <p className="text-surface-300 text-sm">
            {error || 'Session not found or could not be loaded.'}
          </p>
          <button onClick={() => navigate('/dashboard')} className="btn-secondary w-full">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const blueprint = session.blueprint;

  return (
    <div className="h-screen flex flex-col bg-surface-900 overflow-hidden">

      {/* Test mode banner */}
      <div className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-1.5 bg-warning-500/10 border-b border-warning-500/20">
        <FlaskConical className="w-3.5 h-3.5 text-warning-400" />
        <span className="text-xs text-warning-400 font-medium tracking-wide">
          TEST MODE — Engine testing only. Not visible to clients.
        </span>
      </div>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-surface-800 bg-surface-900">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-surface-400 hover:text-surface-200 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-surface-200 truncate">{blueprint.AID001}</span>
            <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full bg-surface-700 text-surface-400 font-medium">
              {blueprint.AID002} · {blueprint.AID003}
            </span>
            {isFetchMode && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-500/15 text-accent-400 font-medium border border-accent-500/20">
                Fetch Engine
              </span>
            )}
          </div>
          <p className="text-xs text-surface-500 mt-0.5">
            {blueprint.PS001} · {blueprint.PS003}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isFetchMode && (
            <>
              <button
                onClick={() => setStoryPanelOpen(v => !v)}
                className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-300 transition-colors px-2 py-1 rounded border border-surface-700 hover:border-surface-600"
              >
                <Film className="w-3 h-3" />
                Story
                {storyPanelOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <button
                onClick={() => setDebugOpen(v => !v)}
                className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-300 transition-colors px-2 py-1 rounded border border-surface-700 hover:border-surface-600"
              >
                Engine
                {debugOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </>
          )}
          <div className="w-2 h-2 rounded-full bg-accent-500" title="Session active" />
        </div>
      </div>

      {/* Visual Story Package panel */}
      {isFetchMode && storyPanelOpen && (
        <div className="flex-shrink-0 bg-surface-950 border-b border-surface-800 px-4 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Film className="w-3.5 h-3.5 text-surface-500" />
              <span className="text-xs font-medium text-surface-400 tracking-wide">
                Visual Story — MT-BEG-001
              </span>
              <span className="text-[10px] font-mono text-surface-600">
                {readyPackages.size}/{IMG_PACKAGE_SEQS.length} ready
              </span>
            </div>
            <button
              onClick={generateAllPackages}
              disabled={batchGenerating || readyPackages.size === IMG_PACKAGE_SEQS.length}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-surface-700 bg-surface-800 hover:bg-surface-700 hover:border-surface-600 text-surface-400 hover:text-surface-300 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {batchGenerating ? (
                <><Loader2 className="w-3 h-3 animate-spin" />Generating…</>
              ) : readyPackages.size === IMG_PACKAGE_SEQS.length ? (
                <><CheckCircle2 className="w-3 h-3 text-success-400" />All Ready</>
              ) : (
                <><Film className="w-3 h-3" />Generate All</>
              )}
            </button>
          </div>

          {/* Package status grid */}
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
            {IMG_PACKAGE_SEQS.map(seq => {
              const code       = seqToPackageCode(seq);
              const isReady    = readyPackages.has(code);
              const isRunning  = !!imgGenerating[code];
              return (
                <div
                  key={code}
                  title={code}
                  className={[
                    'flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-lg border text-[10px] font-mono transition-colors',
                    isReady
                      ? 'border-success-500/30 bg-success-500/8 text-success-400'
                      : isRunning
                        ? 'border-accent-500/40 bg-accent-500/8 text-accent-400'
                        : 'border-surface-700 bg-surface-800/50 text-surface-600',
                  ].join(' ')}
                >
                  {isRunning ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isReady ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <Circle className="w-3 h-3" />
                  )}
                  <span>{String(seq).padStart(2, '0')}</span>
                </div>
              );
            })}
          </div>

          {/* Per-package errors */}
          {IMG_PACKAGE_SEQS.map(seq => {
            const code = seqToPackageCode(seq);
            const err  = imgErrors[code];
            return err ? (
              <p key={code} className="mt-1.5 text-[10px] text-danger-400">
                <span className="font-mono">{code}:</span> {err.length > 60 ? err.slice(0, 60) + '…' : err}
              </p>
            ) : null;
          })}
        </div>
      )}

      {/* Engine state debug panel */}
      {isFetchMode && debugOpen && (
        <div className="flex-shrink-0 bg-surface-950 border-b border-surface-800 px-4 py-3 text-xs font-mono">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 text-surface-400">
            <div>
              <span className="text-surface-600">Package</span>
              <p className="text-surface-300 mt-0.5">{engineState?.package_code ?? '—'}</p>
            </div>
            <div>
              <span className="text-surface-600">Seq / Path</span>
              <p className="text-surface-300 mt-0.5">
                {engineState ? `${engineState.seq} / ${engineState.path}` : '—'}
              </p>
            </div>
            <div>
              <span className="text-surface-600">FL Modifier</span>
              <p className="text-surface-300 mt-0.5">{modifiers?.fl_modifier ?? '—'} (identified)</p>
            </div>
            <div>
              <span className="text-surface-600">AL Modifier</span>
              <p className="text-surface-300 mt-0.5">{modifiers?.al_modifier ?? '—'} (active)</p>
            </div>
            <div>
              <span className="text-surface-600">RS001 (Role)</span>
              <p className="text-surface-300 mt-0.5">{blueprint.RS001}</p>
            </div>
            <div>
              <span className="text-surface-600">RS002 (Attach)</span>
              <p className="text-surface-300 mt-0.5">{blueprint.RS002}</p>
            </div>
            <div>
              <span className="text-surface-600">RS003 (Affection)</span>
              <p className="text-surface-300 mt-0.5">{blueprint.RS003}</p>
            </div>
            <div>
              <span className="text-surface-600">AF Modifier</span>
              <p className="text-surface-300 mt-0.5">{modifiers?.af_modifier ?? '—'} (active)</p>
            </div>
            <div>
              <span className="text-surface-600">PS Modifier</span>
              <p className="text-surface-300 mt-0.5">{modifiers?.ps_core ?? blueprint.PS001} (identified)</p>
            </div>
            <div>
              <span className="text-surface-600">COM Modifier</span>
              <p className="text-surface-300 mt-0.5">{modifiers?.com_pace ?? blueprint.COM001} (identified)</p>
            </div>
          </div>

          {/* Provider Status — populated after first Fetch Engine call */}
          <div className="mt-3 pt-2.5 border-t border-surface-800 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5">
            <div>
              <span className="text-surface-600">Provider</span>
              <p className="text-surface-300 mt-0.5">{providerStatus?.provider ?? '—'}</p>
            </div>
            <div>
              <span className="text-surface-600">Status</span>
              <p className={`mt-0.5 font-semibold ${
                providerStatus?.status === 'Connected' ? 'text-accent-400' :
                providerStatus?.status === 'Reachable' ? 'text-warning-400' :
                providerStatus?.status === 'Offline'   ? 'text-danger-400' :
                'text-surface-500'
              }`}>
                {providerStatus?.status ?? '—'}
              </p>
            </div>
            <div>
              <span className="text-surface-600">Health</span>
              <p className={`mt-0.5 font-semibold ${
                providerStatus?.health === 'Ready'             ? 'text-accent-400' :
                providerStatus?.health === 'Service Not Ready' ? 'text-warning-400' :
                providerStatus?.health === 'Unreachable'       ? 'text-danger-400' :
                'text-surface-500'
              }`}>
                {providerStatus?.health ?? '—'}
              </p>
            </div>
            <div>
              <span className="text-surface-600">Mode</span>
              <p className="text-surface-300 mt-0.5">{providerStatus?.mode ?? '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {messages.length === 0 && !sending && (
          <div className="flex items-center justify-center h-full">
            <p className="text-surface-500 text-sm">Starting conversation…</p>
          </div>
        )}

        {messages.map(msg => {
          // ── Legacy image-type message rows (backward compat, never auto-shown) ──
          if (msg.message_type === 'image') return null;

          // ── Standard text message bubble ──────────────────────────────────────
          const isCompanion   = msg.role === 'companion';
          const hasImgPackage = isCompanion
            && isFetchMode
            && typeof msg.trigger_seq === 'number'
            && IMG_PACKAGE_SEQS.includes(msg.trigger_seq);

          const packageCode = hasImgPackage ? seqToPackageCode(msg.trigger_seq!) : null;
          const isReady     = packageCode ? readyPackages.has(packageCode) : false;
          const isExpanded  = packageCode ? expandedPkgs.has(packageCode) : false;
          const isFetching  = packageCode ? !!fetchingPkg[packageCode] : false;
          const imageUrl    = packageCode ? loadedUrls[packageCode] : null;
          const isGenerating = packageCode ? !!imgGenerating[packageCode] : false;
          const genError     = packageCode ? imgErrors[packageCode] : '';

          return (
            <div
              key={msg.id}
              className={['flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start'].join(' ')}
            >
              {/* Message bubble */}
              <div
                className={[
                  'max-w-[78%] sm:max-w-[65%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white rounded-br-md'
                    : 'bg-surface-800 text-surface-200 border border-surface-700 rounded-bl-md',
                  msg.id.startsWith('opt-') ? 'opacity-60' : '',
                ].join(' ')}
              >
                {msg.content}
              </div>

              {/* Image package controls — only for companion messages with a linked package */}
              {hasImgPackage && packageCode && (
                <div className="max-w-[78%] sm:max-w-[65%] mt-1.5 space-y-1.5">
                  {isReady ? (
                    <>
                      {/* View Photo / Hide Photo button */}
                      <button
                        onClick={() => handleViewPhoto(packageCode)}
                        disabled={isFetching}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-surface-700 bg-surface-800/60 hover:bg-surface-700/60 hover:border-surface-600 text-surface-400 hover:text-surface-300 text-xs transition-colors disabled:opacity-50"
                      >
                        {isFetching ? (
                          <><Loader2 className="w-3 h-3 animate-spin" />Loading…</>
                        ) : isExpanded ? (
                          <><EyeOff className="w-3 h-3" />Hide Photo</>
                        ) : (
                          <><Eye className="w-3 h-3" />View Photo 30 🌟</>
                        )}
                      </button>

                      {/* Expanded image */}
                      {isExpanded && !isFetching && imageUrl && (
                        <div className="rounded-2xl overflow-hidden border border-surface-700 bg-surface-800/50">
                          <img
                            src={imageUrl}
                            alt={`${packageCode} scene`}
                            className="w-full object-cover block"
                            style={{ maxHeight: '320px' }}
                            onError={e => {
                              (e.currentTarget as HTMLImageElement).closest('div')!.style.display = 'none';
                            }}
                          />
                          <div className="px-3 py-1.5 border-t border-surface-700/50 flex items-center justify-between">
                            <span className="text-[10px] font-mono text-surface-600 tracking-wide">{packageCode}</span>
                            <button
                              onClick={() => generatePackage(packageCode)}
                              disabled={isGenerating}
                              className="flex items-center gap-1 text-[10px] text-surface-600 hover:text-surface-400 transition-colors disabled:opacity-50"
                              title="Regenerate image"
                            >
                              {isGenerating
                                ? <><Loader2 className="w-2.5 h-2.5 animate-spin" />Regenerating…</>
                                : <><RefreshCw className="w-2.5 h-2.5" />Regenerate</>}
                            </button>
                          </div>
                        </div>
                      )}

                      {genError && (
                        <p className="text-danger-400 text-xs max-w-xs" title={genError}>
                          {genError.length > 80 ? genError.slice(0, 80) + '…' : genError}
                        </p>
                      )}
                    </>
                  ) : (
                    /* No image yet — Generate Image button */
                    <>
                      <button
                        onClick={() => generatePackage(packageCode)}
                        disabled={isGenerating}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-surface-700 bg-surface-800/60 hover:bg-surface-700/60 hover:border-surface-600 text-surface-400 hover:text-surface-300 text-xs transition-colors disabled:opacity-50"
                      >
                        {isGenerating
                          ? <><Loader2 className="w-3 h-3 animate-spin" />Generating {packageCode}…</>
                          : <><ImageIcon className="w-3 h-3" />Generate Image ({packageCode})</>}
                      </button>
                      {genError && (
                        <p className="text-danger-400 text-xs max-w-xs" title={genError}>
                          {genError.length > 80 ? genError.slice(0, 80) + '…' : genError}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-surface-800 border border-surface-700 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-surface-500 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-surface-500 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-surface-500 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex-shrink-0 flex items-center gap-2.5 px-4 py-2 bg-danger-500/10 border-t border-danger-500/20 text-danger-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-danger-400 hover:text-danger-300">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stage transition banner */}
      {transition && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-accent-500/10 border-t border-accent-500/25">
          <FlaskConical className="w-4 h-4 text-accent-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-accent-400 tracking-wide">STAGE TRANSITION</p>
            <div className="flex items-center gap-2 mt-0.5 text-sm text-surface-300">
              <span className="font-mono text-accent-300">{transition.from}</span>
              <ArrowRight className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
              <span className="font-mono text-accent-300">{transition.to}</span>
            </div>
          </div>
          <span className="text-xs text-surface-500">MT-BEG-001 complete</span>
        </div>
      )}

      {/* Choice buttons (fetch mode) */}
      {activeChoices && activeChoices.length > 0 && !sending && !transition && (
        <div className="flex-shrink-0 flex flex-wrap gap-2 px-4 py-2 border-t border-surface-800">
          {activeChoices.map(choice => (
            <button
              key={choice.id}
              onClick={() => handleChoice(choice)}
              className="px-3.5 py-1.5 rounded-full border border-surface-600 bg-surface-800 hover:bg-surface-700 hover:border-surface-500 text-surface-300 hover:text-surface-200 text-sm transition-colors"
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-surface-800 bg-surface-900">
        {isFetchMode && activeChoices && activeChoices.length > 0 && !transition ? (
          <p className="text-center text-xs text-surface-600 py-1">
            Select a response above to continue
          </p>
        ) : isTerminal ? (
          <p className="text-center text-xs text-surface-600 py-1">
            Stage complete — no further input required
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={`Message ${blueprint.AID001}…`}
              disabled={inputDisabled}
              className="flex-1 input-field text-sm disabled:opacity-50"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!input.trim() || inputDisabled}
              className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
              aria-label="Send"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        )}
      </div>

    </div>
  );
}
