import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Shield, Globe, ArrowRight, Users, TrendingUp, Star } from 'lucide-react';
import ConsentGate, { hasConsent } from '../components/ConsentGate';

const FEATURES = [
  {
    icon: Zap,
    title: 'AI-Powered Chat',
    desc: 'Deploy a personalised AI that embodies your voice, expertise, and personality — available 24/7 for your audience.',
  },
  {
    icon: Shield,
    title: 'Verified Identity',
    desc: 'Government-ID verification ensures every creator on the platform is legitimate and trustworthy.',
  },
  {
    icon: Globe,
    title: 'Personal Portal URL',
    desc: 'Get a unique public URL at creator/your-handle — fully customisable and shareable with your community.',
  },
];

const STATS = [
  { label: 'Active Creators', value: '12,000+', icon: Users },
  { label: 'Avg Engagement',  value: '4.8x',    icon: TrendingUp },
  { label: 'Satisfaction',    value: '98%',      icon: Star },
];

export default function LandingPage() {
  const [consentAccepted, setConsentAccepted] = useState(hasConsent());

  if (!consentAccepted) {
    return <ConsentGate onAccept={() => setConsentAccepted(true)} />;
  }

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Nav */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-surface-800/60 bg-surface-950/80 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shadow-lg">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-semibold text-surface-50">Creator Portal AI</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link to="/login"    className="btn-secondary text-sm px-4 py-2">Sign In</Link>
            <Link to="/register" className="btn-primary  text-sm px-4 py-2">Get Started</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-36 pb-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Glow */}
        <div className="absolute inset-0 flex items-start justify-center pointer-events-none" aria-hidden>
          <div className="w-[600px] h-[400px] bg-primary-600/10 rounded-full blur-3xl mt-16" />
        </div>

        <div className="relative mx-auto max-w-4xl text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-xs font-medium mb-8">
            <Zap className="w-3 h-3" />
            AI-Powered Creator Monetisation Platform
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-surface-50 tracking-tight leading-[1.1] mb-6">
            Your Audience.{' '}
            <span className="bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">
              Your AI.
            </span>
            <br />
            Your Portal.
          </h1>

          <p className="text-lg sm:text-xl text-surface-400 max-w-2xl mx-auto leading-relaxed mb-10">
            Build a personalised AI chat experience for your fans. Verify your identity, configure your AI persona, and share your unique public portal URL.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register" className="btn-primary  text-base px-8 py-3.5 rounded-xl">
              Create Your Portal <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/login"    className="btn-secondary text-base px-8 py-3.5 rounded-xl">
              Sign In
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="relative mx-auto max-w-3xl mt-20 grid grid-cols-1 sm:grid-cols-3 gap-5 animate-slide-up">
          {STATS.map(({ label, value, icon: Icon }) => (
            <div key={label} className="card text-center">
              <Icon className="w-5 h-5 text-primary-400 mx-auto mb-3" />
              <div className="text-3xl font-bold text-surface-50 mb-1">{value}</div>
              <div className="text-sm text-surface-400">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 border-t border-surface-800">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-50 mb-4">
              Everything you need to scale
            </h2>
            <p className="text-surface-400 text-lg max-w-xl mx-auto">
              From identity verification to AI personality config — we handle the platform, you handle the content.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="card-hover group">
                <div className="w-10 h-10 rounded-lg bg-primary-600/10 border border-primary-600/20 flex items-center justify-center mb-5 group-hover:bg-primary-600/20 transition-colors">
                  <Icon className="w-5 h-5 text-primary-400" />
                </div>
                <h3 className="text-lg font-semibold text-surface-50 mb-2">{title}</h3>
                <p className="text-surface-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 border-t border-surface-800">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-surface-50 mb-4">
            Ready to launch your AI portal?
          </h2>
          <p className="text-surface-400 mb-8">
            Join thousands of creators monetising their expertise with AI-powered fan engagement.
          </p>
          <Link to="/register" className="btn-primary text-base px-10 py-3.5 rounded-xl">
            Start Free Today <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-surface-800 py-8 px-4">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary-600 flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-medium text-surface-400">Creator Portal AI</span>
          </div>
          <p className="text-xs text-surface-600">
            &copy; {new Date().getFullYear()} Creator Portal AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
