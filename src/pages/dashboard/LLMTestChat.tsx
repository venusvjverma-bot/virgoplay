import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, AlertCircle, Trash2, Loader2, User, Bot, Save, Copy, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant. Reply concisely.';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function LLMTestChat() {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [promptLoading, setPromptLoading] = useState(true);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);
  const [promptSaveError, setPromptSaveError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, loading]);

  // Load the saved System Prompt for this creator account.
  // A saved prompt wins over the default; the default only shows
  // when nothing has ever been saved.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: loadErr } = await supabase
          .from('llm_test_chat_settings')
          .select('system_prompt')
          .maybeSingle();
        if (cancelled) return;
        if (loadErr) {
          console.error('Failed to load saved system prompt:', loadErr.message);
        } else if (data?.system_prompt) {
          setSystemPrompt(data.system_prompt);
        }
      } finally {
        if (!cancelled) setPromptLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSavePrompt() {
    if (promptSaving) return;
    setPromptSaving(true);
    setPromptSaved(false);
    setPromptSaveError(null);
    try {
      const { error: saveErr } = await supabase
        .from('llm_test_chat_settings')
        .upsert(
          { system_prompt: systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT },
          { onConflict: 'creator_id' },
        );
      if (saveErr) throw new Error(saveErr.message);
      setPromptSaved(true);
      setTimeout(() => setPromptSaved(false), 3000);
    } catch (e) {
      setPromptSaveError((e as Error).message);
    } finally {
      setPromptSaving(false);
    }
  }

  async function handleCopyReply(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(prev => (prev === index ? null : prev)), 2000);
    } catch {
      console.error('Copy failed');
    }
  }

  async function handleSend() {
    if (!message.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: message.trim() };
    const newHistory = [...history, userMsg];
    setHistory(newHistory);
    setMessage('');
    setLoading(true);
    setError(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/llm-chat`;
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          system_prompt: systemPrompt.trim(),
          messages: newHistory,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      const assistantMsg: ChatMessage = { role: 'assistant', content: data.reply ?? '(empty reply)' };
      setHistory(prev => [...prev, assistantMsg]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleClear() {
    setHistory([]);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-5 h-5 text-primary-400" />
            <h1 className="text-xl font-semibold text-surface-100">LLM Test Chat</h1>
          </div>
          <p className="text-sm text-surface-500">
            Multi-turn test chat using the Active LLM Chat Config. For Mother Creator testing only.
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={handleClear}
            disabled={loading}
            className="btn-secondary text-xs gap-1.5 flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5" />Clear Chat
          </button>
        )}
      </div>

      {/* System Prompt */}
      <div className="card space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium text-surface-400">System Prompt</label>
          {promptLoading && (
            <span className="flex items-center gap-1.5 text-xs text-surface-600">
              <Loader2 className="w-3 h-3 animate-spin" />Loading saved prompt…
            </span>
          )}
        </div>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          rows={3}
          className="input-field text-sm font-mono resize-y"
          placeholder="Enter system prompt for the model…" />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            onClick={handleSavePrompt}
            disabled={promptLoading || promptSaving}
            className="btn-primary text-xs gap-1.5">
            {promptSaving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
              : <><Save className="w-3.5 h-3.5" />Save Prompt</>}
          </button>
          {promptSaved && (
            <span className="flex items-center gap-1.5 text-xs text-success-400">
              <Check className="w-3.5 h-3.5" />System prompt saved
            </span>
          )}
          {promptSaveError && (
            <span className="flex items-center gap-1.5 text-xs text-danger-400">
              <AlertTriangle className="w-3.5 h-3.5" />{promptSaveError}
            </span>
          )}
        </div>
      </div>

      {/* Chat History */}
      <div className="card p-0 overflow-hidden">
        <div ref={scrollRef} className="max-h-[460px] overflow-y-auto p-5 space-y-5">
          {history.length === 0 && !loading && (
            <div className="text-center py-10 text-surface-600 text-sm">
              No messages yet. Type a message below to start the conversation.
            </div>
          )}
          {history.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary-600/20 border border-primary-600/30 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary-400" />
                </div>
              )}
              <div className={`max-w-[80%] group ${msg.role === 'assistant' ? 'flex flex-col gap-1.5' : ''}`}>
                <div className={`px-4 py-3 rounded-2xl text-sm leading-[1.7] whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'bg-primary-600/20 border border-primary-600/20 text-surface-100 rounded-tr-sm'
                    : 'bg-surface-800 border border-surface-700 text-surface-200 rounded-tl-sm'
                }`}>
                  {msg.content}
                </div>
                {msg.role === 'assistant' && (
                  <button
                    onClick={() => handleCopyReply(msg.content, i)}
                    title="Copy response"
                    className="self-start flex items-center gap-1 text-xs text-surface-600 hover:text-primary-400 transition-colors px-1 rounded">
                    {copiedIndex === i
                      ? <><Check className="w-3 h-3 text-success-400" /><span className="text-success-400">Copied</span></>
                      : <><Copy className="w-3 h-3" />Copy</>}
                  </button>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-surface-700 border border-surface-600 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-surface-400" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary-600/20 border border-primary-600/30 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary-400" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-surface-800 border border-surface-700">
                <Loader2 className="w-4 h-4 text-surface-500 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Message Input */}
      <div className="card space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            className="input-field flex-1"
            disabled={loading} />
          <button
            onClick={handleSend}
            disabled={loading || !message.trim()}
            className="btn-primary gap-1.5 flex-shrink-0">
            {loading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending…</>
              : <><Send className="w-3.5 h-3.5" />Send</>}
          </button>
        </div>
      </div>
    </div>
  );
}
