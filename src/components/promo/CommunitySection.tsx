import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Send, Check, AlertCircle, Lightbulb, ChevronUp } from 'lucide-react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase';

const CATEGORIES = [
  { value: 'new_idea', label: 'New idea' },
  { value: 'website_feedback', label: 'Website feedback' },
  { value: 'roleplay_suggestion', label: 'Roleplay suggestion' },
  { value: 'bug_report', label: 'Bug report' },
  { value: 'general', label: 'General' },
] as const;

interface Idea {
  id: string;
  title: string;
  vote_count: number;
}

type FeedbackState = 'idle' | 'sending' | 'sent' | 'error';

async function fetchIdeas(signal: AbortSignal): Promise<Idea[]> {
  const res = await fetch(`${supabaseUrl}/functions/v1/promo-feedback`, {
    headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey },
    signal,
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const data = (await res.json()) as { ideas?: Idea[] };
  return Array.isArray(data.ideas) ? data.ideas : [];
}

export default function CommunitySection() {
  const reduced = useReducedMotion();
  const [category, setCategory] = useState<string>('new_idea');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FeedbackState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(true);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [votePending, setVotePending] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchIdeas(controller.signal)
      .then(setIdeas)
      .catch(() => setIdeas([]))
      .finally(() => setIdeasLoading(false));
    return () => controller.abort();
  }, [reloadTick]);

  const submitFeedback = useCallback(async () => {
    if (state === 'sending') return;
    if (message.trim().length < 10) {
      setState('error');
      setErrorMsg('Please write at least 10 characters so we understand your message.');
      return;
    }
    setState('sending');
    setErrorMsg('');
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/promo-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey },
        body: JSON.stringify({ action: 'feedback', category, message: message.trim(), email: email.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? 'Your message could not be sent. Please try again.');
      setState('sent');
      setMessage('');
      setEmail('');
      if (category === 'new_idea') {
        setIdeasLoading(true);
        setReloadTick(t => t + 1);
      }
    } catch (e) {
      setState('error');
      setErrorMsg(
        (e as Error).message || 'Your message could not be sent. Please try again.'
      );
    }
  }, [category, message, email, state]);

  const castVote = useCallback(async (ideaId: string) => {
    if (votedIds.has(ideaId) || votePending) return;
    setVotePending(ideaId);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/promo-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey },
        body: JSON.stringify({ action: 'vote', idea_id: ideaId }),
      });
      const data = (await res.json().catch(() => null)) as { vote_count?: number } | null;
      if (!res.ok || typeof data?.vote_count !== 'number') throw new Error('vote failed');
      const newCount = data.vote_count;
      setIdeas(prev => prev.map(i => (i.id === ideaId ? { ...i, vote_count: newCount } : i)));
      setVotedIds(prev => new Set(prev).add(ideaId));
    } catch {
      // Silent: the vote either landed earlier or the service is busy.
    } finally {
      setVotePending(null);
    }
  }, [votedIds, votePending]);

  return (
    <section className="relative py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="text-center mb-12">
          <p className="promo-eyebrow">Community</p>
          <h2 className="promo-heading">Your voice shapes VirgoPlay</h2>
          <p className="promo-subheading max-w-xl mx-auto">
            No account needed. Share a thought, report a bug, or pitch a world — then vote on the ideas already rising.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Feedback form */}
          <motion.div
            initial={{ opacity: 0, y: reduced ? 0 : 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="promo-panel">
            {state === 'sent' ? (
              <div className="py-10 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-6 h-6 text-emerald-300" />
                </div>
                <h3 className="text-lg font-bold text-white">Message received</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed max-w-xs mx-auto">
                  Thank you for helping VirgoPlay grow. Your words go straight to the team.
                </p>
                <button onClick={() => setState('idle')} className="promo-btn-secondary mt-6 px-6 py-2.5 text-sm font-semibold">
                  Send another
                </button>
              </div>
            ) : (
              <form
                onSubmit={e => { e.preventDefault(); void submitFeedback(); }}
                className="space-y-5">
                <div>
                  <label htmlFor="promo-feedback-category" className="promo-label">What is this about?</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setCategory(c.value)}
                        aria-pressed={category === c.value}
                        className={`promo-pill ${category === c.value ? 'promo-pill-active' : ''}`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="promo-feedback-message" className="promo-label">Your message</label>
                  <textarea
                    id="promo-feedback-message"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={5}
                    maxLength={2000}
                    required
                    placeholder="Tell us what is on your mind..."
                    className="promo-input" />
                  <div className="text-right text-[11px] text-slate-500 mt-1">{message.length}/2000</div>
                </div>
                <div>
                  <label htmlFor="promo-feedback-email" className="promo-label">Email <span className="text-slate-500 font-normal">(optional — never shown publicly)</span></label>
                  <input
                    id="promo-feedback-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="promo-input" />
                </div>
                {state === 'error' && (
                  <p className="flex items-start gap-2 text-sm text-rose-300" role="alert">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{errorMsg}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={state === 'sending'}
                  className="promo-btn-primary w-full flex items-center justify-center gap-2 px-7 py-3.5 text-[15px] font-semibold disabled:opacity-60">
                  {state === 'sending' ? 'Sending...' : (<><Send className="w-4 h-4" />Send message</>)}
                </button>
              </form>
            )}
          </motion.div>

          {/* Ideas & voting */}
          <motion.div
            initial={{ opacity: 0, y: reduced ? 0 : 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.55, ease: 'easeOut', delay: 0.1 }}
            className="promo-panel">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-9 h-9 rounded-xl bg-violet-400/15 border border-violet-400/25 flex items-center justify-center">
                <Lightbulb className="w-[18px] h-[18px] text-violet-300" />
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-white leading-tight">Community Ideas</h3>
                <p className="text-xs text-slate-400">Vote for what should be built next</p>
              </div>
            </div>
            {ideasLoading ? (
              <div className="space-y-3" aria-busy="true">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-white/[0.04] border border-white/[0.06] animate-pulse" />
                ))}
              </div>
            ) : ideas.length === 0 ? (
              <p className="text-sm text-slate-400 leading-relaxed py-6 text-center">
                No ideas yet. Be the first — pick &ldquo;New idea&rdquo; in the form and share yours.
              </p>
            ) : (
              <ul className="space-y-3" aria-label="Community ideas">
                {ideas.slice(0, 6).map(idea => {
                  const voted = votedIds.has(idea.id);
                  return (
                    <li key={idea.id} className="promo-idea-row">
                      <button
                        onClick={() => void castVote(idea.id)}
                        disabled={voted || votePending === idea.id}
                        aria-label={voted ? `You voted for: ${idea.title}` : `Vote for: ${idea.title}`}
                        className={`promo-vote-btn ${voted ? 'promo-vote-btn-voted' : ''}`}>
                        <ChevronUp className="w-4 h-4" />
                        <span>{idea.vote_count}</span>
                      </button>
                      <p className="flex-1 min-w-0 text-sm text-slate-200 leading-snug">{idea.title}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
