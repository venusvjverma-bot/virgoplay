import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { MessageSquare, Heart, Flame, Sparkles } from 'lucide-react';
import type { PromoListing } from './PromoCarousel';

const CLUE_WORDS = [
  'Detective', 'Magic', 'Cyberpunk', 'Vampire', 'Space', 'Mystery',
  'Romance', 'Fantasy', 'Adventure', 'Kingdom', 'Night', 'Dream',
];

interface KeywordTile {
  clue: string;
  role: PromoListing | null;
}

export function FindYourStorySection({ listings, loading }: { listings: PromoListing[]; loading: boolean }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  if (loading) return null;
  if (listings.length === 0) return null;

  const tiles: KeywordTile[] = CLUE_WORDS.map(clue => {
    const match = listings.find(l =>
      (l.role_name + ' ' + l.role_description).toLowerCase().includes(clue.toLowerCase())
    ) ?? null;
    return { clue, role: match };
  });
  const withRoles = tiles.filter(t => t.role);
  if (withRoles.length < 3) return null;

  return (
    <section className="relative py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="text-center mb-10">
          <p className="promo-eyebrow">Mystery Doors</p>
          <h2 className="promo-heading">Find Your Next Story</h2>
          <p className="promo-subheading max-w-xl mx-auto">
            Every card hides a world. Pick the word that pulls at you, and see who is waiting on the other side.
          </p>
        </motion.div>
        <div className="flex flex-wrap justify-center gap-3">
          {withRoles.map(({ clue, role }, i) => (
            <motion.button
              key={clue}
              initial={{ opacity: 0, y: reduced ? 0 : 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.3), ease: 'easeOut' }}
              onClick={() => navigate(`/test-chat?role_id=${role!.role_id}&creator_id=${role!.creator_id}`)}
              className="promo-door group">
              <Sparkles className="w-4 h-4 text-violet-300/80 group-hover:text-violet-200 transition-colors" />
              <span>{clue}</span>
              <span className="promo-door-hint">Step inside</span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function StoryOfTheWeekSection({ listings, loading }: { listings: PromoListing[]; loading: boolean }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  if (loading) return null;

  // Newest published roleplay with a cover image — real content only,
  // never invented statistics.
  const story = [...listings]
    .filter(l => l.role_image_url)
    .sort((a, b) => b.like_count - a.like_count)[0] ?? listings[0];
  if (!story) return null;

  return (
    <section className="relative py-16 sm:py-24">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="promo-glow promo-glow-week" />
      </div>
      <div className="relative max-w-5xl mx-auto px-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="text-center mb-10">
          <p className="promo-eyebrow"><Flame className="inline w-3.5 h-3.5 -mt-0.5 mr-1.5 text-amber-300/90" />Featured</p>
          <h2 className="promo-heading">Story of the Week</h2>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: reduced ? 0 : 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="promo-feature-card max-w-[357px] mx-auto">
          <button
            onClick={() => navigate(`/test-chat?role_id=${story.role_id}&creator_id=${story.creator_id}`)}
            className="promo-feature-image block w-full"
            aria-label={`Open roleplay: ${story.role_name}`}>
            <img src={story.role_image_url ?? ''} alt={story.role_name} loading="lazy" className="w-full h-full object-cover" />
            <span className="promo-feature-shade" />
            <span className="promo-feature-badge">Start the conversation</span>
          </button>
          <div className="p-6 text-center">
            <h3 className="text-xl font-bold text-white">{story.role_name}</h3>
            {story.character_name && (
              <p className="text-sm text-slate-400 mt-1">with {story.character_name}</p>
            )}
            {story.role_description && (
              <p className="mt-3 text-sm text-slate-400 leading-relaxed line-clamp-3">{story.role_description}</p>
            )}
            <div className="flex items-center justify-center gap-1.5 mt-4 text-sm text-slate-400">
              <span>{story.like_count}</span><Heart className="w-4 h-4 text-rose-400" />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function CreatorSpotlightSection({ listings, loading }: { listings: PromoListing[]; loading: boolean }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  if (loading) return null;

  // Group published roleplays by creator, spotlight the creator with the
  // most published work, plus up to two runners-up (real counts only).
  const byCreator = new Map<string, { name: string | null; roles: PromoListing[] }>();
  for (const l of listings) {
    const entry = byCreator.get(l.creator_id) ?? { name: l.character_name, roles: [] };
    entry.roles.push(l);
    byCreator.set(l.creator_id, entry);
  }
  const ranked = [...byCreator.entries()].sort((a, b) => b[1].roles.length - a[1].roles.length);
  if (ranked.length === 0) return null;
  const [topId, top] = ranked[0];
  const runners = ranked.slice(1, 3);

  return (
    <section className="relative py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="text-center mb-10">
          <p className="promo-eyebrow">Spotlight</p>
          <h2 className="promo-heading">The Minds Behind the Stories</h2>
          <p className="promo-subheading max-w-xl mx-auto">
            Every world on VirgoPlay begins with a creator. Meet the people building them.
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: reduced ? 0 : 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="promo-spotlight-card max-w-2xl mx-auto">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-sky-400/30 to-violet-400/30 border border-white/15 flex items-center justify-center text-xl font-bold text-white">
            {(top.name ?? 'V').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <h3 className="text-lg font-bold text-white">{top.name ?? 'A VirgoPlay creator'}</h3>
            <p className="text-sm text-slate-400 mt-0.5">
              {top.roles.length} published {top.roles.length === 1 ? 'roleplay' : 'roleplays'}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {top.roles.slice(0, 3).map(r => (
                <button
                  key={`${r.creator_id}-${r.role_id}`}
                  onClick={() => navigate(`/test-chat?role_id=${r.role_id}&creator_id=${r.creator_id}`)}
                  className="promo-chip">
                  {r.role_name}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
        {runners.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto mt-4">
            {runners.map(([id, info]) => (
              <div key={id} className="promo-spotlight-card-sm">
                <div className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-sm font-bold text-slate-200">
                  {(info.name ?? 'V').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-100 truncate">{info.name ?? 'A VirgoPlay creator'}</div>
                  <div className="text-xs text-slate-400">{info.roles.length} published</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="text-center mt-8">
          <a href="/register" className="promo-btn-secondary inline-block px-7 py-3 text-[15px] font-semibold">
            Become a Creator
          </a>
        </div>
      </div>
    </section>
  );
}
