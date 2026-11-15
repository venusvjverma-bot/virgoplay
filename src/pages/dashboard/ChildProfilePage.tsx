import { useState, useEffect, useCallback } from 'react';
import {
  User, Wallet, Sparkles, Save, Plus, ArrowDownToLine, Pencil,
  Loader2, AlertCircle, CheckCircle, Clock,
  Settings, KeyRound, Mail, ChevronRight, ChevronDown, Calendar, X, ShieldAlert,
  RotateCcw, Lock, Check, MessageCircle, PowerOff,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { canUseDevMode, loadSelectedCharacterId, loadMyAiOverride, saveMyAiDisplayName, loadCustomizeAiOverride, saveCustomizeAiDisplayName } from '../../lib/character-studio-v2';
import { loadWallet as fetchWallet, addTestFunds, IMAGE_COST, VIDEO_COST } from '../../lib/wallet';
import type { CreatorProfile } from '../../types';

interface WalletRow {
  id: string;
  available_balance: number;
  total_earnings: number;
}

interface TransactionRow {
  id: string;
  type: string;
  description: string;
  amount: number;
  status: string;
  created_at: string;
}

interface Props {
  profile: CreatorProfile | null;
  onSaved: () => void;
}

export default function ChildProfilePage({ profile, onSaved }: Props) {
  const { creator, signOut } = useAuth();

  const [aboutMe, setAboutMe] = useState(profile?.bio ?? '');
  const [isEditingAbout, setIsEditingAbout] = useState(!profile?.bio);
  const [savingAbout, setSavingAbout] = useState(false);
  const [aboutSaved, setAboutSaved] = useState(false);
  const [aboutError, setAboutError] = useState('');

  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [openDateKey, setOpenDateKey] = useState<string | null | undefined>(undefined);
  const [walletLoading, setWalletLoading] = useState(true);
  const [addingFunds, setAddingFunds] = useState(false);
  const isMotherCreator = canUseDevMode(creator?.email);
  const [showResetPwModal, setShowResetPwModal] = useState(false);
  const [resetPwSending, setResetPwSending] = useState(false);
  const [resetPwError, setResetPwError] = useState('');
  const [resetPwSent, setResetPwSent] = useState(false);
  const [showResetEmailModal, setShowResetEmailModal] = useState(false);

  // My AI Display Name state
  const [myAiSelectedId, setMyAiSelectedId] = useState<string | null>(null);
  const [myAiIsSelectedInStudio, setMyAiIsSelectedInStudio] = useState(false);
  const [myAiLoading, setMyAiLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [displayNameSaved, setDisplayNameSaved] = useState(false);
  const [displayNameError, setDisplayNameError] = useState('');

  // Customize AI Display Name state
  const [customizeAiSelectedId, setCustomizeAiSelectedId] = useState<string | null>(null);
  const [customizeAiLoading, setCustomizeAiLoading] = useState(true);
  const [customizeDisplayName, setCustomizeDisplayName] = useState('');
  const [customizeAiImageUrl, setCustomizeAiImageUrl] = useState<string | null>(null);
  const [customizeAiCharName, setCustomizeAiCharName] = useState<string | null>(null);
  const [customizeAiAge, setCustomizeAiAge] = useState<string | null>(null);
  const [editingCustomizeDisplayName, setEditingCustomizeDisplayName] = useState(false);
  const [savingCustomizeDisplayName, setSavingCustomizeDisplayName] = useState(false);
  const [customizeDisplayNameSaved, setCustomizeDisplayNameSaved] = useState(false);
  const [customizeDisplayNameError, setCustomizeDisplayNameError] = useState('');

  // Deactivate Account state
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deactivateError, setDeactivateError] = useState('');
  const [deactivateDone, setDeactivateDone] = useState(false);

  // Reset Account state
  const [showResetAcctModal, setShowResetAcctModal] = useState(false);
  const [resetAcctStep, setResetAcctStep] = useState<'warning' | 'password' | 'confirm' | 'success'>('warning');
  const [resetAcctConfirmed, setResetAcctConfirmed] = useState(false);
  const [resetAcctPassword, setResetAcctPassword] = useState('');
  const [resetAcctError, setResetAcctError] = useState('');
  const [resetAcctLoading, setResetAcctLoading] = useState(false);

  const loadWallet = useCallback(async () => {
    if (!creator?.id) return;
    setWalletLoading(true);
    try {
      const wal = await fetchWallet(creator.id);
      if (wal) {
        setWallet(wal);
        const { data: txns } = await supabase
          .from('creator_transactions')
          .select('id, type, description, amount, status, created_at')
          .eq('wallet_id', wal.id)
          .order('created_at', { ascending: false })
          .limit(20);
        setTransactions((txns ?? []) as TransactionRow[]);
      }
    } catch {
      // wallet not available yet
    } finally {
      setWalletLoading(false);
    }
  }, [creator?.id]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  // Load My AI selection + display name override
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const selectedId = await loadSelectedCharacterId(creator?.id ?? '');
        if (cancelled) return;
        setMyAiSelectedId(selectedId);
        if (selectedId) {
          const { data: selChar } = await supabase
            .from('character_studio_v2')
            .select('is_my_ai')
            .eq('id', selectedId)
            .maybeSingle();
          if (cancelled) return;
          const isMyAi = !!selChar?.is_my_ai;
          setMyAiIsSelectedInStudio(isMyAi);
          if (isMyAi) {
            const ov = await loadMyAiOverride(selectedId);
            if (cancelled) return;
            setDisplayName(ov?.display_name ?? '');
          }
        }
      } catch {
        // ignore — field stays disabled
      } finally {
        if (!cancelled) setMyAiLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [creator?.id]);

  // Load Customize AI display name override
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Find the Customize AI slot (is_customize_ai = true) from the shared characters
        const { data: customizeChar } = await supabase
          .from('character_studio_v2')
          .select('id, name')
          .eq('is_customize_ai', true)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        const customizeId = customizeChar?.id ?? null;
        setCustomizeAiSelectedId(customizeId);
        setCustomizeAiCharName(customizeChar?.name ?? null);
        if (customizeId) {
          const ov = await loadCustomizeAiOverride(customizeId);
          if (cancelled) return;
          setCustomizeDisplayName(ov?.display_name ?? '');
          setCustomizeAiImageUrl(ov?.selected_image_url ?? ov?.generated_image_url ?? null);
          setCustomizeAiAge(ov?.appearance_data?.age ?? null);
        }
      } catch {
        // ignore — field stays disabled
      } finally {
        if (!cancelled) setCustomizeAiLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [creator?.id]);

  async function handleSaveDisplayName() {
    if (!myAiSelectedId) return;
    setSavingDisplayName(true);
    setDisplayNameError('');
    setDisplayNameSaved(false);
    try {
      await saveMyAiDisplayName(myAiSelectedId, displayName);
      setDisplayNameSaved(true);
      setEditingDisplayName(false);
    } catch (err: unknown) {
      setDisplayNameError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingDisplayName(false);
    }
  }

  async function handleSaveCustomizeDisplayName() {
    if (!customizeAiSelectedId) return;
    setSavingCustomizeDisplayName(true);
    setCustomizeDisplayNameError('');
    setCustomizeDisplayNameSaved(false);
    try {
      await saveCustomizeAiDisplayName(customizeAiSelectedId, customizeDisplayName);
      setCustomizeDisplayNameSaved(true);
      setEditingCustomizeDisplayName(false);
    } catch (err: unknown) {
      setCustomizeDisplayNameError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingCustomizeDisplayName(false);
    }
  }

  async function handleSendResetPw() {
    if (!creator?.email) {
      setResetPwError('No email address found on your account.');
      return;
    }
    setResetPwSending(true);
    setResetPwError('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/send-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          email: creator.email,
          redirect_url: 'https://virgoplay.net/reset-password',
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error ?? `Request failed (${response.status})`);
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error ?? 'Failed to send reset email');
      setResetPwSent(true);
    } catch (e) {
      setResetPwError((e as Error).message);
    } finally {
      setResetPwSending(false);
    }
  }

  function openResetAcctModal() {
    setResetAcctStep('warning');
    setResetAcctConfirmed(false);
    setResetAcctPassword('');
    setResetAcctError('');
    setShowResetAcctModal(true);
  }

  function closeResetAcctModal() {
    if (resetAcctLoading) return;
    setShowResetAcctModal(false);
  }

  async function handleResetAccount() {
    setResetAcctLoading(true);
    setResetAcctError('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('No active session found.');

      const response = await fetch(`${supabaseUrl}/functions/v1/reset-child-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ password: resetAcctPassword }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? `Reset failed (${response.status})`);
      }
      setResetAcctStep('success');
    } catch (e) {
      setResetAcctError((e as Error).message);
      setResetAcctStep('password');
    } finally {
      setResetAcctLoading(false);
    }
  }

  async function handleDeactivate() {
    setDeactivateLoading(true);
    setDeactivateError('');
    try {
      await supabase
        .from('chat_library_listings')
        .delete()
        .eq('creator_id', creator?.id);
      const { error } = await supabase.rpc('self_deactivate');
      if (error) throw error;
      setDeactivateDone(true);
    } catch (e) {
      setDeactivateError((e as Error).message);
    } finally {
      setDeactivateLoading(false);
    }
  }

  function openResetPwModal() {
    setResetPwError('');
    setResetPwSent(false);
    setShowResetPwModal(true);
  }

  async function handleSaveAbout() {
    setSavingAbout(true);
    setAboutError('');
    setAboutSaved(false);
    try {
      if (profile) {
        const { error } = await supabase
          .from('creator_profiles')
          .update({ bio: aboutMe, updated_at: new Date().toISOString() })
          .eq('id', profile.id);
        if (error) throw error;
      }
      setAboutSaved(true);
      setIsEditingAbout(false);
      onSaved();
    } catch (err: unknown) {
      setAboutError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingAbout(false);
    }
  }

  const fmtMoney = (n: number) =>
    `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="fixed inset-0 overflow-y-auto bg-surface-950"
         style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-surface-950/60 to-surface-950" />
      </div>

      <div className="relative z-10 flex flex-col items-center px-6 pt-10 pb-8 min-h-full">
        {/* ── Profile Header ──────────────────────────────────────────── */}
        <div className="relative w-full mb-6">
          <div className="vp-profile-ribbons">
            <svg className="vp-ribbon-svg" viewBox="0 0 1400 280" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="vp-rg1" x1="0%" y1="0%" x2="100%" y2="20%">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
                  <stop offset="25%" stopColor="#3b82f6" stopOpacity="0.7" />
                  <stop offset="55%" stopColor="#8b5cf6" stopOpacity="0.8" />
                  <stop offset="85%" stopColor="#a855f7" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="vp-rg2" x1="0%" y1="30%" x2="100%" y2="50%">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0" />
                  <stop offset="30%" stopColor="#6366f1" stopOpacity="0.6" />
                  <stop offset="60%" stopColor="#a855f7" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="vp-rg3" x1="0%" y1="50%" x2="100%" y2="70%">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
                  <stop offset="35%" stopColor="#8b5cf6" stopOpacity="0.5" />
                  <stop offset="65%" stopColor="#3b82f6" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g className="vp-ribbon-1">
                <path className="vp-ribbon-glow" d="M -500 90 Q -250 45, 0 90 T 500 90 T 1000 90 T 1500 90 T 2000 90" stroke="url(#vp-rg1)" strokeWidth="6" fill="none" />
                <path className="vp-ribbon-line" d="M -500 90 Q -250 45, 0 90 T 500 90 T 1000 90 T 1500 90 T 2000 90" stroke="url(#vp-rg1)" strokeWidth="2" fill="none" />
              </g>
              <g className="vp-ribbon-2">
                <path className="vp-ribbon-glow" d="M -700 130 Q -350 75, 0 130 T 700 130 T 1400 130 T 2100 130" stroke="url(#vp-rg2)" strokeWidth="5" fill="none" />
                <path className="vp-ribbon-line" d="M -700 130 Q -350 75, 0 130 T 700 130 T 1400 130 T 2100 130" stroke="url(#vp-rg2)" strokeWidth="1.5" fill="none" />
              </g>
              <g className="vp-ribbon-3">
                <path className="vp-ribbon-glow" d="M -600 170 Q -300 130, 0 170 T 600 170 T 1200 170 T 1800 170" stroke="url(#vp-rg3)" strokeWidth="4" fill="none" />
                <path className="vp-ribbon-line" d="M -600 170 Q -300 130, 0 170 T 600 170 T 1200 170 T 1800 170" stroke="url(#vp-rg3)" strokeWidth="1.5" fill="none" />
              </g>
            </svg>
          </div>
          <div className="relative z-10 w-full max-w-md mx-auto">
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-surface-900/80 to-surface-950/60 backdrop-blur-md p-6 overflow-hidden">
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary-600/15 border border-primary-500/30 flex items-center justify-center mb-4 shadow-lg shadow-primary-900/20">
                  <User className="w-8 h-8 text-primary-300" />
                </div>
                <h1 className="text-lg font-semibold text-surface-100 tracking-wide mb-1">Profile</h1>
                <p className="text-[11px] text-surface-500 font-medium tracking-wide">
                  {profile?.display_name || creator?.username || '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md flex flex-col gap-4">
          {/* ── Personal Information ───────────────────────────────────── */}
          <div className="rounded-2xl border border-white/8 bg-surface-900/50 backdrop-blur-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-3.5 rounded-full bg-primary-400/60" />
              <div className="text-[10px] font-bold tracking-wider uppercase text-surface-400">Personal Information</div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-[11px] text-surface-500 font-medium">Name</span>
                <span className="text-sm text-white font-medium">
                  {profile?.display_name || creator?.username || '—'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-[11px] text-surface-500 font-medium">Email</span>
                <span className="text-sm text-surface-200 font-medium truncate ml-3 max-w-[180px]">
                  {creator?.email || '—'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-[11px] text-surface-500 font-medium">Age</span>
                <span className="text-sm text-surface-400 italic">Not available</span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-surface-500 font-medium">About Me</span>
                  {!isEditingAbout && (
                    <button
                      onClick={() => { setIsEditingAbout(true); setAboutSaved(false); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold text-primary-300 bg-primary-600/10 border border-primary-500/20 hover:bg-primary-600/20 transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                  )}
                </div>
                {isEditingAbout ? (
                  <div>
                    <textarea
                      rows={3}
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/50 transition-colors resize-none"
                      placeholder="Tell us about yourself..."
                      value={aboutMe}
                      onChange={(e) => { setAboutMe(e.target.value); setAboutSaved(false); }}
                    />
                    {aboutError && (
                      <p className="text-[11px] text-danger-400 mt-1.5 flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3" />{aboutError}
                      </p>
                    )}
                    <div className="flex gap-2 mt-2.5">
                      <button
                        onClick={handleSaveAbout}
                        disabled={savingAbout}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary-600/20 text-primary-300 border border-primary-500/30 hover:bg-primary-600/30 transition-colors disabled:opacity-50"
                      >
                        {savingAbout ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        {savingAbout ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setIsEditingAbout(false); setAboutError(''); }}
                        disabled={savingAbout}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 text-surface-300 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="w-full rounded-lg border border-white/5 bg-black/20 px-3 py-2.5 text-sm text-surface-300 min-h-[60px]">
                      {aboutMe || <span className="text-surface-600 italic">Not set</span>}
                    </div>
                    {aboutSaved && (
                      <p className="text-[11px] text-success-400 mt-1.5 flex items-center gap-1.5">
                        <CheckCircle className="w-3 h-3" />Saved
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── My AI Display Name ─────────────────────────────────────── */}
          <div className={`rounded-2xl border bg-surface-900/50 backdrop-blur-md p-5 transition-opacity ${myAiIsSelectedInStudio ? 'border-primary-500/20' : 'border-white/5 opacity-50'}`}>
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-1 h-3.5 rounded-full ${myAiIsSelectedInStudio ? 'bg-primary-400/60' : 'bg-surface-600'}`} />
              <div className="text-[10px] font-bold tracking-wider uppercase text-surface-400">My AI Display Name</div>
              {myAiIsSelectedInStudio && (
                <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-primary-500/15 text-primary-300 border border-primary-500/20">
                  <Sparkles className="w-2.5 h-2.5" />AI Identity
                </span>
              )}
            </div>

            {myAiLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 text-surface-500 animate-spin" />
              </div>
            ) : !myAiIsSelectedInStudio ? (
              <div className="flex items-center gap-2 py-2">
                <Lock className="w-3.5 h-3.5 text-surface-600 flex-shrink-0" />
                <p className="text-xs text-surface-500 leading-relaxed">
                  Select My AI in Character Studio to set a display name.
                </p>
              </div>
            ) : (
              <div>
                <label className="text-[11px] text-surface-500 mb-1.5 block">Display Name</label>
                {editingDisplayName ? (
                  <input
                    type="text"
                    autoFocus
                    value={displayName}
                    onChange={(e) => { setDisplayName(e.target.value); setDisplayNameSaved(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !savingDisplayName) handleSaveDisplayName(); }}
                    className="w-full rounded-lg border border-primary-500/20 bg-black/30 px-3 py-2.5 text-sm text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/50 transition-colors"
                    placeholder="Enter a display name…"
                  />
                ) : (
                  <div className="w-full rounded-lg border border-white/8 bg-gradient-to-r from-primary-900/15 to-surface-900/20 px-3 py-2.5 text-sm text-surface-200 min-h-[44px]">
                    {displayName || <span className="text-surface-600 italic">Not set</span>}
                  </div>
                )}
                {displayNameError && (
                  <p className="text-[11px] text-danger-400 mt-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3" />{displayNameError}
                  </p>
                )}
                {displayNameSaved && !editingDisplayName && (
                  <p className="text-[11px] text-success-400 mt-1.5 flex items-center gap-1.5">
                    <CheckCircle className="w-3 h-3" />Saved
                  </p>
                )}
                {editingDisplayName ? (
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={handleSaveDisplayName}
                      disabled={savingDisplayName}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary-600/20 text-primary-300 border border-primary-500/30 hover:bg-primary-600/30 transition-colors disabled:opacity-50"
                    >
                      {savingDisplayName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {savingDisplayName ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditingDisplayName(false); setDisplayNameError(''); }}
                      disabled={savingDisplayName}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 text-surface-300 border border-white/10 hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingDisplayName(true); setDisplayNameSaved(false); }}
                    className="mt-2.5 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 text-surface-300 border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Customize AI Display Name ─────────────────────────────── */}
          {(() => {
            const isCustomizeAiSelected = !customizeAiLoading
              && !!customizeAiSelectedId
              && !!myAiSelectedId
              && !myAiLoading
              && myAiSelectedId === customizeAiSelectedId;
            return (
              <div
                className={`rounded-2xl border bg-surface-900/50 backdrop-blur-md p-5 transition-opacity ${isCustomizeAiSelected ? 'border-primary-500/30' : 'border-white/5 opacity-50'}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-1 h-3.5 rounded-full ${isCustomizeAiSelected ? 'bg-primary-400/60' : 'bg-surface-600'}`} />
                    <div className="text-[10px] font-bold tracking-wider uppercase text-surface-400">Customize AI Display Name</div>
                  </div>
                  {isCustomizeAiSelected && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-primary-500/15 text-primary-300 border border-primary-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />Active
                    </span>
                  )}
                </div>
                {!customizeAiLoading && customizeAiSelectedId && (customizeAiImageUrl || customizeAiCharName) && (
                  <div className="flex items-center gap-3.5 mb-4">
                    {customizeAiImageUrl && (
                      <img
                        src={customizeAiImageUrl}
                        alt={customizeAiCharName ?? 'Customize AI'}
                        className="flex-shrink-0 rounded-xl object-cover"
                        style={{ width: '100px', height: '178px' }}
                      />
                    )}
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="text-xl font-bold text-white leading-tight truncate">
                        {customizeAiCharName ?? '—'}
                      </div>
                      <span className="inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[9px] font-semibold bg-white/10 text-surface-300 border border-white/10">
                        Customize AI
                      </span>
                      {customizeAiAge && (
                        <div className="text-[11px] text-surface-400">
                          Age: {customizeAiAge}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {customizeAiLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 text-surface-500 animate-spin" />
                  </div>
                ) : !customizeAiSelectedId ? (
                  <div className="flex items-center gap-2 py-2">
                    <Lock className="w-3.5 h-3.5 text-surface-600 flex-shrink-0" />
                    <p className="text-xs text-surface-500 leading-relaxed">
                      No Customize AI slot found.
                    </p>
                  </div>
                ) : !isCustomizeAiSelected ? (
                  <div className="flex items-center gap-2 py-2">
                    <Lock className="w-3.5 h-3.5 text-surface-600 flex-shrink-0" />
                    <p className="text-xs text-surface-500 leading-relaxed">
                      Select Customize AI in Studio to edit this name.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] text-surface-500 mb-1.5 block">Display Name</label>
                    {editingCustomizeDisplayName ? (
                      <input
                        type="text"
                        autoFocus
                        value={customizeDisplayName}
                        onChange={(e) => { setCustomizeDisplayName(e.target.value); setCustomizeDisplayNameSaved(false); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !savingCustomizeDisplayName) handleSaveCustomizeDisplayName(); }}
                        className="w-full rounded-lg border border-primary-500/20 bg-black/30 px-3 py-2.5 text-sm text-surface-200 placeholder-surface-600 focus:outline-none focus:border-primary-500/50 transition-colors"
                        placeholder="Enter a display name…"
                      />
                    ) : (
                      <div className="w-full rounded-lg border border-white/8 bg-gradient-to-r from-primary-900/15 to-surface-900/20 px-3 py-2.5 text-sm text-surface-200 min-h-[44px]">
                        {customizeDisplayName || <span className="text-surface-600 italic">Not set</span>}
                      </div>
                    )}
                    {customizeDisplayNameError && (
                      <p className="text-[11px] text-danger-400 mt-1.5 flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3" />{customizeDisplayNameError}
                      </p>
                    )}
                    {customizeDisplayNameSaved && !editingCustomizeDisplayName && (
                      <p className="text-[11px] text-success-400 mt-1.5 flex items-center gap-1.5">
                        <CheckCircle className="w-3 h-3" />Saved
                      </p>
                    )}
                    {editingCustomizeDisplayName ? (
                      <div className="flex gap-2 mt-2.5">
                        <button
                          onClick={handleSaveCustomizeDisplayName}
                          disabled={savingCustomizeDisplayName}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary-600/20 text-primary-300 border border-primary-500/30 hover:bg-primary-600/30 transition-colors disabled:opacity-50"
                        >
                          {savingCustomizeDisplayName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          {savingCustomizeDisplayName ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setEditingCustomizeDisplayName(false); setCustomizeDisplayNameError(''); }}
                          disabled={savingCustomizeDisplayName}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 text-surface-300 border border-white/10 hover:bg-white/10 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingCustomizeDisplayName(true); setCustomizeDisplayNameSaved(false); }}
                        className="mt-2.5 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 text-surface-300 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── My AI Setup ────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/8 bg-surface-900/50 backdrop-blur-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-3.5 rounded-full bg-primary-400/60" />
              <div className="text-[10px] font-bold tracking-wider uppercase text-surface-400">My AI Setup</div>
            </div>
            <div className="space-y-2.5">
              {[
                { icon: Sparkles, label: 'Create / Choose AI' },
                { icon: User, label: 'Choose Role' },
                { icon: Clock, label: 'Scene Guide' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 py-3 px-4 rounded-xl border border-white/5 bg-gradient-to-r from-white/[0.04] to-transparent hover:from-white/[0.07] transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-primary-600/10 border border-primary-500/15 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-600/15 transition-colors">
                    <Icon className="w-4 h-4 text-primary-300/80 group-hover:text-primary-300 transition-colors" />
                  </div>
                  <span className="text-sm text-surface-300 font-medium">{label}</span>
                  <ChevronRight className="w-4 h-4 text-surface-600 ml-auto group-hover:text-surface-400 transition-colors" />
                </div>
              ))}
            </div>
          </div>

          {/* ── Wallet ────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/8 bg-surface-900/50 backdrop-blur-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-3.5 rounded-full bg-surface-500/60" />
              <div className="text-[10px] font-bold tracking-wider uppercase text-surface-400">Wallet</div>
            </div>

            {walletLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                    <div className="text-[10px] text-surface-500 mb-1">Available Balance</div>
                    <div className="text-lg font-bold text-white">{fmtMoney(wallet?.available_balance ?? 0)}</div>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                    <div className="text-[10px] text-surface-500 mb-1">Total Earnings</div>
                    <div className="text-lg font-bold text-white flex items-center gap-1.5">
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="8" r="7" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />
                        <circle cx="8" cy="8" r="4.5" fill="none" stroke="#f59e0b" strokeWidth="0.8" opacity="0.45" />
                        <path d="M8 5.2v5.6M6.5 8h3" stroke="#92400e" strokeWidth="1" strokeLinecap="round" />
                      </svg>
                      {(wallet?.total_earnings ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  <button
                    onClick={async () => {
                      if (!wallet || isMotherCreator || addingFunds) return;
                      setAddingFunds(true);
                      try {
                        const updated = await addTestFunds(creator!.id, wallet.id);
                        setWallet(updated);
                        const { data: txns } = await supabase
                          .from('creator_transactions')
                          .select('id, type, description, amount, status, created_at')
                          .eq('wallet_id', wallet.id)
                          .order('created_at', { ascending: false })
                          .limit(20);
                        setTransactions((txns ?? []) as TransactionRow[]);
                      } catch { /* ignore */ } finally {
                        setAddingFunds(false);
                      }
                    }}
                    disabled={isMotherCreator || addingFunds}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-primary-600/20 text-primary-300 border border-primary-500/30 hover:bg-primary-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addingFunds ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {addingFunds ? 'Adding...' : 'Add Balance'}
                  </button>
                  <button className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-white/5 text-surface-300 border border-white/10 hover:bg-white/10 transition-colors">
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                    Withdraw
                  </button>
                </div>

                {!isMotherCreator && (
                  <div className="flex items-center gap-4 mb-5 text-[10px] text-surface-500">
                    <span>Image: ${IMAGE_COST.toFixed(2)}</span>
                    <span>Video: ${VIDEO_COST.toFixed(2)}</span>
                  </div>
                )}

                <div>
                  <div className="text-[11px] font-medium text-surface-500 mb-2">Transaction History</div>
                  {transactions.length === 0 ? (
                    <div className="text-center py-6 text-xs text-surface-600">
                      No transactions yet.
                    </div>
                  ) : (() => {
                    const groups = new Map<string, TransactionRow[]>();
                    for (const tx of transactions) {
                      const key = fmtDate(tx.created_at);
                      const arr = groups.get(key) ?? [];
                      arr.push(tx);
                      groups.set(key, arr);
                    }
                    const dateKeys = Array.from(groups.keys());
                    const initialKey = dateKeys[0] ?? null;
                    const effectiveOpen = openDateKey === undefined ? initialKey : openDateKey;
                    return (
                      <div className="space-y-2">
                        {dateKeys.map((dateKey) => {
                          const groupTx = groups.get(dateKey)!;
                          const isOpen = effectiveOpen === dateKey;
                          return (
                            <div key={dateKey} className="rounded-lg border border-white/5 overflow-hidden">
                              <button
                                onClick={() => setOpenDateKey(isOpen ? null : dateKey)}
                                className="w-full flex items-center justify-between px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                              >
                                <span className="flex items-center gap-2">
                                  <Calendar className="w-3.5 h-3.5 text-surface-500" />
                                  <span className="text-xs font-semibold text-surface-300">{dateKey}</span>
                                  <span className="text-[10px] text-surface-500">({groupTx.length})</span>
                                </span>
                                <ChevronDown
                                  className={`w-3.5 h-3.5 text-surface-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                />
                              </button>
                              {isOpen && (
                                <div className="px-3 pt-1">
                                  {groupTx.map((tx) => (
                                    <div
                                      key={tx.id}
                                      className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs text-surface-200 truncate">{tx.description || '—'}</div>
                                        <div className="text-[10px] text-surface-500 mt-0.5">{fmtDate(tx.created_at)}</div>
                                      </div>
                                      <div className="text-right flex-shrink-0">
                                        <div className={`text-xs font-semibold flex items-center justify-end gap-1 ${tx.type === 'credit' ? 'text-success-400' : 'text-danger-400'}`}>
                                          {tx.type === 'credit' && tx.description.toLowerCase().includes('reveal') ? (
                                            <>
                                              +
                                              <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <circle cx="8" cy="8" r="7" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />
                                                <circle cx="8" cy="8" r="4.5" fill="none" stroke="#f59e0b" strokeWidth="0.8" opacity="0.45" />
                                                <path d="M8 5.2v5.6M6.5 8h3" stroke="#92400e" strokeWidth="1" strokeLinecap="round" />
                                              </svg>
                                              {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </>
                                          ) : (
                                            <>{tx.type === 'credit' ? '+' : '−'}{fmtMoney(tx.amount)}</>
                                          )}
                                        </div>
                                        <div className={`text-[10px] mt-0.5 ${
                                          tx.status === 'completed' ? 'text-success-400' :
                                          tx.status === 'pending' ? 'text-warning-400' : 'text-danger-400'
                                        }`}>
                                          {tx.status}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>

          {/* ── Account Settings ──────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/8 bg-surface-900/50 backdrop-blur-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-3.5 rounded-full bg-surface-500/60" />
              <div className="text-[10px] font-bold tracking-wider uppercase text-surface-400">Account Settings</div>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={openResetPwModal}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-primary-500/25 transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-primary-600/10 border border-primary-500/15 flex items-center justify-center flex-shrink-0">
                  <KeyRound className="w-4 h-4 text-primary-300" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm text-surface-200 font-medium">Reset Password</div>
                  <div className="text-[11px] text-surface-500 mt-0.5">Change your account password</div>
                </div>
                <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-primary-300 transition-colors flex-shrink-0" />
              </button>

              <button
                onClick={() => setShowResetEmailModal(true)}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-primary-500/25 transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-primary-600/10 border border-primary-500/15 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-primary-300" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm text-surface-200 font-medium">Reset Email Address</div>
                  <div className="text-[11px] text-surface-500 mt-0.5">Update your account email</div>
                </div>
                <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-primary-300 transition-colors flex-shrink-0" />
              </button>

              <button
                onClick={openResetAcctModal}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border border-danger-500/15 bg-danger-500/[0.03] hover:bg-danger-500/[0.06] hover:border-danger-500/30 transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-danger-500/10 border border-danger-500/15 flex items-center justify-center flex-shrink-0">
                  <RotateCcw className="w-4 h-4 text-danger-400" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm text-surface-200 font-medium">Reset Account</div>
                  <div className="text-[11px] text-surface-500 mt-0.5">Clear your workspace and start fresh</div>
                </div>
                <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-danger-400 transition-colors flex-shrink-0" />
              </button>

              <button
                onClick={() => {
                  setDeactivateDone(false);
                  setDeactivateError('');
                  setShowDeactivateModal(true);
                }}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-surface-500/25 transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-surface-500/10 border border-surface-500/15 flex items-center justify-center flex-shrink-0">
                  <PowerOff className="w-4 h-4 text-surface-400" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm text-surface-200 font-medium">Deactivate Account</div>
                  <div className="text-[11px] text-surface-500 mt-0.5">Temporarily deactivate your account</div>
                </div>
                <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-surface-400 transition-colors flex-shrink-0" />
              </button>
            </div>
          </div>

          {/* ── Help & Support ─────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/8 bg-surface-900/50 backdrop-blur-md p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-3.5 rounded-full bg-surface-500/60" />
              <div className="text-[10px] font-bold tracking-wider uppercase text-surface-400">Help & Support</div>
            </div>

            <div className="space-y-3">
              <div className="py-2.5 px-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm text-surface-200 font-medium">Hi! How can we help?</span>
                </div>
                <p className="text-[12px] text-surface-500 leading-relaxed">
                  Need help with your account or VirgoPlay? Contact our support team.
                </p>
              </div>

              <a
                href="mailto:support@virgoplay.net"
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-primary-500/25 transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-primary-600/10 border border-primary-500/15 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-primary-300" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm text-surface-200 font-medium">Contact VirgoPlay Support</div>
                  <div className="text-[11px] text-surface-500 mt-0.5">support@virgoplay.net</div>
                </div>
                <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-primary-300 transition-colors flex-shrink-0" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Reset Password Confirmation Modal ─────────────────────── */}
      {showResetPwModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => !resetPwSending && setShowResetPwModal(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-surface-900/95 backdrop-blur-md p-5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => !resetPwSending && setShowResetPwModal(false)}
              disabled={resetPwSending}
              className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>

            {resetPwSent ? (
              <>
                {/* Success icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-success-500/15 border border-success-500/30 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-success-400" />
                  </div>
                </div>

                <h2 className="text-base font-semibold text-surface-100 text-center mb-2">Check your email</h2>
                <p className="text-[13px] text-surface-400 text-center leading-relaxed mb-6">
                  A password reset link has been sent to <strong className="text-surface-200">{creator?.email}</strong>. The link expires in 1 hour.
                </p>

                <button
                  onClick={() => setShowResetPwModal(false)}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-500 transition-colors"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                {/* Icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary-600/15 border border-primary-500/30 flex items-center justify-center">
                    <ShieldAlert className="w-6 h-6 text-primary-300" />
                  </div>
                </div>

                {/* Title */}
                <h2 className="text-base font-semibold text-surface-100 text-center mb-2">Reset Password</h2>

                {/* Warning message */}
                <p className="text-[13px] text-surface-400 text-center leading-relaxed mb-4">
                  You are about to reset your account password. A password reset link will be sent to your email address. Use that link to choose a new password.
                </p>

                {/* Error */}
                {resetPwError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs mb-4">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {resetPwError}
                  </div>
                )}

                {/* Action button */}
                <button
                  onClick={handleSendResetPw}
                  disabled={resetPwSending}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-500 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {resetPwSending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {resetPwSending ? 'Sending...' : 'Send reset password link'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {/* ── Reset Email Address Modal ─────────────────────────────── */}
      {showResetEmailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setShowResetEmailModal(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-surface-900/95 backdrop-blur-md p-5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowResetEmailModal(false)}
              className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-2xl bg-primary-600/15 border border-primary-500/30 flex items-center justify-center">
                <Mail className="w-6 h-6 text-primary-300" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-base font-semibold text-surface-100 text-center mb-2">Reset Email Address</h2>

            {/* Message */}
            <p className="text-[13px] text-surface-400 text-center leading-relaxed mb-2">
              To change your email address, please contact VirgoPlay Support.
            </p>

            {/* Support email link */}
            <div className="text-center mb-6">
              <a
                href="mailto:support@virgoplay.net"
                className="text-sm text-primary-300 hover:text-primary-200 font-medium transition-colors"
              >
                support@virgoplay.net
              </a>
            </div>

            {/* Close button */}
            <button
              onClick={() => setShowResetEmailModal(false)}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-500 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {/* ── Reset Account Modal ──────────────────────────────────────── */}
      {showResetAcctModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={closeResetAcctModal}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-surface-900/95 backdrop-blur-md p-5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={closeResetAcctModal}
              disabled={resetAcctLoading}
              className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>

            {resetAcctStep === 'warning' && (
              <>
                {/* Icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-danger-500/15 border border-danger-500/30 flex items-center justify-center">
                    <RotateCcw className="w-6 h-6 text-danger-400" />
                  </div>
                </div>

                <h2 className="text-base font-semibold text-surface-100 text-center mb-3">Reset Account</h2>

                {/* What will be reset */}
                <div className="mb-4">
                  <div className="text-[11px] font-semibold text-danger-400 mb-1.5">This will be deleted:</div>
                  <ul className="text-[12px] text-surface-400 leading-relaxed space-y-0.5 pl-4 list-disc">
                    <li>My AI image and assets</li>
                    <li>Character and role selections</li>
                    <li>Roles you created</li>
                    <li>Generated role images</li>
                    <li>Generated scene images and videos</li>
                    <li>Generation history</li>
                    <li>Studio settings</li>
                  </ul>
                </div>

                {/* What will stay */}
                <div className="mb-5">
                  <div className="text-[11px] font-semibold text-success-400 mb-1.5">This will stay unchanged:</div>
                  <ul className="text-[12px] text-surface-400 leading-relaxed space-y-0.5 pl-4 list-disc">
                    <li>Login, password, and email</li>
                    <li>Verification status and documents</li>
                    <li>Wallet balance and earnings</li>
                    <li>Transaction history</li>
                    <li>Scene recipes and shared content</li>
                  </ul>
                </div>

                {/* Confirmation checkbox */}
                <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setResetAcctConfirmed(!resetAcctConfirmed)}
                    className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                      resetAcctConfirmed
                        ? 'bg-danger-600 border-danger-500'
                        : 'bg-transparent border-surface-600 hover:border-surface-400'
                    }`}
                  >
                    {resetAcctConfirmed && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                  <span className="text-[12px] text-surface-300 leading-relaxed">
                    I confirm that I want to reset my account.
                  </span>
                </label>

                {/* Action button */}
                <button
                  onClick={() => setResetAcctStep('password')}
                  disabled={!resetAcctConfirmed}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-danger-600 text-white hover:bg-danger-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </>
            )}

            {resetAcctStep === 'password' && (
              <>
                {/* Icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-danger-500/15 border border-danger-500/30 flex items-center justify-center">
                    <Lock className="w-6 h-6 text-danger-400" />
                  </div>
                </div>

                <h2 className="text-base font-semibold text-surface-100 text-center mb-2">Verify your password</h2>
                <p className="text-[13px] text-surface-400 text-center leading-relaxed mb-4">
                  Enter your current password to confirm the reset.
                </p>

                {/* Password input */}
                <input
                  type="password"
                  autoFocus
                  value={resetAcctPassword}
                  onChange={(e) => { setResetAcctPassword(e.target.value); setResetAcctError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && resetAcctPassword) setResetAcctStep('confirm'); }}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-surface-200 placeholder-surface-600 focus:outline-none focus:border-danger-500/50 transition-colors mb-3"
                  placeholder="Current password"
                />

                {/* Error */}
                {resetAcctError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs mb-4">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {resetAcctError}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setResetAcctStep('warning')}
                    disabled={resetAcctLoading}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white/5 text-surface-300 border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setResetAcctStep('confirm')}
                    disabled={!resetAcctPassword || resetAcctLoading}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-danger-600 text-white hover:bg-danger-500 transition-colors disabled:opacity-40"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {resetAcctStep === 'confirm' && (
              <>
                {/* Icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-danger-500/15 border border-danger-500/30 flex items-center justify-center">
                    <ShieldAlert className="w-6 h-6 text-danger-400" />
                  </div>
                </div>

                <h2 className="text-base font-semibold text-surface-100 text-center mb-2">Final confirmation</h2>
                <p className="text-[13px] text-surface-400 text-center leading-relaxed mb-6">
                  This action cannot be undone. All your generated images, videos, roles, and workspace data will be permanently deleted. Are you sure?
                </p>

                {resetAcctError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs mb-4">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {resetAcctError}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setResetAcctStep('password')}
                    disabled={resetAcctLoading}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white/5 text-surface-300 border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleResetAccount}
                    disabled={resetAcctLoading}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-danger-600 text-white hover:bg-danger-500 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {resetAcctLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {resetAcctLoading ? 'Resetting...' : 'Reset Account'}
                  </button>
                </div>
              </>
            )}

            {resetAcctStep === 'success' && (
              <>
                {/* Success icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-success-500/15 border border-success-500/30 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-success-400" />
                  </div>
                </div>

                <h2 className="text-base font-semibold text-surface-100 text-center mb-2">Account reset complete</h2>
                <p className="text-[13px] text-surface-400 text-center leading-relaxed mb-6">
                  Your workspace has been cleared. You can now create a new My AI, choose new roles, and generate fresh images and videos.
                </p>

                <button
                  onClick={() => {
                    setShowResetAcctModal(false);
                    window.location.reload();
                  }}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-500 transition-colors"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {/* ── Deactivate Account Modal ─────────────────────────────────── */}
      {showDeactivateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => !deactivateLoading && !deactivateDone && setShowDeactivateModal(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-surface-900/95 backdrop-blur-md p-5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => !deactivateLoading && !deactivateDone && setShowDeactivateModal(false)}
              disabled={deactivateLoading || deactivateDone}
              className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>

            {deactivateDone ? (
              <>
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-success-500/15 border border-success-500/30 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-success-400" />
                  </div>
                </div>
                <h2 className="text-base font-semibold text-surface-100 text-center mb-2">Account deactivated</h2>
                <p className="text-[13px] text-surface-400 text-center leading-relaxed mb-6">
                  Your account has been temporarily deactivated. To reactivate your account, please contact VirgoPlay.
                </p>
                <button
                  onClick={async () => { await signOut(); }}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-500 transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-surface-500/15 border border-surface-500/30 flex items-center justify-center">
                    <PowerOff className="w-6 h-6 text-surface-400" />
                  </div>
                </div>
                <h2 className="text-base font-semibold text-surface-100 text-center mb-3">Deactivate Account</h2>
                <p className="text-[13px] text-surface-400 text-center leading-relaxed mb-5">
                  Your account will be temporarily deactivated. To reactivate your account, please contact VirgoPlay.
                </p>

                {deactivateError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs mb-4">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {deactivateError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeactivateModal(false)}
                    disabled={deactivateLoading}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white/5 text-surface-300 border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeactivate}
                    disabled={deactivateLoading}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-danger-600 text-white hover:bg-danger-500 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {deactivateLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {deactivateLoading ? 'Deactivating...' : 'Confirm Deactivate'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
