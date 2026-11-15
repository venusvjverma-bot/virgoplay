import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  UserCog, Plus, Trash2, AlertCircle, CheckCircle,
  RefreshCw, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import AdminNav from '../../components/AdminNav';

interface AdminRow {
  id: string;
  email: string;
  username: string;
  role: string;
  is_super_admin: boolean;
  created_at: string;
}

interface Toast { type: 'success' | 'error'; message: string }

export default function AdminManagementPage() {
  const { creator } = useAuth();

  if (creator && !creator.is_super_admin) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="min-h-screen bg-surface-950">
      <AdminNav />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <AdminManagementContent callerId={creator?.id ?? ''} />
      </div>
    </div>
  );
}

function AdminManagementContent({ callerId }: { callerId: string }) {
  const [admins, setAdmins]             = useState<AdminRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [toast, setToast]               = useState<Toast | null>(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AdminRow | null>(null);

  const edgeFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-manage-admins`;

  function showToast(type: Toast['type'], message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(edgeFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'list' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load admins.');
      setAdmins(data.admins ?? []);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load admins.');
    } finally {
      setLoading(false);
    }
  }, [edgeFnUrl]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <UserCog className="w-5 h-5 text-primary-400" />
            <h1 className="text-xl font-semibold text-surface-100">Admin Management</h1>
          </div>
          <p className="text-sm text-surface-400">
            Create and remove admin accounts. Only the Super Admin can access this page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary text-sm px-4 py-2"
          >
            <Plus className="w-4 h-4" />
            Create Admin
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={[
          'flex items-center gap-2.5 p-3.5 rounded-lg border text-sm mb-6',
          toast.type === 'success'
            ? 'bg-accent-500/10 border-accent-500/20 text-accent-400'
            : 'bg-danger-500/10 border-danger-500/20 text-danger-400',
        ].join(' ')}>
          {toast.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.message}
        </div>
      )}

      {/* Admin table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : admins.length === 0 ? (
          <div className="text-center py-16 text-surface-500 text-sm">No admin accounts found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-800">
                <th className="text-left text-xs font-medium text-surface-500 uppercase tracking-wider px-5 py-3">Username</th>
                <th className="text-left text-xs font-medium text-surface-500 uppercase tracking-wider px-5 py-3">Email</th>
                <th className="text-left text-xs font-medium text-surface-500 uppercase tracking-wider px-5 py-3">Created</th>
                <th className="px-5 py-3 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800/60">
              {admins.map(admin => {
                const canRemove = !admin.is_super_admin && admin.id !== callerId;
                return (
                  <tr key={admin.id} className="hover:bg-surface-800/30 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-surface-200">
                      @{admin.username}
                    </td>
                    <td className="px-5 py-3.5 text-surface-400">{admin.email}</td>
                    <td className="px-5 py-3.5 text-surface-500">
                      {new Date(admin.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {canRemove ? (
                        <button
                          onClick={() => setRemoveTarget(admin)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-danger-400 hover:bg-danger-500/10 border border-transparent hover:border-danger-500/20 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      ) : (
                        <span className="text-xs text-surface-600 italic">
                          {admin.id === callerId ? 'You' : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateAdminModal
          edgeFnUrl={edgeFnUrl}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
            showToast('success', 'Admin account created successfully.');
          }}
          onError={msg => showToast('error', msg)}
        />
      )}

      {removeTarget && (
        <RemoveAdminModal
          admin={removeTarget}
          edgeFnUrl={edgeFnUrl}
          onClose={() => setRemoveTarget(null)}
          onRemoved={() => {
            const name = removeTarget.username;
            setRemoveTarget(null);
            load();
            showToast('success', `Admin @${name} has been removed.`);
          }}
          onError={msg => { setRemoveTarget(null); showToast('error', msg); }}
        />
      )}
    </>
  );
}

// ─── Create Admin Modal ────────────────────────────────────────────────────────

function CreateAdminModal({ edgeFnUrl, onClose, onCreated, onError }: {
  edgeFnUrl: string;
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [username, setUsername]     = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [fieldError, setFieldError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError('');

    if (!/^[a-z0-9][a-z0-9_]*[0-9]+$/.test(username)) {
      setFieldError('Username must be in name_digits format (e.g. alice01).');
      return;
    }
    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(edgeFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'create', username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create admin.');
      onCreated();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Failed to create admin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Create Admin Account" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-surface-400">
          The new admin can log in immediately and update their password via Forgot Password.
        </p>

        {fieldError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {fieldError}
          </div>
        )}

        <div>
          <label className="label">
            Username <span className="text-surface-500 font-normal text-xs">(name_digits, e.g. alice01)</span>
          </label>
          <input
            className="input-field"
            placeholder="alice01"
            value={username}
            onChange={e => setUsername(e.target.value.toLowerCase())}
            required
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="input-field"
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Temporary Password</label>
          <input
            className="input-field"
            type="password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn-primary text-sm">
            {loading ? 'Creating…' : 'Create Admin'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Remove Admin Modal ────────────────────────────────────────────────────────

function RemoveAdminModal({ admin, edgeFnUrl, onClose, onRemoved, onError }: {
  admin: AdminRow;
  edgeFnUrl: string;
  onClose: () => void;
  onRemoved: () => void;
  onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(edgeFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'remove', targetId: admin.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove admin.');
      onRemoved();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Failed to remove admin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Remove Admin Account" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-surface-300">
          Are you sure you want to remove{' '}
          <span className="font-semibold text-surface-100">@{admin.username}</span>?
        </p>
        <p className="text-sm text-surface-400">
          This will permanently delete their account ({admin.email}) and revoke all admin
          access. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            onClick={handleRemove}
            disabled={loading}
            className="btn-danger text-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {loading ? 'Removing…' : 'Remove Admin'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface-900 border border-surface-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <h2 className="text-base font-semibold text-surface-100">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-surface-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
