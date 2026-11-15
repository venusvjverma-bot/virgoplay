import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { ChevronDown, Menu, X, Heart, MessageSquare } from 'lucide-react';
import { supabase, supabaseUrl } from '../../lib/supabase';
import PromoCarousel, { type PromoListing } from '../../components/promo/PromoCarousel';
import { FindYourStorySection, StoryOfTheWeekSection, CreatorSpotlightSection } from '../../components/promo/PromoStorySections';
import InsideStorySection from '../../components/promo/InsideStorySection';
import CommunitySection from '../../components/promo/CommunitySection';

const LOGO_URL = `${supabaseUrl}/storage/v1/object/public/login-assets/logo-2.png`;
const HERO_IMAGE = '/assets/file_000000003a2c82469dd066e6c37bd288.png';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: (delay: number = 0) => ({
    opacity: 1, y: 0,
    transition: { type: 'spring', stiffness: 60, damping: 16, delay },
  }),
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.16, delayChildren: 0.1 } },
};

const cardChild: Variants = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 58, damping: 17 } },
};

function PromoHeader() {
  const [open, setOpen] = useState(false);
  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="sticky top-0 z-40 bg-[#0a1020]/85 backdrop-blur border-b border-white/[0.07]">
      <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
        <Link to="/promotional-page" className="flex items-center" aria-label="VirgoPlay home">
          <img src={LOGO_URL} alt="VirgoPlay" className="h-9 w-auto object-contain" />
        </Link>
        <nav className="hidden sm:flex items-center gap-1" aria-label="Main navigation">
          <Link to="/chat-library" className="promo-nav-link">Explore Library</Link>
          <Link to="/register" className="promo-nav-link">Become a Creator</Link>
          <Link to="/login" className="promo-nav-cta">Sign In</Link>
        </nav>
        <button
          className="sm:hidden w-11 h-11 flex items-center justify-center text-slate-200"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}>
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      {open && (
        <nav className="sm:hidden border-t border-white/[0.07] bg-[#0a1020]/95 backdrop-blur px-5 py-4 flex flex-col gap-1" aria-label="Mobile navigation">
          <Link to="/chat-library" onClick={() => setOpen(false)} className="promo-nav-link">Explore Library</Link>
          <Link to="/register" onClick={() => setOpen(false)} className="promo-nav-link">Become a Creator</Link>
          <Link to="/login" onClick={() => setOpen(false)} className="promo-nav-cta mt-2 text-center">Sign In</Link>
        </nav>
      )}
    </motion.header>
  );
}

function HeroSection() {
  const prefersReducedMotion = useReducedMotion();
  const lineVariants: Variants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 34 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 52, damping: 15 } },
  };
  return (
    <section className="relative overflow-hidden promo-hero">
      <div className="absolute inset-0" aria-hidden="true">
        <img src={HERO_IMAGE} alt="" className="promo-hero-kitty" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070b16]/70 via-[#070b16]/40 to-[#070b16]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#070b16]/80 via-transparent to-[#070b16]/60" />
      </div>
      <div className="relative max-w-4xl mx-auto px-5 pt-24 pb-20 sm:pt-36 sm:pb-28 text-center">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut', delay: 0.15 }}
          className="promo-hero-eyebrow">
          Step Into a World of Roleplay
        </motion.p>
        <motion.h1
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="promo-hero-heading">
          <motion.span variants={lineVariants} className="block">Every Personality Has a Story.</motion.span>
          <motion.span variants={lineVariants} className="block promo-hero-heading-highlight">Every Story Has a World.</motion.span>
        </motion.h1>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut', delay: 0.75 }}
          className="promo-hero-secondary">
          Find the one you can't stop talking to.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut', delay: 0.9 }}
          className="promo-hero-description mx-auto">
          Meet fascinating personalities, discover their secrets, explore their worlds and become part of stories that unfold with every conversation. Your next favourite roleplay is waiting.
        </motion.p>
        <motion.div custom={1.05} variants={fadeUp} initial="hidden" animate="visible" className="mt-9 flex justify-center">
          <Link to="/chat-library" className="promo-btn-primary block w-full sm:w-auto text-center px-8 py-3.5 text-[18px] font-semibold">
            Explore Chat Library
          </Link>
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut', delay: 1.35 }}
          className="promo-hero-tagline">
          And this is only the beginning...
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6, duration: 0.8 }}
          className="mt-10 flex justify-center">
          <ChevronDown className="w-5 h-5 text-slate-400 animate-bounce" aria-hidden="true" />
        </motion.div>
      </div>
    </section>
  );
}

