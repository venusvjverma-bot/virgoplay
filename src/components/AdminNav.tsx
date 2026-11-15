import { Link, useLocation } from 'react-router-dom';
import { Zap, Users, ShieldCheck, LogOut, ClipboardList, UserCog, Layers, Server, MessageSquare, UserCircle, ScanEye } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const BASE_LINKS = [
  { to: '/admin',                     label: 'Creators',        icon: Users        },
  { to: '/admin/verifications',       label: 'Verifications',   icon: ShieldCheck  },
  { to: '/admin/audit',               label: 'Audit Log',       icon: ClipboardList},
  { to: '/admin/identity-review',     label: 'Identity Review', icon: Layers       },
];

const SUPER_ADMIN_LINKS = [
  { to: '/admin/management',          label: 'Admin Management',       icon: UserCog },
  { to: '/admin/provider-config',     label: 'Provider Configuration', icon: Server  },
  { to: '/admin/llm-chat-config',     label: 'LLM Chat Config',        icon: MessageSquare },
  { to: '/admin/moderation-config',   label: 'Moderation Provider',    icon: ScanEye      },
  { to: '/admin/clients',             label: 'Clients',                icon: UserCircle  },
];

export default function AdminNav() {
  const { creator: admin, signOut } = useAuth();
  const { pathname } = useLocation();

  const links = admin?.is_super_admin
    ? [...BASE_LINKS, ...SUPER_ADMIN_LINKS]
    : BASE_LINKS;

  return (
    <header className="bg-surface-900 border-b border-surface-800 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Brand + badge */}
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-primary-600 flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="font-semibold text-surface-100 text-sm hidden sm:block">Creator Portal AI</span>
            <span className="px-1.5 py-0.5 rounded bg-danger-500/10 border border-danger-500/20 text-danger-400 text-[10px] font-mono tracking-wider">
              {admin?.is_super_admin ? 'SUPER ADMIN' : 'ADMIN'}
            </span>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            {links.map(({ to, label, icon: Icon }) => {
              const active = pathname === to || (to !== '/admin' && pathname.startsWith(to));
              return (
                <Link key={to} to={to}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary-600/20 text-primary-400'
                      : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800',
                  ].join(' ')}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:block">{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User + sign out */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-surface-500 hidden md:block truncate max-w-[160px]">
              {admin?.email}
            </span>
            <button onClick={signOut}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:block">Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
