import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, Mail, Wallet, Plus, User, Pencil, LogOut,
  TrendingDown, TrendingUp, Calendar, Clock, Loader2,
  Gift, ArrowUpCircle, MessageCircle, ExternalLink, ChevronDown,
  ArrowRight, Heart, Sparkles, ChevronRight, Settings, UserX,
} from 'lucide-react';
import HelpSupportModal from '../../components/HelpSupportModal';
import { supabase } from '../../lib/supabase';
import { useClientAuth } from '../../context/ClientAuthContext';
import type { ClientSpendingRecord } from '../../types';



export default function ClientDashboardPage() {
  const navigate = useNavigate();
  const { client, loading, sessionToken, clearClient, refreshClient } = useClientAuth();

  const [editing, setEditing]       = useState(false);
  const [name, setName]               = useState('');
  const [phone, setPhone]             = useState('');
  const [country, setCountry]         = useState('');
  const [savingProfile, setSaving]   = useState(false);
  const [profileMsg, setProfileMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  const [transactions, setTransactions]   = useState<ClientSpendingRecord[]>([]);
  const [txLoading, setTxLoading]         = useState(true);
  const [activeTab, setActiveTab]           = useState<'dashboard' | 'chats'>('dashboard');
  const [openDateKey, setOpenDateKey]         = useState<string | null | undefined>(undefined);
  const [chatSessions, setChatSessions]     = useState<ChatSessionEntry[]>([]);
  const [chatsLoading, setChatsLoading]     = useState(true);
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateMsg, setDeactivateMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  useEffect(() => {
    if (enlargedImageUrl) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [enlargedImageUrl]);

  useEffect(() => {
    if (!loading && !client) navigate('/client-signup', { replace: true });
  }, [loading, client, navigate]);

  useEffect(() => {
    if (client) {
      setName(client.full_name ?? '');
      setPhone(client.phone ?? '');
      setCountry(client.country ?? '');
    }
  }, [client]);

  useEffect(() => {
    if (!client) return;
    (async () => {
      setTxLoading(true);
      const { data } = await supabase
        .from('client_spending_history')
        .select('id, client_id, credits, transaction_type, description, created_at')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setTransactions((data ?? []) as ClientSpendingRecord[]);
      setTxLoading(false);
    })();
  }, [client]);

  useEffect(() => {
    if (!client) return;
    (async () => {
      setChatsLoading(true);
      const { data: sessions } = await supabase
        .from('client_chat_sessions')
        .select('role_id, creator_id, last_active_at')
        .eq('client_id', client.id)
        .order('last_active_at', { ascending: false });
      const rows = (sessions ?? []) as { role_id: string; creator_id: string; last_active_at: string }[];
      if (rows.length === 0) {
        setChatSessions([]);
        setChatsLoading(false);
        return;
      }
      const roleIds = rows.map(r => r.role_id);
      const creatorIds = [...new Set(rows.map(r => r.creator_id))];
      const { data: roles } = await supabase
        .from('character_roles')
        .select('id, name, character_id, role_image_url, description')
        .in('id', roleIds);
      const roleMap = new Map((roles ?? []).map((r: { id: string; name: string; character_id: string | null; role_image_url: string | null; description: string | null }) => [r.id, r]));

      // Fetch role images from role_image_productions (same source as Chat Library)
      const { data: roleImages } = await supabase
        .from('role_image_productions')
        .select('creator_id, role_id, role_image_url')
        .in('role_id', roleIds.length > 0 ? roleIds : ['00000000-0000-0000-0000-000000000000']);
      const roleImageMap = new Map((roleImages ?? []).map((ri: { creator_id: string; role_id: string; role_image_url: string | null }) => [`${ri.creator_id}:${ri.role_id}`, ri.role_image_url]));

      // Resolve characters via selections (by creator_id), matching public-test-chat edge function
      const { data: selections } = await supabase
        .from('character_studio_v2_selections')
        .select('creator_id, character_id')
        .in('creator_id', creatorIds);
      const selectionMap = new Map((selections ?? []).map((s: { creator_id: string; character_id: string }) => [s.creator_id, s.character_id]));

      // Also resolve via role.character_id as fallback
      const roleCharIds = [...new Set((roles ?? []).map((r: { character_id: string | null }) => r.character_id).filter((id): id is string => id !== null))];
      const selCharIds = [...new Set((selections ?? []).map((s: { character_id: string }) => s.character_id))];
      const allCharIds = [...new Set([...roleCharIds, ...selCharIds])];
      let characterMap = new Map<string, { name: string; identity_image_url: string | null; is_customize_ai: boolean | null }>();
      if (allCharIds.length > 0) {
        const { data: chars } = await supabase
          .from('character_studio_v2')
          .select('id, name, identity_image_url, is_customize_ai')
          .in('id', allCharIds);
        characterMap = new Map((chars ?? []).map((c: { id: string; name: string; identity_image_url: string | null; is_customize_ai: boolean | null }) => [c.id, c]));
      }

      // Fetch display_name overrides (My AI + Customize AI), matching public-test-chat edge function
      const [overridesRes, customizeOverridesRes] = await Promise.all([
        supabase
          .from('character_studio_v2_my_ai_overrides')
          .select('creator_id, character_id, display_name')
          .in('creator_id', creatorIds),
        supabase
          .from('customize_ai_overrides')
          .select('creator_id, character_id, display_name')
          .in('creator_id', creatorIds),
      ]);
      const myAiOverrideMap = new Map(
        (overridesRes.data ?? [])
          .filter((o: { creator_id: string; character_id: string; display_name: string | null }) => o.display_name?.trim())
          .map((o: { creator_id: string; character_id: string; display_name: string }) => [`${o.creator_id}:${o.character_id}`, o.display_name.trim()])
      );
      const customizeOverrideMap = new Map(
        (customizeOverridesRes.data ?? [])
          .filter((o: { creator_id: string; character_id: string; display_name: string | null }) => o.display_name?.trim())
          .map((o: { creator_id: string; character_id: string; display_name: string }) => [`${o.creator_id}:${o.character_id}`, o.display_name.trim()])
      );

      const entries: ChatSessionEntry[] = rows.map(r => {
        const role = roleMap.get(r.role_id);
        // Priority: selection by creator_id, then role.character_id
        const charId = selectionMap.get(r.creator_id) ?? role?.character_id ?? null;
        const character = charId ? characterMap.get(charId) : undefined;
        const overrideKey = charId ? `${r.creator_id}:${charId}` : null;
        const overrideMap = character?.is_customize_ai ? customizeOverrideMap : myAiOverrideMap;
        const overrideName = overrideKey ? overrideMap.get(overrideKey) : undefined;
        return {
          role_id: r.role_id,
          creator_id: r.creator_id,
          role_name: role?.name ?? 'Unknown Role',
          role_description: role?.description ?? null,
          role_image_url: roleImageMap.get(`${r.creator_id}:${r.role_id}`) ?? role?.role_image_url ?? null,
          character_name: overrideName ?? character?.name ?? 'Unknown Character',
          character_image_url: character?.identity_image_url ?? null,
          last_active_at: r.last_active_at,
        };
      });
      setChatSessions(entries);

      // For sessions whose creator-specific role image is not readable via the
      // dashboard query (RLS hides unpublished role_image_productions rows from
      // anon), resolve the correct image through the public chat endpoint.
      const unresolved = entries.filter(
        e => !roleImageMap.has(`${e.creator_id}:${e.role_id}`)
      );
      if (unresolved.length > 0) {
        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-test-chat`;
        const resolved = await Promise.all(
          unresolved.map(async e => {
            try {
              const query = `?role_id=${encodeURIComponent(e.role_id)}&creator_id=${encodeURIComponent(e.creator_id)}`;
              const res = await fetch(`${fnUrl}${query}`, { method: 'GET' });
              const data = await res.json();
              if (!res.ok || data.error) return null;
              const url = data.role?.role_image_url ?? null;
              return url ? { role_id: e.role_id, creator_id: e.creator_id, url } : null;
            } catch {
              return null;
            }
          })
        );
        const patch = new Map(
          resolved.filter((x): x is { role_id: string; creator_id: string; url: string } => x !== null)
            .map(x => [`${x.creator_id}:${x.role_id}`, x.url])
        );
        if (patch.size > 0) {
          setChatSessions(prev =>
            prev.map(s => {
              const url = patch.get(`${s.creator_id}:${s.role_id}`);
              return url ? { ...s, role_image_url: url } : s;
            })
          );
        }
      }

      setChatsLoading(false);
    })();
  }, [client]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }
  if (!client) return null;

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setSaving(true);
    setProfileMsg(null);
    const { error } = await supabase
      .rpc('client_update_profile', {
        p_client_id: client.id,
        p_session_token: sessionToken,
        p_full_name: name.trim() || null,
        p_phone: phone.trim() || null,
        p_country: country.trim() || null,
      });
    setSaving(false);
    if (error) {
      setProfileMsg({ ok: false, text: 'Could not save. Please try again.' });
    } else {
      setProfileMsg({ ok: true, text: 'Profile updated.' });
      setEditing(false);
      void refreshClient();
      setTimeout(() => setProfileMsg(null), 3000);
    }
  }

  function handleSignOut() {
    clearClient();
    navigate('/client-signup', { replace: true });
  }

  async function handleDeactivate() {
    if (!client || !sessionToken) return;
    setDeactivating(true);
    setDeactivateMsg(null);
    try {
      const { data, error } = await supabase
        .rpc('self_deactivate_client', {
          p_client_id: client.id,
          p_session_token: sessionToken,
        });
      if (error || (data && data.success === false)) {
        const msg = error?.message || data?.error || 'Could not deactivate account.';
        setDeactivateMsg({ ok: false, text: msg });
      } else {
        setDeactivateMsg({ ok: true, text: 'Account deactivated. You can reactivate via support.' });
        setTimeout(() => {
          clearClient();
          navigate('/client-signup', { replace: true });
        }, 2000);
      }
    } catch {
      setDeactivateMsg({ ok: false, text: 'Could not deactivate account.' });
    } finally {
      setDeactivating(false);
    }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  const initials = (client.full_name || client.email).charAt(0).toUpperCase();
  const balance = client.credit_balance ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar — banner header */}
      <header className="vp-header-banner sticky top-0 z-30 border-b border-slate-200/60 relative">
        <img src="/client-header-banner.png" alt="VirgoPlay" className="block w-full h-auto" />
        <div className="absolute top-1/2 right-3 -translate-y-1/2 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-sm font-semibold shadow-md ring-2 ring-white/80">
          {initials}
        </div>
      </header>

      {/* Main scroll area */}
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-2xl mx-auto px-5 pt-6 space-y-5">

        {activeTab === 'chats' && (
          <>
            <section>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Your Chats</h1>
              <p className="text-sm text-slate-400 mt-0.5">Continue a conversation right where you left off.</p>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
              {chatsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
                </div>
              ) : chatSessions.length === 0 ? (
                <div className="text-center py-8">
                  <MessageCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No chats yet. Start a conversation from a public chat link!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {chatSessions.map((s) => (
                    <a
                      key={`${s.role_id}-${s.creator_id}`}
                      href={`/test-chat?role_id=${encodeURIComponent(s.role_id)}&creator_id=${encodeURIComponent(s.creator_id)}&chat=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-stretch rounded-2xl border border-slate-200/70 bg-white shadow-sm hover:shadow-md hover:border-violet-200 transition-all duration-200 text-left overflow-hidden"
                    >
                      <div className="flex-shrink-0 p-2 flex items-stretch">
                        {s.role_image_url ? (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={`Enlarge image for ${s.role_name}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setEnlargedImageUrl(s.role_image_url);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                setEnlargedImageUrl(s.role_image_url);
                              }
                            }}
                            className="block cursor-pointer rounded-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                          >
                            <img
                              src={s.role_image_url}
                              alt={s.role_name}
                              className="w-[60px] rounded-lg object-cover self-stretch"
                            />
                          </span>
                        ) : (
                          <div className="w-[60px] rounded-lg bg-slate-50 flex items-center justify-center self-stretch">
                            <MessageCircle className="w-6 h-6 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 py-2.5 flex flex-col justify-center gap-0.5">
                        <div className="text-sm font-bold text-slate-800 truncate">
                          {s.character_name}
                        </div>
                        <div className="text-xs font-medium text-violet-500 truncate">
                          {s.role_name}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {fmtTimeAgo(s.last_active_at)}
                        </div>
                      </div>
                      <div className="flex flex-col items-center justify-between gap-1 flex-shrink-0 py-2.5 pr-3">
                        <div className="flex items-center gap-1">
                          <span className="online-dot inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">Online</span>
                        </div>
                        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-violet-50 border border-violet-200 group-hover:bg-violet-500 group-hover:border-violet-500 transition-all duration-200">
                          <ArrowRight className="w-4 h-4 text-violet-500 group-hover:text-white transition-colors duration-200" />
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>

            {/* Explore Chat Library CTA */}
            <button
              onClick={() => navigate('/chat-library')}
              className="cta-fade-up w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-full text-white font-bold text-sm active:scale-[0.97] transition-transform duration-150 border border-white/20"
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
              }}
            >
              <span className="relative flex items-center">
                <MessageCircle className="w-4 h-4" />
                <Sparkles className="w-2.5 h-2.5 absolute -top-1 -right-1.5 text-white/80" />
                <Sparkles className="w-2 h-2 absolute -bottom-1 -left-1 text-white/50" />
              </span>
              <span>Explore Chat Library</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {activeTab === 'dashboard' && (
        <>

          {/* Welcome */}
          <section>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              {client.full_name ? `Welcome back, ${client.full_name.split(' ')[0]}` : 'Welcome'}
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">{client.email}</p>
          </section>

          {/* Account card */}
          <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <svg className="robot-face-svg" width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="robotHead" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f5f3ff" />
                      <stop offset="100%" stopColor="#ddd6fe" />
                    </linearGradient>
                    <linearGradient id="robotFace" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ede9fe" />
                      <stop offset="100%" stopColor="#c4b5fd" />
                    </linearGradient>
                    <radialGradient id="robotEye" cx="0.5" cy="0.4" r="0.6">
                      <stop offset="0%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#6d28d9" />
                    </radialGradient>
                  </defs>
                  <rect x="14" y="6" width="6" height="8" rx="2" fill="#a78bfa" />
                  <circle cx="17" cy="5" r="2.5" fill="#7c3aed" />
                  <rect x="10" y="14" width="44" height="38" rx="12" fill="url(#robotHead)" stroke="#a78bfa" strokeWidth="1.5" />
                  <rect x="16" y="20" width="32" height="26" rx="9" fill="url(#robotFace)" />
                  <circle className="robot-eye" cx="25" cy="31" r="4.5" fill="url(#robotEye)" />
                  <circle className="robot-eye" cx="39" cy="31" r="4.5" fill="url(#robotEye)" />
                  <circle cx="25" cy="29.5" r="1.5" fill="#fff" opacity="0.8" />
                  <circle cx="39" cy="29.5" r="1.5" fill="#fff" opacity="0.8" />
                  <path d="M26 40 Q32 43 38 40" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round" fill="none" />
                  <rect x="20" y="46" width="24" height="3" rx="1.5" fill="#a78bfa" opacity="0.5" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-slate-700">Account</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-500">Email</span>
                </div>
                <span className="text-sm font-medium text-slate-700">{client.email}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">Status</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-medium">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Verified
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-500">Account</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 text-xs font-medium">
                  Active
                </span>
              </div>
            </div>
          </section>

          {/* Balance */}
          <section className="bg-gradient-to-br from-violet-500 to-indigo-500 rounded-2xl shadow-md p-5 text-white relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-4 h-4 text-white/80" />
                <span className="text-xs font-medium text-white/80 uppercase tracking-wider">Current Balance</span>
              </div>
              <div className="text-4xl font-bold tracking-tight">{balance}</div>
              <div className="text-sm text-white/70 mt-1">Credits</div>
            </div>
          </section>

          {/* Buy Credits CTA */}
          <button
            onClick={() => navigate('/buy-credits')}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold text-sm shadow-sm hover:from-violet-600 hover:to-indigo-600 hover:shadow-md active:scale-[0.98] transition-all duration-150"
          >
            <ArrowUpCircle className="w-4 h-4" />
            <span>Buy Credits</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* My Profile */}
          <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <User className="w-5 h-5 text-indigo-500" />
                </div>
                <h2 className="text-base font-semibold text-slate-700">My Profile</h2>
              </div>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
            </div>

            {profileMsg && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-3 ${
                profileMsg.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}>
                {profileMsg.ok ? <CheckCircle className="w-3.5 h-3.5" /> : null}
                {profileMsg.text}
              </div>
            )}

            {editing ? (
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1 555 000 0000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Country</label>
                  <input
                    type="text"
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    placeholder="United States"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                  />
                </div>
                <div className="flex gap-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-semibold shadow-sm hover:shadow-md hover:from-violet-600 hover:to-indigo-600 transition-all disabled:opacity-50"
                  >
                    {savingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setProfileMsg(null); }}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2.5">
                <ProfileRow label="Name" value={client.full_name} />
                <ProfileRow label="Phone" value={client.phone} />
                <ProfileRow label="Country" value={client.country} />
              </div>
            )}
          </section>

          {/* Credit History */}
          <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-violet-500" />
              </div>
              <h2 className="text-base font-semibold text-slate-700">Credit History</h2>
            </div>

            {txLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8">
                <Gift className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No credit history yet.</p>
              </div>
            ) : (() => {
              const groups = new Map<string, ClientSpendingRecord[]>();
              for (const tx of transactions) {
                const d = new Date(tx.created_at);
                const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const arr = groups.get(key) ?? [];
                arr.push(tx);
                groups.set(key, arr);
              }
              const dateKeys = Array.from(groups.keys());
              const initialKey = dateKeys[0] ?? null;
              return (
                <div className="space-y-2">
                  {dateKeys.map((dateKey) => {
                    const groupTx = groups.get(dateKey)!;
                    const isOpen = openDateKey === undefined
                      ? dateKey === initialKey
                      : openDateKey === dateKey;
                    return (
                      <div key={dateKey} className="rounded-xl border border-slate-100 overflow-hidden">
                        <button
                          onClick={() => setOpenDateKey(isOpen ? null : dateKey)}
                          className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50/80 hover:bg-slate-50 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <span className="text-sm font-semibold text-slate-600">{dateKey}</span>
                            <span className="text-xs text-slate-400">({groupTx.length})</span>
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                          />
                        </button>
                        {isOpen && (
                          <div className="px-3">
                            {groupTx.map((entry) => {
                              const isGrant = entry.transaction_type === 'grant';
                              return (
                                <div
                                  key={entry.id}
                                  className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                      isGrant ? 'bg-emerald-50' : 'bg-rose-50'
                                    }`}>
                                      {isGrant
                                        ? <TrendingUp className="w-4 h-4 text-emerald-500" />
                                        : <TrendingDown className="w-4 h-4 text-rose-400" />
                                      }
                                    </div>
                                    <div>
                                      <div className="text-sm font-medium text-slate-600">
                                        {entry.description || (isGrant ? 'Credits added' : 'Credits spent')}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                        <Clock className="w-3 h-3" />
                                        {fmtTime(entry.created_at)}
                                      </div>
                                    </div>
                                  </div>
                                  <div className={`text-sm font-semibold ${
                                    isGrant ? 'text-emerald-600' : 'text-slate-700'
                                  }`}>
                                    {isGrant ? '+' : '-'}{entry.credits}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>

          {/* Settings */}
          <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <Settings className="w-5 h-5 text-violet-500" />
              </div>
              <h2 className="text-base font-semibold text-slate-700">Settings</h2>
            </div>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowDeactivateConfirm(true)}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border border-slate-200/70 bg-slate-50/60 hover:bg-slate-50 transition-colors text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0">
                  <UserX className="w-4 h-4 text-rose-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-700">Deactivate account</div>
                  <div className="text-xs text-slate-400 mt-0.5">Temporarily disable your account</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-rose-400 transition-colors" />
              </button>
              <button
                type="button"
                onClick={() => setShowContactModal(true)}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border border-slate-200/70 bg-slate-50/60 hover:bg-slate-50 transition-colors text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-4 h-4 text-violet-500" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-700">Contact Us</div>
                  <div className="text-xs text-slate-400 mt-0.5">Get help from our team</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-violet-500 transition-colors" />
              </button>
            </div>
          </section>
        </>
        )}
        </div>
      </main>

      {/* Fixed bottom navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur-lg border-t border-slate-200/60">
        <div className="max-w-2xl mx-auto px-5 h-16 flex items-center justify-around">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'dashboard' ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${activeTab === 'dashboard' ? 'bg-violet-50' : ''}`}>
              <User className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('chats')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'chats' ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${activeTab === 'chats' ? 'bg-violet-50' : ''}`}>
              <MessageCircle className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Chats</span>
          </button>
          <button
            onClick={handleSignOut}
            className="flex flex-col items-center gap-1 text-slate-400 hover:text-rose-500 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-rose-50 transition-colors">
              <LogOut className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Sign Out</span>
          </button>
        </div>
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </nav>

      {showContactModal && <HelpSupportModal onClose={() => setShowContactModal(false)} />}

      {deactivateMsg && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm shadow-lg ${
          deactivateMsg.ok ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'
        }`}>
          {deactivateMsg.ok ? <CheckCircle className="w-4 h-4" /> : null}
          {deactivateMsg.text}
        </div>
      )}

      {showDeactivateConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-fade-in"
          onClick={() => !deactivating && setShowDeactivateConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-5 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center">
                <UserX className="w-6 h-6 text-rose-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">Deactivate Account</h3>
              <p className="text-sm text-slate-500">
                Your account will be temporarily disabled. You will not be able to sign in until an admin reactivates it. Your credits and data will be preserved.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeactivateConfirm(false)}
                disabled={deactivating}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={deactivating}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 transition-colors disabled:opacity-50"
              >
                {deactivating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm font-medium ${value ? 'text-slate-700' : 'text-slate-300'}`}>
        {value || '—'}
      </span>
    </div>
  );
}

interface ChatSessionEntry {
  role_id: string;
  creator_id: string;
  role_name: string;
  role_description: string | null;
  role_image_url: string | null;
  character_name: string;
  character_image_url: string | null;
  last_active_at: string;
}

function fmtTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
