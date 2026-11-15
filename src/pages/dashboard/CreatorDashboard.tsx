import { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, User, LogOut, Clock,
  CheckCircle, XCircle, Zap, Lock, Menu, X, Package,
  Layers, Clapperboard, Cpu, Sparkles, MessageSquare, Power,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCreatorRestrictions } from '../../lib/useCreatorRestrictions';
import { supabase } from '../../lib/supabase';
import type { VerificationDocument, CreatorProfile } from '../../types';
import VerificationUpload from './VerificationUpload';
import ProfileSetup from './ProfileSetup';
import ChildProfilePage from './ChildProfilePage';
import CharacterStudioPage from './CharacterStudioPage';
import CharacterStudioV2Page, { type SelectedV2Character } from './CharacterStudioV2Page';
import BlueprintPackagesPage from './BlueprintPackagesPage';
import RoleStudioPage from './RoleStudioPage';
import SceneGenerationPage from './SceneGenerationPage';
import GenerationPage from './GenerationPage';
import ChildCreatorFooterNav from '../../components/ChildCreatorFooterNav';
import VerifiedHero from '../../components/VerifiedHero';
import VerifiedOnboardingSection from '../../components/VerifiedOnboardingSection';
import VerifiedExperienceSection from '../../components/VerifiedExperienceSection';
import VerifiedReadySection from '../../components/VerifiedReadySection';

