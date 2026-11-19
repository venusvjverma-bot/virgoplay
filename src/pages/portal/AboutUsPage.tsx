import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabaseUrl } from '../../lib/supabase';
import HelpSupportModal from '../../components/HelpSupportModal';

const LOGO_URL = `${supabaseUrl}/storage/v1/object/public/login-assets/logo-2.png`;

const PURPLE = '#7C3AED';
const GREEN = '#35D6A0';
const NAVY = '#111827';
const SLATE = '#475569';

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-bold" style={{ color: NAVY, fontSize: 20, lineHeight: 1.3 }}>
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: SLATE, fontSize: 16, lineHeight: 1.7 }}>
      {children}
    </p>
  );
}

function Divider() {
  return (
    <div className="flex justify-center py-2" aria-hidden="true">
      <div
        className="h-[2px] w-[60px] rounded-full"
        style={{ background: `linear-gradient(90deg, transparent, ${PURPLE}, transparent)`, boxShadow: `0 0 8px ${PURPLE}66` }}
      />
    </div>
  );
}

export default function AboutUsPage() {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header — same component behavior as the Public Chat Library page */}
      <header className="vp-header sticky top-0 z-30 border-b border-indigo-400/20 shadow-md shadow-indigo-900/15">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center">
          <Link to="/chat-library" aria-label="VirgoPlay home">
            <div className="vp-logo-wrap relative">
              <div className="vp-logo-glow" />
              <img
                src={LOGO_URL}
                alt="VirgoPlay"
                className="relative vp-logo-img h-10 w-auto object-contain"
              />
            </div>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-5 pt-10 pb-16">
        <div className="text-center">
          <h1 className="font-bold" style={{ color: NAVY, fontSize: 32, lineHeight: 1.2 }}>
            About <span style={{ color: GREEN }}>VirgoPlay</span>
          </h1>
        </div>

        <div className="mt-10 space-y-6">
          <section className="space-y-4">
            <P>
              Virgo Imagination operates VirgoPlay, an 18+ interactive roleplay experience built around <span style={{ color: GREEN, fontWeight: 600 }}>imagination</span>, <span style={{ color: GREEN, fontWeight: 600 }}>storytelling</span>, and engaging conversations.
            </P>
            <P>
              VirgoPlay brings together a collection of fictional roleplay experiences for adults who enjoy exploring characters, scenarios, and stories through interactive conversations.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>
              Explore the <span style={{ color: GREEN }}>Public Chat Library</span>
            </H2>
            <P>
              Discover a growing collection of roleplays featuring different personalities, relationships, scenarios, and storylines. Choose a roleplay that interests you and start chatting directly through our Public Chat Library, without creating an account.
            </P>
            <P>
              Every roleplay offers a different experience. You can explore a storyline, shape the conversation through your responses, and discover how the interaction develops. The aim is to make starting a conversation simple and allow you to focus on the experience itself.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>
              <span style={{ color: GREEN }}>Stories</span> That Unfold Naturally
            </H2>
            <P>
              Roleplay is about more than words. Visual elements can add atmosphere and context to a scenario, helping each interaction feel more immersive.
            </P>
            <P>
              Supporting images and videos are prepared in advance and revealed at the appropriate moments as you progress through a roleplay. This allows visual content to follow the scenario rather than appear randomly, creating a more structured and consistent experience.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>
              Our <span style={{ color: GREEN }}>Mission</span>
            </H2>
            <P>
              Our mission is to make interactive fictional storytelling easy to discover and enjoyable to explore. We want to offer adults a varied library of roleplay experiences where conversations can develop naturally and every story has its own character.
            </P>
            <P>
              We continue to develop VirgoPlay with a focus on accessible conversations, engaging storytelling, and a clear experience for the people who use it.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>
              Our <span style={{ color: GREEN }}>Commitment</span>
            </H2>
            <P>
              VirgoPlay is intended exclusively for adults aged 18 and over. Roleplays are fictional and designed for entertainment. Users must follow applicable laws and the platform's terms and content rules.
            </P>
            <P>
              We aim to provide a clear, reliable experience and to keep improving the platform responsibly.
            </P>
          </section>

          <Divider />

          {/* Closing statement */}
          <section className="pt-4 pb-2 text-center">
            <p
              className="font-bold"
              style={{ color: NAVY, fontSize: 'clamp(20px, 4.5vw, 24px)', lineHeight: 1.5 }}
            >
              Explore a story. Discover <span style={{ color: GREEN }}>VirgoPlay</span>.
            </p>
          </section>
        </div>
      </main>

      {/* Website footer */}
      <footer className="pb-8 pt-4 text-center">
        <div className="text-xs text-slate-400 leading-relaxed flex items-center justify-center gap-2">
          <Link to="/terms-of-service" className="hover:text-slate-600 transition-colors">Terms &amp; Conditions</Link>
          <span aria-hidden="true">&bull;</span>
          <Link to="/privacy-policy" className="hover:text-slate-600 transition-colors">Privacy Policy</Link>
        </div>
        <div className="text-xs text-slate-400 leading-relaxed mt-1">
          <button type="button" onClick={() => setIsHelpOpen(true)} className="hover:text-slate-600 transition-colors">
            Help &amp; Support
          </button>
        </div>
        <div className="text-[11px] text-slate-300 mt-3">
          18+ Only&nbsp;&nbsp;&bull;&nbsp;&nbsp;AI Experience
        </div>
      </footer>

      {isHelpOpen && <HelpSupportModal onClose={() => setIsHelpOpen(false)} />}
    </div>
  );
}