interface ShowcaseSectionProps {
  listings: PromoListing[];
  loading: boolean;
  error: string | null;
}

function ShowcaseSection({ listings, loading, error }: ShowcaseSectionProps) {
  const navigate = useNavigate();
  return (
    <section className="relative py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-5">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={staggerContainer}
          className="text-center mb-12">
          <motion.h2 variants={cardChild} className="promo-library-heading">
            <span className="block">Every Roleplay Has a World of Its Own.</span>
            <span className="promo-library-heading-subline">Which One Will You Enter?</span>
          </motion.h2>
          <motion.p variants={cardChild} className="promo-library-description">
            Explore a collection of unique roleplays, each with its own personality, setting and story. Discover fascinating personalities, find a story that sparks your curiosity and step into a conversation that takes you somewhere unexpected.
          </motion.p>
        </motion.div>
        <div className="promo-carousel-clip mt-16 sm:mt-0">
          <PromoCarousel
            listings={listings}
            loading={loading}
            error={error}
            onOpenChat={(creatorId, roleId) => navigate(`/test-chat?role_id=${roleId}&creator_id=${creatorId}`)}
            onOpenLibrary={() => navigate('/chat-library')} />
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-center mt-10">
          <Link to="/chat-library" className="promo-text-link">
            View the full library
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32 promo-final-cta">
      <div className="absolute inset-0" aria-hidden="true">
        <img src="/promo-story.webp" alt="" loading="lazy" className="w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070b16] via-[#070b16]/70 to-[#070b16]" />
      </div>
      <div className="relative max-w-3xl mx-auto px-5 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={staggerContainer}>
          <motion.h2 variants={cardChild} className="promo-hero-title">
            Your Next Conversation Starts Here.
          </motion.h2>
          <motion.p variants={cardChild} className="promo-subheading max-w-xl mx-auto">
            One message is all it takes. Choose a character, say hello, and see where the night leads.
          </motion.p>
          <motion.div variants={cardChild} className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <Link to="/chat-library" className="promo-btn-primary w-full sm:w-auto text-center px-8 py-4 text-[15px] font-semibold">
              Explore Chat Library
            </Link>
            <Link to="/register" className="promo-btn-secondary w-full sm:w-auto text-center px-8 py-4 text-[15px] font-semibold">
              Become a Creator
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function PromoFooter() {
  return (
    <footer className="border-t border-white/[0.07] py-10 bg-[#060a14]">
      <div className="max-w-5xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-5">
        <img src={LOGO_URL} alt="VirgoPlay" className="h-8 w-auto object-contain opacity-90" />
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Footer navigation">
          <Link to="/about-us" className="promo-footer-link">About Us</Link>
          <Link to="/terms-of-service" className="promo-footer-link">Terms of Service</Link>
          <Link to="/login" className="promo-footer-link">Sign In</Link>
          <Link to="/register" className="promo-footer-link">Become a Creator</Link>
          <Link to="/chat-library" className="promo-footer-link">Chat Library</Link>
        </nav>
      </div>
      <div className="max-w-5xl mx-auto px-5 mt-6 text-center">
        <p className="text-xs text-slate-600">VirgoPlay — where every conversation tells a story.</p>
      </div>
    </footer>
  );
}

export default function PromotionalPage() {
  const [listings, setListings] = useState<PromoListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('chat_library_listings')
          .select(`
            creator_id,
            role_id,
            like_count,
            role:character_roles ( name, description )
          `)
          .order('created_at', { ascending: false });
        if (queryError) throw new Error(queryError.message);
        if (cancelled) return;
        const rows = (data ?? []) as Array<{
          creator_id: string;
          role_id: string;
          like_count: number;
          role: { name: string; description: string } | { name: string; description: string }[] | null;
        }>;
        const roleIds = rows.map(r => r.role_id);
        const creatorIds = [...new Set(rows.map(r => r.creator_id))];
        const emptyIds = ['00000000-0000-0000-0000-000000000000'];
        const [imageRes, charRes, overrideRes, customizeOverrideRes] = await Promise.all([
          supabase
            .from('role_image_productions')
            .select('creator_id, role_id, role_image_url')
            .in('role_id', roleIds.length > 0 ? roleIds : emptyIds),
          supabase
            .from('character_studio_v2_selections')
            .select('creator_id, character:character_studio_v2 (name, age, country)')
            .in('creator_id', creatorIds.length > 0 ? creatorIds : emptyIds),
          supabase
            .from('character_studio_v2_my_ai_overrides')
            .select('creator_id, display_name')
            .in('creator_id', creatorIds.length > 0 ? creatorIds : emptyIds),
          supabase
            .from('customize_ai_overrides')
            .select('creator_id, display_name, appearance_data')
            .in('creator_id', creatorIds.length > 0 ? creatorIds : emptyIds),
        ]);
        if (cancelled) return;
        const imageMap = new Map<string, string | null>();
        for (const img of (imageRes.data ?? []) as Array<{ creator_id: string; role_id: string; role_image_url: string | null }>) {
          imageMap.set(`${img.creator_id}:${img.role_id}`, img.role_image_url);
        }
        const myAiNames = new Map<string, string>();
        for (const ov of (overrideRes.data ?? []) as Array<{ creator_id: string; display_name: string | null }>) {
          if (ov.display_name) myAiNames.set(ov.creator_id, ov.display_name);
        }
        const customizeNames = new Map<string, string>();
        const customizeAges = new Map<string, number | null>();
        for (const ov of (customizeOverrideRes.data ?? []) as Array<{ creator_id: string; display_name: string | null; appearance_data: { age?: string | number | null } | null }>) {
          if (ov.display_name) customizeNames.set(ov.creator_id, ov.display_name);
          const raw = ov.appearance_data?.age;
          if (raw != null && raw !== '') {
            const parsed = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
            customizeAges.set(ov.creator_id, isNaN(parsed) ? null : parsed);
          }
        }
        const charMap = new Map<string, { name: string | null; age: number | null; country: string | null; is_customize_ai: boolean | null }>();
        for (const sel of (charRes.data ?? []) as Array<{
          creator_id: string;
          character: { name: string; age: number | null; country: string | null } | { name: string; age: number | null; country: string | null }[] | null;
        }>) {
          const c = Array.isArray(sel.character) ? sel.character[0] : sel.character;
          charMap.set(sel.creator_id, { name: c?.name ?? null, age: c?.age ?? null, country: c?.country ?? null, is_customize_ai: null });
        }
        for (const creatorId of customizeNames.keys()) {
          const entry = charMap.get(creatorId);
          if (entry) entry.is_customize_ai = true;
        }
        const mapped: PromoListing[] = rows.map(r => {
          const role = Array.isArray(r.role) ? r.role[0] : r.role;
          const info = charMap.get(r.creator_id);
          const isCustomizeAi = info?.is_customize_ai === true;
          const overrideName = isCustomizeAi
            ? (customizeNames.get(r.creator_id) ?? null)
            : (myAiNames.get(r.creator_id) ?? null);
          return {
            creator_id: r.creator_id,
            role_id: r.role_id,
            role_name: role?.name ?? 'Unknown Role',
            role_description: role?.description ?? '',
            role_image_url: imageMap.get(`${r.creator_id}:${r.role_id}`) ?? null,
            character_name: overrideName ?? info?.name ?? null,
            character_age: isCustomizeAi ? (customizeAges.get(r.creator_id) ?? null) : (overrideName ? null : (info?.age ?? null)),
            character_country: overrideName ? null : (info?.country ?? null),
            like_count: r.like_count ?? 0,
          };
        });
        if (cancelled) return;
        setListings(mapped);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-[#070b16] text-slate-100 flex flex-col" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <PromoHeader />
      <main className="flex-1 overflow-x-clip">
        <HeroSection />
        <ShowcaseSection listings={listings} loading={loading} error={error} />
        <FindYourStorySection listings={listings} loading={loading} />
        <InsideStorySection />
        <StoryOfTheWeekSection listings={listings} loading={loading} />
        <CreatorSpotlightSection listings={listings} loading={loading} />
        <CommunitySection />
        <FinalCtaSection />
      </main>
      <PromoFooter />
    </div>
  );
}