const LOGO_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/storage/v1/object/public/login-assets/login-logo.png`;
import LLMTestChat from './LLMTestChat';
import ClientChatLinkPage from './ClientChatLinkPage';

const TAG = '[CreatorDashboard]';

const MOTHER_CREATOR_EMAIL = 'test.test@gmail.com';

type Tab = 'verification' | 'profile' | 'studio' | 'studio-v2' | 'blueprints' | 'role-studio' | 'scene-gen' | 'generation' | 'llm-test' | 'client';

const TABS: { id: Tab; label: string; icon: typeof ShieldCheck }[] = [
  { id: 'verification',  label: 'Verification',         icon: ShieldCheck },
  { id: 'profile',        label: 'Profile & AI',         icon: User },
  { id: 'studio',         label: 'Character Studio',     icon: Zap },
  { id: 'studio-v2',      label: 'Studio V2',             icon: Sparkles },
  { id: 'blueprints',     label: 'Master AI Blueprint',  icon: Package },
  { id: 'role-studio',    label: 'Role Studio',          icon: Layers },
  { id: 'scene-gen',      label: 'Scene Gen',             icon: Clapperboard },
  { id: 'generation',     label: 'Generation',           icon: Cpu },
  { id: 'llm-test',        label: 'LLM Test Chat',        icon: MessageSquare },
];

export default function CreatorDashboard() {
  const { creator, signOut, refreshCreator } = useAuth();
  const { isFrozen, freezeReason } = useCreatorRestrictions();
  const [tab, setTab]           = useState<Tab>('verification');
  const [doc, setDoc]           = useState<VerificationDocument | null>(null);
  const [profile, setProfile]   = useState<CreatorProfile | null>(null);
  const [loading, setLoading]   = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedV2Character, setSelectedV2Character] = useState<SelectedV2Character | null>(null);
  const [offModeActive, setOffModeActive] = useState(false);
  const [hasDoneRole, setHasDoneRole] = useState(false);
  const renderCount = useRef(0);
  renderCount.current += 1;

  const isMotherCreator =
    creator?.email === MOTHER_CREATOR_EMAIL || creator?.is_super_admin === true;
  const tabs = isMotherCreator
    ? TABS.filter(t => t.id !== 'blueprints')
    : TABS.filter(t => t.id !== 'studio' && t.id !== 'blueprints' && t.id !== 'role-studio' && t.id !== 'scene-gen' && t.id !== 'generation' && t.id !== 'llm-test');

  console.log(TAG, `render #${renderCount.current} — creator=${creator ? `@${creator.username}` : 'null'} loading=${loading}`);

  useEffect(() => {
    console.log(TAG, 'useEffect[creator?.id] fired — creator?.id=', creator?.id ?? 'undefined');
    if (!creator?.id) {
      console.log(TAG, 'no creator id yet, waiting…');
      return;
    }
    console.log(TAG, 'loading creator data for', creator.id);
    setLoading(true);
    Promise.all([loadDoc(), loadProfile(), loadDoneRoleStatus()])
      .then(() => console.log(TAG, 'data load complete'))
      .catch(err => console.error(TAG, 'data load error:', err))
      .finally(() => setLoading(false));
  }, [creator?.id]);

  useEffect(() => {
    if (!creator) return;
    const approved = creator.verification_status === 'approved' || creator.is_super_admin === true;
    if (!approved && tab !== 'verification') {
      setTab('verification');
    }
  }, [creator?.verification_status, tab]);

  // Force frozen creators onto the verification tab
  useEffect(() => {
    if (isFrozen && tab !== 'verification') {
      setTab('verification');
    }
  }, [isFrozen, tab]);

  useEffect(() => { setSidebarOpen(false); }, [tab]);

  async function loadDoc() {
    console.log(TAG, 'loadDoc for creator_id=', creator!.id);
    const { data, error } = await supabase
      .from('verification_documents').select('*')
      .eq('creator_id', creator!.id)
      .order('uploaded_at', { ascending: false })
      .limit(1).maybeSingle();
    console.log(TAG, 'loadDoc result — found=', !!data, 'error=', error?.message ?? 'none');
    setDoc(data as VerificationDocument ?? null);
  }

  async function loadProfile() {
    console.log(TAG, 'loadProfile for creator_id=', creator!.id);
    let { data, error } = await supabase
      .from('creator_profiles').select('*')
      .eq('creator_id', creator!.id).maybeSingle();
    console.log(TAG, 'loadProfile first query — found=', !!data, 'error=', error?.message ?? 'none');

    if (!data) {
      console.log(TAG, 'profile missing — auto-creating…');
      const { error: upsertErr } = await supabase.from('creator_profiles').upsert({
        creator_id: creator!.id,
        display_name: creator!.username,
        bio: '',
        welcome_message: 'Hey! Ask me anything.',
        ai_personality: '',
        ai_system_prompt: '',
      }, { onConflict: 'creator_id' });
      console.log(TAG, 'profile upsert result — error=', upsertErr?.message ?? 'none');

      const res = await supabase
        .from('creator_profiles').select('*')
        .eq('creator_id', creator!.id).maybeSingle();
      console.log(TAG, 'profile re-fetch — found=', !!res.data, 'error=', res.error?.message ?? 'none');
      data = res.data;
    }

    setProfile(data as CreatorProfile ?? null);
  }

  async function loadDoneRoleStatus() {
    if (!creator?.id) return;
    try {
      const { data: prods } = await supabase
        .from('role_image_productions')
        .select('role_image_url, role_image_status')
        .eq('creator_id', creator.id);
      const done = (prods ?? []).some((p: { role_image_url: string | null; role_image_status: string | null }) =>
        p.role_image_url || ['done', 'ready', 'completed'].includes((p.role_image_status ?? '').toLowerCase()),
      );
      setHasDoneRole(done);
    } catch { /* ignore */ }
  }

  if (!creator || loading) {
    console.log(TAG, `showing spinner — creator=${creator ? 'set' : 'null'} loading=${loading}`);
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const status = creator.verification_status;
  const isApproved = status === 'approved' || creator.is_super_admin === true;

  function handleTabClick(id: Tab) {
    if (isFrozen && id !== 'verification') return;
    const locked = !isApproved && id !== 'verification';
    if (!locked) setTab(id);
  }

  const SidebarContent = () => (
    <>
      <div className="p-4 border-b border-surface-800 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-primary-600/20 border border-primary-600/30 flex items-center justify-center text-primary-400 font-semibold text-sm flex-shrink-0">
            {creator.username[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-surface-100 truncate">@{creator.username}</div>
            <div className="text-xs text-surface-500 truncate">{creator.email}</div>
          </div>
        </div>
        {status === 'approved' && <span className="badge-approved text-xs"><CheckCircle className="w-3 h-3" />Verified</span>}
        {status === 'pending'  && <span className="badge-pending  text-xs"><Clock className="w-3 h-3" />Pending</span>}
        {status === 'rejected' && <span className="badge-rejected text-xs"><XCircle className="w-3 h-3" />Rejected</span>}
        {status === 'draft'    && <span className="badge-pending opacity-60 text-xs"><Clock className="w-3 h-3" />Not Started</span>}
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {tabs.map(({ id, label, icon: Icon }) => {
          const locked = (isFrozen && id !== 'verification') || (!isApproved && id !== 'verification');
          return (
            <button key={id}
              onClick={() => handleTabClick(id)}
              disabled={locked}
              title={locked ? 'Complete identity verification to unlock' : undefined}
              className={[
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                locked
                  ? 'text-surface-600 cursor-not-allowed opacity-50'
                  : tab === id
                    ? 'bg-primary-600/15 text-primary-400 border border-primary-600/20'
                    : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800',
              ].join(' ')}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{label}</span>
              {locked && <Lock className="w-3 h-3 flex-shrink-0" />}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-surface-800 flex-shrink-0">
        <button onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-colors">
          <LogOut className="w-4 h-4" />Sign Out
        </button>
      </div>
    </>
  );

  const currentTab = tabs.find(t => t.id === tab);

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col md:flex-row">

      <aside className="hidden md:flex w-64 flex-shrink-0 bg-surface-900 border-r border-surface-800 flex-col">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-surface-800 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center shadow-md">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-surface-100">Creator Portal AI</span>
        </div>
        <SidebarContent />
      </aside>

      <header className={`md:hidden flex items-center gap-3 h-14 px-4 bg-surface-900 border-b border-surface-800 flex-shrink-0 transition-opacity ${offModeActive && (tab === 'studio-v2' || tab === 'role-studio') ? 'opacity-0 pointer-events-none h-0 overflow-hidden border-0' : ''}`}>
        {tab === 'verification' && isApproved && !isMotherCreator ? (
          <img src={LOGO_URL} alt="VirgoPlay" className="h-[28px] w-auto object-contain" />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center shadow-md flex-shrink-0">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
        )}
        <span className="text-sm font-semibold text-surface-100 flex-1 truncate">
          {currentTab?.label ?? 'Creator Portal'}
        </span>
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-surface-900 flex flex-col h-full shadow-2xl">
            <div className="h-14 flex items-center justify-between px-4 border-b border-surface-800 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-semibold text-surface-100">Creator Portal AI</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        {tab === 'verification' && isApproved && !isMotherCreator ? (
          <div className="pb-24">
            <VerifiedHero />
            <VerifiedOnboardingSection />
            <VerifiedExperienceSection />
            <VerifiedReadySection />
          </div>
        ) : (
        <div className={`w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 ${!isMotherCreator && isApproved && !isFrozen ? 'pb-24' : ''}`}>
          {isFrozen && (
            <div className="mb-6 rounded-xl border border-danger-500/25 bg-danger-500/5 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-danger-500/10 border border-danger-500/20 flex items-center justify-center flex-shrink-0">
                  <Power className="w-5 h-5 text-danger-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-danger-300 mb-1">Account Temporarily Deactivated</h2>
                  <p className="text-sm text-surface-400 leading-relaxed">{freezeReason}</p>
                </div>
              </div>
            </div>
          )}
          {tab === 'verification' && !isApproved && (
            <VerificationUpload
              doc={doc}
              onUploaded={async () => { await loadDoc(); await refreshCreator(); }}
            />
          )}
          {tab === 'verification' && isApproved && isMotherCreator && (
            <VerificationUpload
              doc={doc}
              onUploaded={async () => { await loadDoc(); await refreshCreator(); }}
            />
          )}
          {tab === 'profile' && !isApproved && !isFrozen && <VerificationGate />}
          {tab === 'profile' && isApproved && !isFrozen && isMotherCreator && (
            <ProfileSetup profile={profile} onSaved={loadProfile} />
          )}
          {tab === 'profile' && isApproved && !isFrozen && !isMotherCreator && (
            <ChildProfilePage profile={profile} onSaved={loadProfile} />
          )}
          {tab === 'studio' && isApproved && !isFrozen && (
            <CharacterStudioPage />
          )}
          {tab === 'studio-v2' && isApproved && !isFrozen && (
            <CharacterStudioV2Page
              onGoToRoleStudio={(char) => { setSelectedV2Character(char); setTab('role-studio'); }}
              onOffModeActive={setOffModeActive}
            />
          )}
          {tab === 'blueprints' && isApproved && !isFrozen && !isMotherCreator && (
            <BlueprintPackagesPage creatorId={creator.id} />
          )}
          {tab === 'role-studio' && isApproved && !isFrozen && (
            <RoleStudioPage selectedV2Character={selectedV2Character} onOffModeActive={setOffModeActive} onBack={() => setTab('studio-v2')} onRoleImageDone={loadDoneRoleStatus} />
          )}
          {tab === 'scene-gen' && isApproved && !isFrozen && (
            <SceneGenerationPage />
          )}
          {tab === 'generation' && isApproved && !isFrozen && (
            <GenerationPage creatorId={creator.id} />
          )}
          {tab === 'llm-test' && isApproved && !isFrozen && isMotherCreator && (
            <LLMTestChat />
          )}
          {tab === 'client' && isApproved && !isFrozen && !isMotherCreator && (
            <ClientChatLinkPage />
          )}
        </div>
        )}
      </main>

      {/* Mother Creator mobile bottom nav — Child Creators use ChildCreatorFooterNav instead */}
      {isMotherCreator && (
        <nav className={`md:hidden fixed bottom-0 left-0 right-0 bg-surface-900 border-t border-surface-800 flex z-40 transition-opacity ${offModeActive && (tab === 'studio-v2' || tab === 'role-studio') ? 'opacity-0 pointer-events-none translate-y-full' : ''}`}>
          {tabs.map(({ id, label, icon: Icon }) => {
            const locked = !isApproved && id !== 'verification';
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => handleTabClick(id)}
                disabled={locked}
                className={[
                  'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors min-w-0',
                  locked
                    ? 'text-surface-700 cursor-not-allowed'
                    : active
                      ? 'text-primary-400'
                      : 'text-surface-500 hover:text-surface-300',
                ].join(' ')}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {locked && (
                    <Lock className="w-2.5 h-2.5 absolute -top-0.5 -right-1 text-surface-700" />
                  )}
                </div>
                <span className="truncate max-w-full px-0.5">{label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {isMotherCreator && (
        <div className={`md:hidden h-16 flex-shrink-0 ${offModeActive && (tab === 'studio-v2' || tab === 'role-studio') ? 'h-0' : ''}`} />
      )}

      {/* Child Creator shared footer nav — visible on all Child Creator pages */}
      {!isMotherCreator && isApproved && !isFrozen && (
        <ChildCreatorFooterNav
          activeTab={tab as 'verification' | 'profile' | 'studio-v2' | 'client'}
          onTabClick={(id) => handleTabClick(id)}
          onSignOut={signOut}
          clientDisabled={!hasDoneRole}
          clientDisabledReason="Complete at least one Role first"
        />
      )}
    </div>
  );
}

function VerificationGate() {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-warning-500/10 border border-warning-500/20 flex items-center justify-center mb-5">
        <Lock className="w-7 h-7 text-warning-400" />
      </div>
      <h2 className="text-xl font-semibold text-surface-100 mb-3">Feature Locked</h2>
      <p className="text-sm text-surface-400 max-w-sm leading-relaxed">
        Identity verification must be approved before creator profile and AI configuration become available.
      </p>
    </div>
  );
}
