import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Check, X, Sparkles, User, MessageCircle, Share2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import AgeConfirmationModal, { hasAgeConfirmation } from '../../components/AgeConfirmationModal';
import RobotMascot from '../../components/RobotMascot';

const TAG = '[RegisterPage]';

const COUNTRIES = [
  'United States','United Kingdom','Canada','Australia','Germany','France',
  'India','Brazil','Mexico','Spain','Italy','Netherlands','Sweden','Norway',
  'Denmark','Japan','South Korea','Singapore','Philippines','Nigeria','South Africa','Other',
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [ageConfirmed, setAgeConfirmed] = useState(hasAgeConfirmation);
  const [form, setForm] = useState({
    email: '', username: '', password: '', confirmPassword: '', country: '', terms: false,
    fullName: '', dob: '', ageConfirm: false,
  });
  const [showPw, setShowPw]       = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [pwTouched, setPwTouched]       = useState(false);
  const [confirmPwTouched, setConfirmPwTouched] = useState(false);

  const hasMinLen   = form.password.length >= 8;
  const hasUppercase = /[A-Z]/.test(form.password);
  const hasNumber    = /[0-9]/.test(form.password);
  const passwordsMatch = form.password.length > 0 && form.password === form.confirmPassword;
  const pwValid = hasMinLen && hasUppercase && hasNumber && passwordsMatch;

  function upd(k: string, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }));
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim())     { setError('Please enter your full name.'); return; }
    if (!form.dob)                  { setError('Please select your date of birth.'); return; }
    if (!form.terms)                { setError('You must accept the Terms of Service.'); return; }
    if (!form.ageConfirm)           { setError('You must confirm that you are 18 years old or older.'); return; }
    if (!hasMinLen)    { setError('Password must be at least 8 characters.'); return; }
    if (!hasUppercase) { setError('Password must contain at least 1 uppercase letter.'); return; }
    if (!hasNumber)    { setError('Password must contain at least 1 numeric digit.'); return; }
    if (!passwordsMatch) { setError('Passwords do not match.'); return; }
    if (!/^[a-z0-9_-]{3,30}$/.test(form.username)) {
      setError('Username: 3–30 chars — lowercase letters, numbers, _ or -');
      return;
    }
    setLoading(true);
    console.log(TAG, 'submit start — email=', form.email, 'username=', form.username);

    // Check username availability
    console.log(TAG, 'checking username availability…');
    const { data: existing } = await supabase
      .from('creators').select('id').eq('username', form.username).maybeSingle();
    if (existing) {
      console.warn(TAG, 'username taken');
      setError('That username is already taken.');
      setLoading(false);
      return;
    }
    console.log(TAG, 'username available');

    // Create Supabase auth user
    console.log(TAG, 'calling supabase.auth.signUp…');
    const { data: auth, error: authErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });
    console.log(TAG, 'signUp result — user=', auth?.user?.id ?? 'null', 'error=', authErr?.message ?? 'none');

    if (authErr || !auth.user) {
      setError(authErr?.message ?? 'Registration failed. Please try again.');
      setLoading(false);
      return;
    }

    const uid      = auth.user.id;
    const email    = form.email.toLowerCase().trim();
    const username = form.username.toLowerCase().trim();

    // Insert creators row
    console.log(TAG, 'inserting creators row for uid=', uid);
    const { error: creatorErr } = await supabase.from('creators').insert({
      id: uid, email, username,
      country: form.country,
      role: 'creator',
      verification_status: 'draft',
      full_name: form.fullName.trim(),
      dob: form.dob,
    });
    console.log(TAG, 'creators insert result — error=', creatorErr?.message ?? 'none');

    if (creatorErr) {
      setError(creatorErr.message);
      setLoading(false);
      return;
    }

    // Auto-create creator_profiles row
    console.log(TAG, 'upserting creator_profiles row…');
    const { error: profileErr } = await supabase.from('creator_profiles').upsert({
      creator_id: uid,
      display_name: username,
      bio: '',
      welcome_message: 'Hey! Ask me anything.',
      ai_personality: '',
      ai_system_prompt: '',
    }, { onConflict: 'creator_id' });
    console.log(TAG, 'creator_profiles upsert result — error=', profileErr?.message ?? 'none');

    console.log(TAG, 'all inserts done — navigating to /verification-upload');
    navigate('/verification-upload');
  }

  return (
    <div className="relative min-h-screen bg-surface-950 flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
      {/* Brand logo — top-left, same as Login page */}
      <div className="absolute top-6 left-6 z-20">
        <img
          src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/login-assets/login-logo.png`}
          alt="VirgoPlay"
          className="h-[60px] w-auto object-contain"
          style={{ background: 'transparent' }}
        />
      </div>

      <div className="w-full max-w-md animate-slide-up relative z-10">
        <div className="flex flex-col items-center justify-center gap-3 mb-8">
          <RobotMascot size={56} />
          <div className="text-center">
            <h1 className="text-xl font-semibold text-surface-50">Create your own AI</h1>
            <p className="text-sm text-surface-400 mt-1">Build your AI. Share it. Earn from it.</p>
          </div>
        </div>

        <div className="card">
          <h1 className="text-2xl font-bold text-surface-50 mb-1">Create an account</h1>
          <p className="text-sm text-surface-400 mb-6">Join thousands of creators on the platform.</p>

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm mb-5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full name</label>
              <input type="text" required className="input-field" placeholder="Jane Doe"
                value={form.fullName} onChange={e => upd('fullName', e.target.value)} />
              <p className="mt-1.5 text-xs text-surface-500">
                Your full name is kept private in our database and is not displayed publicly.
              </p>
            </div>

            <div>
              <label className="label">Email address</label>
              <input type="email" required className="input-field" placeholder="you@example.com"
                value={form.email} onChange={e => upd('email', e.target.value)} />
            </div>

            <div>
              <label className="label">Username</label>
              <input type="text" required className="input-field" placeholder="your_handle"
                value={form.username} onChange={e => upd('username', e.target.value.toLowerCase())} />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} required className="input-field pr-10"
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={e => { upd('password', e.target.value); setPwTouched(true); }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pwTouched && (
                <ul className="mt-2 space-y-1">
                  <li className={`flex items-center gap-1.5 text-xs ${hasMinLen ? 'text-success-400' : 'text-surface-500'}`}>
                    {hasMinLen ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    At least 8 characters
                  </li>
                  <li className={`flex items-center gap-1.5 text-xs ${hasUppercase ? 'text-success-400' : 'text-surface-500'}`}>
                    {hasUppercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    At least 1 uppercase letter
                  </li>
                  <li className={`flex items-center gap-1.5 text-xs ${hasNumber ? 'text-success-400' : 'text-surface-500'}`}>
                    {hasNumber ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    At least 1 numeric digit
                  </li>
                </ul>
              )}
            </div>

            <div>
              <label className="label">Re-enter password</label>
              <div className="relative">
                <input
                  type={showConfirmPw ? 'text' : 'password'} required className="input-field pr-10"
                  placeholder="Re-enter your password"
                  value={form.confirmPassword}
                  onChange={e => { upd('confirmPassword', e.target.value); setConfirmPwTouched(true); }}
                />
                <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors">
                  {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPwTouched && form.confirmPassword.length > 0 && !passwordsMatch && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-danger-400">
                  <X className="w-3 h-3" />
                  Passwords do not match
                </p>
              )}
              {confirmPwTouched && passwordsMatch && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-success-400">
                  <Check className="w-3 h-3" />
                  Passwords match
                </p>
              )}
            </div>

            <div>
              <label className="label">Date of birth</label>
              <input type="date" required className="input-field"
                value={form.dob} onChange={e => upd('dob', e.target.value)}
                max={new Date().toISOString().split('T')[0]} />
              <p className="mt-1.5 text-xs text-surface-500">
                Your date of birth is kept private in our database and is not displayed publicly.
              </p>
            </div>

            <div>
              <label className="label">Country</label>
              <select required className="input-field" value={form.country}
                onChange={e => upd('country', e.target.value)}>
                <option value="" disabled>Select your country</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="flex items-start gap-3 pt-1">
              <input id="terms" type="checkbox" checked={form.terms}
                onChange={e => upd('terms', e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-600 cursor-pointer" />
              <label htmlFor="terms" className="text-sm text-surface-400 cursor-pointer leading-relaxed">
                I agree to the{' '}
                <span className="text-primary-400 hover:text-primary-300 transition-colors">Terms of Service</span>
                {' '}and{' '}
                <span className="text-primary-400 hover:text-primary-300 transition-colors">Privacy Policy</span>
              </label>
            </div>

            <div className="flex items-start gap-3 pt-1">
              <input id="ageConfirm" type="checkbox" checked={form.ageConfirm}
                onChange={e => upd('ageConfirm', e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-600 cursor-pointer" />
              <label htmlFor="ageConfirm" className="text-sm text-surface-400 cursor-pointer leading-relaxed">
                I confirm that I am 18 years old or older.
              </label>
            </div>

            <button type="submit" disabled={loading || !pwValid} className="btn-primary w-full py-3 mt-2">
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-surface-400 mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        {/* Creator information section */}
        <div className="mt-10 space-y-8">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-surface-100">Your AI. Your way.</h2>
            <p className="text-sm text-surface-400 mt-2 leading-relaxed">
              Create your character, choose how they interact, and share your experience with your audience.
            </p>
          </div>

          <div className="space-y-6">
            {[
              { icon: Sparkles, title: 'Your AI character', desc: 'Select an existing character or create your own.' },
              { icon: User, title: 'Your roles', desc: 'Choose from available role-play options and give your character different ways to interact.' },
              { icon: MessageCircle, title: 'Your AI knows how to chat', desc: 'Your AI character responds naturally and stays true to the personality you create.' },
              { icon: Share2, title: 'Share & earn', desc: 'Share your public link with your audience. When clients interact and unlock content, you can earn from your activity.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary-600/15 border border-primary-500/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary-300" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-surface-200 mb-1">{title}</h3>
                  <p className="text-sm text-surface-400 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-surface-500 italic">
            Create your AI. Share it. See where it goes.
          </p>
        </div>
      </div>
      {!ageConfirmed && <AgeConfirmationModal onConfirm={() => setAgeConfirmed(true)} />}
    </div>
  );
}
