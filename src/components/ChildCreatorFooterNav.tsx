import { ShieldCheck, User, Sparkles, LogOut, MessageSquare } from 'lucide-react';

type FooterTab = 'verification' | 'profile' | 'studio-v2' | 'client';

const FOOTER_ITEMS: { id: FooterTab; label: string; icon: typeof ShieldCheck }[] = [
  { id: 'verification', label: 'Verification', icon: ShieldCheck },
  { id: 'profile',      label: 'Profile',       icon: User },
  { id: 'studio-v2',    label: 'Studio',         icon: Sparkles },
  { id: 'client',       label: 'Client',         icon: MessageSquare },
];

interface Props {
  activeTab: FooterTab;
  onTabClick: (id: FooterTab) => void;
  onSignOut: () => void;
  clientDisabled?: boolean;
  clientDisabledReason?: string;
}

export default function ChildCreatorFooterNav({
  activeTab,
  onTabClick,
  onSignOut,
  clientDisabled = false,
  clientDisabledReason,
}: Props) {
  return (
    <footer
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-black/70 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-3xl items-stretch justify-around px-2 sm:px-6">
        {FOOTER_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          const disabled = id === 'client' && clientDisabled;

          return (
            <button
              key={id}
              onClick={() => !disabled && onTabClick(id)}
              disabled={disabled}
              title={disabled ? clientDisabledReason : undefined}
              className="group relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors disabled:cursor-not-allowed"
            >
              <span
                className={[
                  'flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-300',
                  disabled
                    ? 'border-white/5 bg-white/5 text-white/20'
                    : active
                      ? 'border-accent-500/40 bg-accent-600/15 text-accent-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                      : 'border-white/10 bg-white/5 text-white/50 group-hover:border-white/20 group-hover:text-white/80',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span
                className={[
                  'text-[10px] font-medium tracking-wide transition-colors',
                  disabled
                    ? 'text-white/20'
                    : active
                      ? 'text-accent-300'
                      : 'text-white/40 group-hover:text-white/70',
                ].join(' ')}
              >
                {label}
              </span>
            </button>
          );
        })}

        <button
          onClick={onSignOut}
          className="group relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/50 transition-all duration-300 group-hover:border-danger-500/30 group-hover:bg-danger-500/10 group-hover:text-danger-400">
            <LogOut className="h-4 w-4" />
          </span>
          <span className="text-[10px] font-medium tracking-wide text-white/40 transition-colors group-hover:text-danger-400">
            Sign Out
          </span>
        </button>
      </div>
    </footer>
  );
}
