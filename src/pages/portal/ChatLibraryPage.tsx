import { useRef, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, MessageSquare, ArrowRight, Heart } from 'lucide-react';
import { supabase, supabaseUrl } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import ConsentGate, { hasConsent } from '../../components/ConsentGate';
import CharacterReveal from '../../components/CharacterReveal';
import LivePlatformActivity from '../../components/LivePlatformActivity';
import { countryShortName } from '../../lib/countries';

const KEYWORD_RE = new RegExp(
  '\\b(teas(?:ing|es|e)?|playful(?:ly)?|confident(?:ly)?|flirt(?:y|ing)?|romantic(?:ally)?|passionate(?:ly)?|adventurous(?:ly)?|charming(?:ly)?|seductive(?:ly)?|mischievous(?:ly)?|affection(?:ate)?|desire(?:s|d)?|connection(?:s)?|intimate(?:ly)?)\\b',
  'gi',
);

function highlightKeywords(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  KEYWORD_RE.lastIndex = 0;
  while ((m = KEYWORD_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={m.index} className="cl-keyword">{m[0]}</span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 1 ? parts : text;
}

function SparkleCluster() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
      <path d="M28 6L30.5 22.5L47 25L30.5 27.5L28 44L25.5 27.5L9 25L25.5 22.5L28 6Z" fill="#8b5cf6" />
      <path d="M12 38L13 43L18 44L13 45L12 50L11 45L6 44L11 43L12 38Z" fill="#a78bfa" opacity="0.8" />
      <path d="M44 36L45 40L49 41L45 42L44 46L43 42L39 41L43 40L44 36Z" fill="#c4b5fd" opacity="0.7" />
      <path d="M48 14L48.8 18L52.8 18.8L48.8 19.6L48 23.6L47.2 19.6L43.2 18.8L47.2 18L48 14Z" fill="#a78bfa" opacity="0.6" />
    </svg>
  );
}

const LOGO_URL = `${supabaseUrl}/storage/v1/object/public/login-assets/logo-2.png`;
const BANNER_URL = `${supabaseUrl}/storage/v1/object/public/login-assets/chat-library-banner.png`;

interface LibraryListing {
  creator_id: string;
  role_id: string;
  role_name: string;
  role_description: string;
  role_image_url: string | null;
  character_name: string | null;
  character_age: number | null;
  character_country: string | null;
  like_count: number;
}

function formatCharacterLabel(name: string | null, age: number | null, country: string | null): string {
  if (!name) return 'Unknown';
  const parts: string[] = [name];
  if (age) parts.push(String(age));
  const shortCountry = countryShortName(country);
  if (shortCountry) parts.push(shortCountry);
  return parts.join(', ');
}

function TypingBubble() {
  return (
    <div className="w-14 h-14 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-4">
      <div className="relative">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M6 6h20a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-5l-5 4v-4H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z"
            fill="#f5f3ff"
            stroke="#c4b5fd"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle className="typing-dot" cx="11" cy="14" r="2" fill="#8b5cf6" />
          <circle className="typing-dot" cx="16" cy="14" r="2" fill="#8b5cf6" />
          <circle className="typing-dot" cx="21" cy="14" r="2" fill="#8b5cf6" />
        </svg>
      </div>
    </div>
  );
}

function ChatLibraryPreloader({ exiting }: { exiting: boolean }) {
  return (
    <div className={`vp-preloader-overlay ${exiting ? 'vp-preloader-overlay--exiting' : ''}`}>
      <div className="vp-preloader-logo flex flex-col items-center gap-5">
        <div className="vp-preloader-ring" />
        <div className="vp-preloader-brand-text">VirgoPlay</div>
        <div className="vp-preloader-tagline">CHAT LIBRARY</div>
      </div>
    </div>
  );
}

