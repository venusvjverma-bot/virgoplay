import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Zap, Bot, User, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Creator, CreatorProfile } from '../../types';

interface Msg { id: string; role: 'user' | 'assistant'; content: string }

const AI_REPLIES = [
  (name: string, q: string) =>
    `Thanks for asking! As ${name}, I think about "${q.slice(0, 50)}" a lot. Here is my take: stay consistent, focus on fundamentals, and never stop learning.`,
  (_name: string, _q: string) =>
    `Great question. From my experience, the key is to start small, validate quickly, and iterate. What specific aspect would you like to explore further?`,
  (name: string, _q: string) =>
    `Hey, I appreciate you reaching out to ${name} AI! That is a topic close to my heart. Let me share a perspective that has served me well...`,
  (_name: string, _q: string) =>
    `Excellent point! The most important thing I have learned is that progress beats perfection every time. Keep showing up and the results follow.`,
];

export default function ClientPortal() {
  const { slug } = useParams<{ slug: string }>();
  const [creator, setCreator]   = useState<Creator | null>(null);
  const [profile, setProfile]   = useState<CreatorProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput]       = useState('');
  const [busy, setBusy]         = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (slug) load(slug); }, [slug]);

  useEffect(() => {
    if (profile?.welcome_message && messages.length === 0) {
      setMessages([{ id: 'welcome', role: 'assistant', content: profile.welcome_message }]);
    }
  }, [profile]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function load(username: string) {
    const { data: c } = await supabase
      .from('creators').select('*')
      .eq('username', username.toLowerCase())
      .eq('verification_status', 'approved')
      .eq('is_temporarily_deactivated', false)
      .maybeSingle();

    if (!c) { setNotFound(true); return; }
    setCreator(c as Creator);

    const { data: p } = await supabase
      .from('creator_profiles').select('*')
      .eq('creator_id', (c as Creator).id).maybeSingle();
    setProfile(p as CreatorProfile ?? null);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: text }]);
    setInput('');
    setBusy(true);

    await new Promise(r => setTimeout(r, 800 + Math.random() * 700));

    const name    = profile?.display_name || creator?.username || 'your creator';
    const replyFn = AI_REPLIES[Math.floor(Math.random() * AI_REPLIES.length)];
    setMessages(prev => [
      ...prev,
      { id: (Date.now() + 1).toString(), role: 'assistant', content: replyFn(name, text) },
    ]);
    setBusy(false);
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-surface-800 border border-surface-700 flex items-center justify-center mb-6">
          <Bot className="w-8 h-8 text-surface-500" />
        </div>
        <h1 className="text-2xl font-bold text-surface-100 mb-2">Portal Not Found</h1>
        <p className="text-surface-400 text-center max-w-sm text-sm leading-relaxed">
          This creator portal does not exist or has not been verified yet.
        </p>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const avatarUrl    = profile?.avatar_url
    ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_url).data.publicUrl
    : null;
  const displayName  = profile?.display_name || creator.username;

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col">
      {/* Header */}
      <header className="bg-surface-900/80 backdrop-blur-lg border-b border-surface-800 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName}
              className="w-11 h-11 rounded-full object-cover border-2 border-primary-500/30 flex-shrink-0" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-primary-600/20 border-2 border-primary-500/30 flex items-center justify-center text-primary-400 font-bold text-xl flex-shrink-0">
              {displayName[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-surface-50 text-lg leading-tight truncate">{displayName}</h1>
            {profile?.bio && <p className="text-sm text-surface-400 leading-tight truncate">{profile.bio}</p>}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-500/10 border border-accent-500/20 flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
            <span className="text-xs text-accent-400 font-medium">AI Online</span>
          </div>
        </div>
      </header>

      {/* Chat */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={[
                'w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden',
                msg.role === 'assistant'
                  ? 'bg-primary-600/20 border border-primary-500/30'
                  : 'bg-surface-700 border border-surface-600',
              ].join(' ')}>
                {msg.role === 'assistant'
                  ? (avatarUrl
                      ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                      : <Bot className="w-4 h-4 text-primary-400" />)
                  : <User className="w-4 h-4 text-surface-300" />
                }
              </div>
              <div className={[
                'max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed',
                msg.role === 'assistant'
                  ? 'bg-surface-800 border border-surface-700 text-surface-100 rounded-tl-sm'
                  : 'bg-primary-600 text-white rounded-tr-sm',
              ].join(' ')}>
                {msg.content}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-600/20 border border-primary-500/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-400" />
              </div>
              <div className="bg-surface-800 border border-surface-700 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2">
                <Loader className="w-3.5 h-3.5 text-surface-400 animate-spin" />
                <span className="text-sm text-surface-400">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <div className="sticky bottom-0 bg-surface-950/95 backdrop-blur-lg border-t border-surface-800">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <form onSubmit={send} className="flex gap-3">
            <input
              type="text"
              className="input-field flex-1"
              placeholder={`Ask ${displayName} anything...`}
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={busy}
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="btn-primary px-4 py-2.5 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="flex items-center justify-center gap-1.5 mt-2.5">
            <Zap className="w-3 h-3 text-surface-700" />
            <span className="text-xs text-surface-700">Powered by Creator Portal AI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
