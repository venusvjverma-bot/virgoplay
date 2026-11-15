import { Link } from 'react-router-dom';
import { supabaseUrl } from '../../lib/supabase';

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
              VirgoPlay is an 18+ interactive roleplay platform built around <span style={{ color: GREEN, fontWeight: 600 }}>imagination</span>, <span style={{ color: GREEN, fontWeight: 600 }}>storytelling</span>, and <span style={{ color: GREEN, fontWeight: 600 }}>personalized experiences</span>. We bring together people who enjoy exploring fictional scenarios and creators who want to develop, publish, and share their own roleplays.
            </P>
            <P>
              Whether you are looking for an interesting conversation, a new storyline, or an opportunity to turn your creativity into a digital product, VirgoPlay offers a space to explore those possibilities.
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
              Create, Publish and <span style={{ color: GREEN }}>Earn</span>
            </H2>
            <P>
              VirgoPlay gives creators an opportunity to turn their ideas into interactive roleplay experiences. Creators can develop original scenarios, publish their roles in the library, and make their work available to an audience.
            </P>
            <P>
              Publishing roles can open up earning opportunities through eligible roleplay activity under the platform's monetization rules. Creators can expand their collections, experiment with different story concepts, and discover what audiences enjoy.
            </P>
            <P>
              Our vision is to help creators build more than individual roleplays: we want to support the development of collections that can grow alongside their audience.
            </P>
            <p className="text-sm leading-relaxed italic" style={{ color: SLATE }}>
              Earnings are not guaranteed and depend on the platform's applicable monetization model and activity.
            </p>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>
              Your <span style={{ color: GREEN }}>Ideas</span> Can Shape the Library
            </H2>
            <P>
              Great roleplays can begin with a simple suggestion. We want to make room for new ideas, fresh relationships, different scenarios, and creative directions that expand the library.
            </P>
            <P>
              Suggestions can help inspire new roleplay concepts and give creators ideas for what to develop next. Our aim is to keep the platform evolving through creativity, experimentation, and a growing variety of experiences.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>
              <span style={{ color: GREEN }}>Customized Adult AI Bots</span> for Creators
            </H2>
            <P>
              Beyond the public roleplay library, our broader vision includes helping creators build customized adult AI bots tailored to their preferred identity, personality, conversational style, and content direction.
            </P>
            <P>
              We aim to support creators who want to develop their own customized AI experiences and use them across different digital platforms, subject to each platform's capabilities, policies, and requirements.
            </P>
            <P>
              The goal is to give creators greater flexibility over how they develop and present their digital presence, while making the creation process more accessible and manageable.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>
              Our <span style={{ color: GREEN }}>Mission</span>
            </H2>
            <P>
              Our mission is to build a creative ecosystem for adult interactive storytelling — one that connects roleplay enthusiasts, independent creators, and customized AI experiences.
            </P>
            <P>
              We want to make it easier for people to discover engaging roleplays, suggest new ideas, and explore different scenarios. We also aim to give creators opportunities to publish more roles, grow their collections, and earn through eligible activity.
            </P>
            <P>
              As the platform evolves, our vision extends beyond the library: helping creators develop customized adult AI bots for different platforms and giving their creative work more ways to reach an audience.
            </P>
            <P>
              We believe that imagination should have room to grow, that creative ideas deserve opportunities to be explored, and that interactive storytelling can offer new possibilities for both audiences and creators.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>
              Our <span style={{ color: GREEN }}>Commitment</span>
            </H2>
            <P>
              VirgoPlay is intended exclusively for adults aged 18 and over. Roleplays are fictional and designed for entertainment. Users and creators must follow applicable laws, platform rules, and relevant content requirements.
            </P>
            <P>
              We aim to build an experience that values creativity, clear expectations, and responsible participation.
            </P>
          </section>

          <Divider />

          {/* Closing statement */}
          <section className="pt-4 pb-2 text-center">
            <p
              className="font-bold"
              style={{ color: NAVY, fontSize: 'clamp(20px, 4.5vw, 24px)', lineHeight: 1.5 }}
            >
              Explore a story. Share an idea. Create something of your own. Discover{' '}
              <span style={{ color: GREEN }}>VirgoPlay</span>.
            </p>
          </section>
        </div>
      </main>

      {/* Website footer */}
      <footer className="pb-8 pt-4 text-center">
        <div className="text-xs text-slate-400 leading-relaxed">
          VirgoPlay&nbsp;&nbsp;&bull;&nbsp;&nbsp;Terms &amp; Conditions
        </div>
        <div className="text-xs text-slate-400 leading-relaxed mt-1">
          Privacy Policy&nbsp;&nbsp;&bull;&nbsp;&nbsp;Help &amp; Support
        </div>
        <div className="text-[11px] text-slate-300 mt-3">
          18+ Only&nbsp;&nbsp;&bull;&nbsp;&nbsp;AI Experience
        </div>
      </footer>
    </div>
  );
}