export default function ChatLibraryPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [listings, setListings] = useState<LibraryListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(hasConsent());
  const [showPreloader, setShowPreloader] = useState(true);
  const [preloaderExiting, setPreloaderExiting] = useState(false);
  const [contentRevealed, setContentRevealed] = useState(false);
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
  const visitCountedRef = useRef(false);

  // Count one visit per page entry; the ref guard prevents the StrictMode
  // double-effect fire (dev) and re-renders from double-counting a single load.
  useEffect(() => {
    if (visitCountedRef.current) return;
    visitCountedRef.current = true;
    (async () => {
      try {
        const { error: rpcError } = await supabase.rpc('increment_chat_library_visits');
        if (!rpcError) {
          window.dispatchEvent(new CustomEvent('chat-library-visits-updated'));
        }
      } catch {
        // counting is non-critical — never block the page
      }
    })();
  }, []);

  useEffect(() => {
    if (enlargedImageUrl) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [enlargedImageUrl]);

  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setPreloaderExiting(true);
      setContentRevealed(true);
    }, 1400);
    const removeTimer = setTimeout(() => setShowPreloader(false), 1950);
    return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
  }, []);

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
            role:character_roles (
              name,
              description
            )
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

        const [imageRes, charRes, overrideRes, customizeOverrideRes] = await Promise.all([
          supabase
            .from('role_image_productions')
            .select('creator_id, role_id, role_image_url')
            .in('role_id', roleIds.length > 0 ? roleIds : ['00000000-0000-0000-0000-000000000000']),
          supabase
            .from('character_studio_v2_selections')
            .select('creator_id, character:character_studio_v2 (name, age, country, is_customize_ai)')
            .in('creator_id', creatorIds.length > 0 ? creatorIds : ['00000000-0000-0000-0000-000000000000']),
          supabase
            .from('character_studio_v2_my_ai_overrides')
            .select('creator_id, display_name')
            .in('creator_id', creatorIds.length > 0 ? creatorIds : ['00000000-0000-0000-0000-000000000000']),
          supabase
            .from('customize_ai_overrides')
            .select('creator_id, display_name, appearance_data')
            .in('creator_id', creatorIds.length > 0 ? creatorIds : ['00000000-0000-0000-0000-000000000000']),
        ]);

        const myAiDisplayNameMap = new Map<string, string | null>();
        for (const ov of (overrideRes.data ?? []) as Array<{ creator_id: string; display_name: string | null }>) {
          if (ov.display_name) myAiDisplayNameMap.set(ov.creator_id, ov.display_name);
        }
        const customizeDisplayNameMap = new Map<string, string | null>();
        const customizeAgeMap = new Map<string, number | null>();
        for (const ov of (customizeOverrideRes.data ?? []) as Array<{ creator_id: string; display_name: string | null; appearance_data: { age?: string | number | null } | null }>) {
          if (ov.display_name) customizeDisplayNameMap.set(ov.creator_id, ov.display_name);
          const rawAge = ov.appearance_data?.age;
          if (rawAge != null && rawAge !== '') {
            const parsed = typeof rawAge === 'number' ? rawAge : parseInt(String(rawAge), 10);
            customizeAgeMap.set(ov.creator_id, isNaN(parsed) ? null : parsed);
          }
        }

        if (cancelled) return;

        const imageMap = new Map<string, string | null>();
        for (const img of (imageRes.data ?? []) as Array<{ creator_id: string; role_id: string; role_image_url: string | null }>) {
          imageMap.set(`${img.creator_id}:${img.role_id}`, img.role_image_url);
        }

        const charMap = new Map<string, { name: string | null; age: number | null; country: string | null; is_customize_ai: boolean | null }>();
        for (const sel of (charRes.data ?? []) as Array<{
          creator_id: string;
          character: { name: string; age: number | null; country: string | null; is_customize_ai: boolean | null } | { name: string; age: number | null; country: string | null; is_customize_ai: boolean | null }[] | null;
        }>) {
          const c = Array.isArray(sel.character) ? sel.character[0] : sel.character;
          charMap.set(sel.creator_id, { name: c?.name ?? null, age: c?.age ?? null, country: c?.country ?? null, is_customize_ai: c?.is_customize_ai ?? null });
        }

        const mapped: LibraryListing[] = rows.map(r => {
          const role = Array.isArray(r.role) ? r.role[0] : r.role;
          const charInfo = charMap.get(r.creator_id);
          const isCustomizeAi = charInfo?.is_customize_ai === true;
          const overrideName = isCustomizeAi
            ? (customizeDisplayNameMap.get(r.creator_id) ?? null)
            : (myAiDisplayNameMap.get(r.creator_id) ?? null);
          const customizeAge = isCustomizeAi ? (customizeAgeMap.get(r.creator_id) ?? null) : null;
          return {
            creator_id: r.creator_id,
            role_id: r.role_id,
            role_name: role?.name ?? 'Unknown Role',
            role_description: role?.description ?? '',
            role_image_url: imageMap.get(`${r.creator_id}:${r.role_id}`) ?? null,
            character_name: overrideName ?? charInfo?.name ?? null,
            character_age: isCustomizeAi ? customizeAge : (overrideName ? null : (charInfo?.age ?? null)),
            character_country: overrideName ? null : (charInfo?.country ?? null),
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

  function handleCardClick(creatorId: string, roleId: string) {
    navigate(`/test-chat?role_id=${roleId}&creator_id=${creatorId}`);
  }

  if (!consentAccepted) {
    return <ConsentGate onAccept={() => setConsentAccepted(true)} />;
  }

  if (loading) {
    return (
      <>
        {showPreloader && <ChatLibraryPreloader exiting={preloaderExiting} />}
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-rose-400" />
          </div>
          <p className="text-sm font-medium text-slate-600 mb-1">Unable to load Chat Library</p>
          <p className="text-xs text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {showPreloader && <ChatLibraryPreloader exiting={preloaderExiting} />}
      <div className={`min-h-screen bg-slate-50 flex flex-col ${contentRevealed ? 'vp-preloader-content-reveal' : 'opacity-0'}`}>
      {/* Header stripe - light blue, ~50% lighter than the bottom nav */}
      <header className="vp-header cl-header-no-backdrop sticky top-0 z-30 border-b border-indigo-400/20">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center">
          <div className="vp-logo-wrap relative">
            <div className="vp-logo-glow" />
            <img
              src={LOGO_URL}
              alt="VirgoPlay"
              className="relative vp-logo-img h-10 w-auto object-contain"
            />
        </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-12">
        {/* Full-width banner — 3D card presentation */}
        <div className="w-full px-4 pt-4">
          <div className="cl-banner-3d-wrap max-w-3xl mx-auto">
            <div className="cl-banner-3d-card">
              <img
                src={BANNER_URL}
                alt="VirgoPlay Chat Library"
                className="w-full block cl-banner-3d-img"
              />
              <div className="cl-banner-3d-highlight" />
              <div className="cl-banner-3d-edge-left" />
              <div className="cl-banner-3d-edge-right" />
            </div>
          </div>
        </div>

        {session && (
          <div className="max-w-2xl mx-auto px-5 mt-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 flex items-start gap-3">
              <span className="text-lg leading-none flex-shrink-0 mt-0.5">🔒</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Creator account active</p>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                  You are currently signed in as a creator in this browser. To see the complete public Chat Library, including other creators&rsquo; characters, names, and role images, please log out of your creator account in this browser and refresh the page.
                </p>
                <p className="text-xs text-amber-600 mt-1.5">
                  Once logged out, you&rsquo;ll see the Chat Library exactly as a public visitor.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto px-5 pt-6">
          {/* Character section heading */}
          <div className="flex items-center gap-3 mb-5">
            <TypingBubble />
            <div>
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">Who Will You Meet?</h2>
              <p className="text-sm text-slate-400 mt-1">Different personalities. Different worlds. One conversation away.</p>
            </div>
          </div>

          {listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-medium text-slate-500 mb-1">No chats available yet</p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
                Check back soon — new characters will appear here as creators list them.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {listings.map((listing) => (
                <button
                  key={`${listing.creator_id}-${listing.role_id}`}
                  onClick={() => handleCardClick(listing.creator_id, listing.role_id)}
                  className="cl-card group flex flex-col rounded-2xl border border-slate-200/70 bg-white shadow-sm hover:shadow-md hover:border-violet-200 transition-all duration-200 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 animate-fade-in overflow-hidden"
                >
                  {/* Top section: image (left) + identity (right) */}
                  <div className="flex items-stretch">
                    {/* Role image — fixed 9:16 aspect ratio */}
                    <div className="flex-shrink-0 p-2">
                      {listing.role_image_url ? (
                        <img
                          src={listing.role_image_url}
                          alt={listing.role_name}
                          className="w-[60px] aspect-[9/16] rounded-lg object-cover cursor-zoom-in"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEnlargedImageUrl(listing.role_image_url);
                          }}
                        />
                      ) : (
                        <div className="w-[60px] aspect-[9/16] rounded-lg bg-slate-50 flex items-center justify-center">
                          <MessageSquare className="w-6 h-6 text-slate-300" />
                        </div>
                      )}
                    </div>
                    {/* Character name + role name + online indicator */}
                    <div className="min-w-0 flex-1 py-2.5 flex flex-col justify-center gap-0.5">
                      <div className="text-sm font-bold text-slate-800 truncate">
                        {formatCharacterLabel(listing.character_name, listing.character_age, listing.character_country)}
                      </div>
                      <div className="text-xs font-medium text-violet-500 truncate">
                        {listing.role_name}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="online-dot inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">Online now</span>
                      </div>
                    </div>
                    {/* Like count + arrow */}
                    <div className="flex flex-col items-center justify-between gap-1 flex-shrink-0 py-2.5 pr-3">
                      <div className="flex items-center gap-0.5 text-xs text-slate-400">
                        <span>{listing.like_count}</span>
                        <Heart className="w-3 h-3 text-pink-400" />
                      </div>
                      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-violet-50 border border-violet-200 group-hover:bg-violet-500 group-hover:border-violet-500 transition-all duration-200">
                        <ArrowRight className="w-4 h-4 text-violet-500 group-hover:text-white transition-colors duration-200" />
                      </div>
                    </div>
                  </div>
                  {/* Description section — full card width, below the image/identity row */}
                  {listing.role_description && (
                    <div className="px-4 pb-3 pt-1">
                      <div className="cl-desc text-xs text-slate-600 leading-relaxed line-clamp-4">
                        {highlightKeywords(listing.role_description)}
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Character reveal section */}
          <CharacterReveal listings={listings} />

          {/* Promotional callout footer */}
          <div className="mt-8 rounded-3xl bg-violet-50/80 px-6 py-8 sm:px-10 sm:py-10">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              {/* Left: sparkle + heading + supporting text */}
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="pt-1">
                  <SparkleCluster />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight leading-tight">
                    So many personalities.<br />
                    What&rsquo;s your fantasy?
                  </h2>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                    Start a conversation and see where it goes...
                  </p>
                </div>
              </div>

              {/* Right: handwritten script */}
              <div className="flex-shrink-0 text-left sm:text-right">
                <div
                  className="text-3xl sm:text-4xl leading-none text-violet-500"
                  style={{ fontFamily: '"Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive', fontStyle: 'italic', fontWeight: 400 }}
                >
                  Play
                </div>
                <div
                  className="text-3xl sm:text-4xl leading-tight text-violet-500 mt-1"
                  style={{ fontFamily: '"Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive', fontStyle: 'italic', fontWeight: 400 }}
                >
                  Your Way <span className="text-pink-400">&hearts;</span>
                </div>
              </div>
            </div>
          </div>

          {/* Live Platform Activity — animated particle sphere + scroll-triggered counters */}
          <LivePlatformActivity />

          {/* Website footer */}
          <footer className="mt-8 pb-8 text-center">
            <div className="text-xs text-slate-400 leading-relaxed">
              VirgoPlay
            </div>
            <div className="text-[11px] text-slate-300 mt-3">
              18+ Only&nbsp;&nbsp;&bull;&nbsp;&nbsp;AI Experience
            </div>
          </footer>
        </div>
      </main>
    </div>

      {enlargedImageUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 animate-fade-in"
          onClick={() => setEnlargedImageUrl(null)}
        >
          <div
            className="p-1.5 rounded-xl bg-white/10 border border-white/15 shadow-2xl animate-fade-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={enlargedImageUrl}
              alt=""
              className="w-[144px] aspect-[9/16] rounded-lg object-cover"
            />
          </div>
        </div>
      )}
    </>
  );
}
