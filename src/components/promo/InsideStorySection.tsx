import { motion, useReducedMotion } from 'motion/react';
import { Sparkles, Feather, MoonStar } from 'lucide-react';

// Illustrative conversation, rendered as a static cinematic demo.
// Deliberately NOT connected to the real chat engine.
const DEMO_MESSAGES = [
  { from: 'user', text: 'The door was already open when I arrived. Should I be worried?' },
  { from: 'role', name: 'Selene', text: 'Worried? No. Curious — that is far more dangerous. Come in. The night has been waiting for you.' },
  { from: 'user', text: 'Then lead the way. Where does it start tonight?' },
  { from: 'role', name: 'Selene', text: 'On the rooftop, where the city forgets to look. Bring nothing but your questions. I will bring the answers you fear.' },
];

const FEATURES = [
  {
    icon: Sparkles,
    text: 'Distinctive personalities with their own moods, memories and motivations.',
  },
  {
    icon: Feather,
    text: 'Unique conversations shaped by her attitude, reactions and unfolding emotions.',
  },
  {
    icon: MoonStar,
    text: 'Stories that develop through her personality, decisions and interactions with you.',
  },
];

export default function InsideStorySection() {
  const reduced = useReducedMotion();
  return (
    <section className="relative py-16 sm:py-24">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="promo-glow promo-glow-inside" />
      </div>
      <div className="relative max-w-5xl mx-auto px-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}>
            <p className="promo-inside-eyebrow">Inside the Story</p>
            <h2 className="promo-inside-heading">
              Her Mood. Her Style. <em className="promo-inside-heading-em">Her Story.</em>
            </h2>
            <p className="promo-inside-subheading">
              Step into her world, discover her personality, and become part of a
              story that unfolds in her own unique way.
            </p>
            <p className="promo-inside-body">
              Every roleplay brings a personality of its own. She has her moods,
              her attitude, her way of speaking and her own story to tell. Her
              reactions, emotions and choices shape the unfolding experience. You
              don't just exchange messages — you step into her world and become
              part of her story.
            </p>
            <ul className="promo-inside-features">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="promo-inside-feature">
                  <span className="promo-inside-icon" aria-hidden="true">
                    <Icon size={17} strokeWidth={1.75} />
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: reduced ? 0 : 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            className="promo-demo-panel"
            aria-label="Illustrative conversation example">
            <div className="promo-demo-header">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400/40 to-violet-400/40 border border-white/15 flex items-center justify-center text-[13px] font-bold text-white">S</div>
              <div>
                <div className="text-[13px] font-semibold text-slate-100 leading-tight">Selene</div>
                <div className="text-[11px] text-emerald-400/90 leading-tight">in the story with you</div>
              </div>
              <span className="promo-demo-tag">Example conversation</span>
            </div>
            <div className="p-4 sm:p-5 space-y-3">
              {DEMO_MESSAGES.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: reduced ? 0 : 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.4, delay: 0.15 + i * 0.12, ease: 'easeOut' }}
                  className={m.from === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={m.from === 'user' ? 'promo-bubble-user' : 'promo-bubble-role'}>
                    {m.from === 'role' && <span className="block text-[11px] font-semibold text-violet-300/90 mb-1">{m.name}</span>}
                    {m.text}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
