import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, UserPlus, UserMinus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { AdminAuditLog } from '../../types';
import AdminNav from '../../components/AdminNav';

interface AuditRow extends AdminAuditLog {
  creator_username?: string;
  creator_email?: string;
  admin_email?: string;
}

export default function AdminAuditPage() {
  const [rows, setRows]       = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    // admin_audit_log_with_email view provides admin_email but omits target_email.
    // Query the base table in parallel to get target_email, then merge by id.
    const [viewRes, baseRes] = await Promise.all([
      supabase
        .from('admin_audit_log_with_email')
        .select(`*, creators:creator_id ( username, email )`)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('admin_audit_log')
        .select('id, target_email')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (!viewRes.error && viewRes.data) {
      // Build a lookup map from base table so we can attach target_email
      const targetMap: Record<string, string | null> = {};
      if (!baseRes.error && baseRes.data) {
        for (const r of baseRes.data) targetMap[r.id] = r.target_email;
      }

      setRows(viewRes.data.map((r: any) => {
        const target_email = targetMap[r.id] ?? null;
        return {
          ...r,
          creator_username: r.creators?.username,
          // Prefer the joined creator email; fall back to target_email
          // so admin_created / admin_removed rows always show an address
          creator_email: r.creators?.email ?? target_email,
          admin_email:   r.admin_email,
        };
      }));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-surface-950">
      <AdminNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="page-header">Audit Log</h1>
            <p className="text-sm text-surface-400 mt-1">
              All admin actions: approvals, rejections, and admin account changes.
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="btn-secondary text-xs px-3 py-2 gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-surface-500 text-sm">
              No audit log entries yet.
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="grid grid-cols-[1fr_1fr_140px_1fr_100px] gap-4 px-5 py-3 border-b border-surface-800 text-[11px] font-medium text-surface-500 uppercase tracking-wider hidden lg:grid">
                <div>Subject</div>
                <div>Reason / Note</div>
                <div>Action</div>
                <div>Date &amp; Time</div>
                <div>Admin</div>
              </div>

              <div className="divide-y divide-surface-800/60">
                {rows.map(row => (
                  <div key={row.id}
                    className="px-5 py-4 hover:bg-surface-800/30 transition-colors lg:grid lg:grid-cols-[1fr_1fr_140px_1fr_100px] lg:gap-4 lg:items-center space-y-1.5 lg:space-y-0">

                    {/* Subject */}
                    <div>
                      <div className="text-sm font-medium text-surface-200">
                        {row.creator_username ? `@${row.creator_username}` : '—'}
                      </div>
                      <div className="text-xs text-surface-500 truncate">
                        {row.creator_email ?? (row.creator_id ? row.creator_id.slice(0, 8) + '…' : '—')}
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="text-sm text-surface-400 line-clamp-2">
                      {row.reason || <span className="text-surface-600 italic">No reason provided</span>}
                    </div>

                    {/* Action badge */}
                    <div>
                      <ActionBadge action={row.action} />
                    </div>

                    {/* Timestamp */}
                    <div className="flex items-center gap-1.5 text-xs text-surface-500">
                      <Clock className="w-3 h-3" />
                      {new Date(row.created_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>

                    {/* Acting admin */}
                    <div className="text-xs text-surface-500 truncate" title={row.admin_email ?? row.admin_id}>
                      {row.admin_email ?? row.admin_id.slice(0, 8) + '…'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: AdminAuditLog['action'] }) {
  switch (action) {
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-400 bg-accent-500/10 border border-accent-500/20 px-2.5 py-1 rounded-full">
          <CheckCircle className="w-3 h-3" />Approved
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-danger-400 bg-danger-500/10 border border-danger-500/20 px-2.5 py-1 rounded-full">
          <XCircle className="w-3 h-3" />Rejected
        </span>
      );
    case 'admin_created':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-400 bg-primary-500/10 border border-primary-500/20 px-2.5 py-1 rounded-full">
          <UserPlus className="w-3 h-3" />Admin Created
        </span>
      );
    case 'admin_removed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-400 bg-warning-500/10 border border-warning-500/20 px-2.5 py-1 rounded-full">
          <UserMinus className="w-3 h-3" />Admin Removed
        </span>
      );
  }
}
