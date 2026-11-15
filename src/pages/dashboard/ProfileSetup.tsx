import { useState } from 'react';
import { Save, User, Link2, AlertCircle, CheckCircle, Tag, Sparkles, Briefcase, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { CreatorProfile } from '../../types';

interface Props {
  profile: CreatorProfile | null;
  onSaved: () => void;
}

const CATEGORIES = [
  'AI GFE',
  'AI Wife',
  'Romantic Partner',
  'Roleplay Specialist',
  'Dominant Persona',
];

const PERSONALITY_TRAITS = [
  'Romantic',
  'Affectionate',
  'Playful',
  'Teasing',
  'Dominant',
  'Mysterious',
];

const SERVICES_OFFERED = [
  'Text Chat',
  'Romantic Conversation',
  'Fantasy Roleplay',
  'Relationship Experience',
  'Personalized Greetings',
  'AI Image Generation',
  'AI Story Images',
];

function toggle(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
}

export default function ProfileSetup({ profile, onSaved }: Props) {
  const { creator } = useAuth();

  const [form, setForm] = useState({
    display_name:     profile?.display_name     ?? '',
    bio:              profile?.bio              ?? '',
    welcome_message:  profile?.welcome_message  ?? 'Hey! Ask me anything.',
  });

  const [categories,        setCategories]       = useState<string[]>(profile?.categories        ?? []);
  const [personalityTraits, setPersonalityTraits] = useState<string[]>(profile?.personality_traits ?? []);
  const [servicesOffered,   setServicesOffered]   = useState<string[]>(profile?.services_offered   ?? []);

  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    profile?.avatar_url
      ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_url).data.publicUrl
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [saved,   setSaved]   = useState(false);

  function upd(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    setError(''); setSaved(false);
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.display_name.trim()) { setError('Display name is required.'); return; }
    setLoading(true); setError('');

    try {
      let avatar_url = profile?.avatar_url ?? null;

      if (avatarFile) {
        const ext  = avatarFile.name.split('.').pop();
        const path = `${creator!.id}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('avatars').upload(path, avatarFile, { upsert: true });
        if (upErr) throw new Error(upErr.message);
        avatar_url = path;
      }

      const payload = {
        ...form,
        avatar_url,
        categories,
        personality_traits: personalityTraits,
        services_offered:   servicesOffered,
      };

      if (profile) {
        const { error: e } = await supabase.from('creator_profiles')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', profile.id);
        if (e) throw new Error(e.message);
      } else {
        const { error: e } = await supabase.from('creator_profiles')
          .insert({ ...payload, creator_id: creator!.id });
        if (e) throw new Error(e.message);
      }

      setSaved(true);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setLoading(false);
    }
  }

  const portalUrl = `${window.location.origin}/creator/${creator?.username}`;

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h2 className="page-header">Profile &amp; AI</h2>
        <p className="text-sm text-surface-400 mt-1">Configure your public profile and portal settings.</p>
      </div>

      {/* Portal URL banner */}
      <div className="card border-primary-500/20 bg-primary-500/5">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-4 h-4 text-primary-400" />
          <span className="text-sm font-medium text-primary-400">Your Personal Portal URL</span>
        </div>
        <div className="flex items-center gap-3 bg-surface-900 border border-surface-700 rounded-lg px-4 py-2.5">
          <code className="text-sm text-surface-200 flex-1 font-mono break-all">{portalUrl}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(portalUrl)}
            className="text-xs text-primary-400 hover:text-primary-300 font-medium whitespace-nowrap transition-colors"
          >
            Copy
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        {saved && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-accent-500/10 border border-accent-500/20 text-accent-400 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />Profile saved successfully!
          </div>
        )}

        {/* ── Public Profile ─────────────────────────────────────────────── */}
        <div className="card space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-primary-400" />
            <span className="text-base font-semibold text-surface-100">Public Profile</span>
          </div>

          {/* Avatar */}
          <div>
            <label className="label">Profile Photo</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-surface-800 border-2 border-surface-700 overflow-hidden flex-shrink-0">
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-surface-500 text-2xl font-bold">
                      {form.display_name[0]?.toUpperCase() ?? '?'}
                    </div>
                }
              </div>
              <label className="btn-secondary cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                Upload Photo
              </label>
            </div>
          </div>

          <div>
            <label className="label">Display Name</label>
            <input type="text" required className="input-field" placeholder="Your public name"
              value={form.display_name} onChange={e => upd('display_name', e.target.value)} />
          </div>

          <div>
            <label className="label">Bio</label>
            <textarea rows={3} className="input-field resize-none"
              placeholder="Tell your audience about yourself..."
              value={form.bio} onChange={e => upd('bio', e.target.value)} />
          </div>
        </div>

        {/* ── Categories ─────────────────────────────────────────────────── */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Tag className="w-4 h-4 text-primary-400" />
            <span className="text-base font-semibold text-surface-100">Categories</span>
          </div>
          <p className="text-xs text-surface-500 -mt-2">
            Select the categories that best describe your AI persona.
          </p>

          <MultiSelect
            options={CATEGORIES}
            selected={categories}
            onChange={setCategories}
            accentClass="bg-primary-500/15 border-primary-500/40 text-primary-300"
            hoverClass="hover:border-primary-500/30 hover:bg-primary-500/5"
          />
        </div>

        {/* ── Personality Traits ─────────────────────────────────────────── */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-primary-400" />
            <span className="text-base font-semibold text-surface-100">Personality Traits</span>
          </div>
          <p className="text-xs text-surface-500 -mt-2">
            Choose the traits that define your AI's personality.
          </p>

          <MultiSelect
            options={PERSONALITY_TRAITS}
            selected={personalityTraits}
            onChange={setPersonalityTraits}
            accentClass="bg-accent-500/15 border-accent-500/40 text-accent-300"
            hoverClass="hover:border-accent-500/30 hover:bg-accent-500/5"
          />
        </div>

        {/* ── Services Offered ───────────────────────────────────────────── */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="w-4 h-4 text-primary-400" />
            <span className="text-base font-semibold text-surface-100">Services Offered</span>
          </div>
          <p className="text-xs text-surface-500 -mt-2">
            Select the services available through your portal.
          </p>

          <MultiSelect
            options={SERVICES_OFFERED}
            selected={servicesOffered}
            onChange={setServicesOffered}
            accentClass="bg-warning-500/15 border-warning-500/40 text-warning-300"
            hoverClass="hover:border-warning-500/30 hover:bg-warning-500/5"
          />
        </div>

        {/* ── Portal Settings ─────────────────────────────────────────────── */}
        <div className="card space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-4 h-4 text-primary-400" />
            <span className="text-base font-semibold text-surface-100">Portal Settings</span>
          </div>

          <div>
            <label className="label">Welcome Message</label>
            <input type="text" className="input-field" placeholder="Hey! Ask me anything."
              value={form.welcome_message} onChange={e => upd('welcome_message', e.target.value)} />
            <p className="text-xs text-surface-500 mt-1.5">Shown at the top of your AI chat portal.</p>
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary">
          <Save className="w-4 h-4" />
          {loading ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}

// ─── Multi-select chip grid ───────────────────────────────────────────────────

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  accentClass: string;
  hoverClass: string;
}

function MultiSelect({ options, selected, onChange, accentClass, hoverClass }: MultiSelectProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(toggle(selected, opt))}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-150 select-none',
              active
                ? accentClass
                : `border-surface-700 bg-surface-800/50 text-surface-400 ${hoverClass}`,
            ].join(' ')}
          >
            {active && (
              <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 12 12" fill="currentColor">
                <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            )}
            {opt}
          </button>
        );
      })}
    </div>
  );
}
