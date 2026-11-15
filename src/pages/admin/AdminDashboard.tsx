import { useState, useEffect, useCallback } from 'react';
import {
  Users, ShieldCheck, Clock, CheckCircle, XCircle, Eye,
  X, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { Creator, VerificationDocument } from '../../types';
import AdminNav from '../../components/AdminNav';

interface CreatorRow extends Creator { doc?: VerificationDocument }
type Filter = 'all' | 'draft' | 'pending' | 'approved' | 'rejected';

interface AuditEntry {
  action: 'approved' | 'rejected';
  reason: string | null;
  created_at: string;
  admin_email: string | null;
}

export default function AdminDashboard() {
  const { creator: admin } = useAuth();
  const [rows, setRows]         = useState<CreatorRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<Filter>('all');
  const [selected, setSelected] = useState<CreatorRow | null>(null);
  const [busy, setBusy]         = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [auditEntry, setAuditEntry]     = useState<AuditEntry | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: creators }, { data: docs }] = await Promise.all([
      supabase.from('creators').select('*').neq('role', 'admin').order('created_at', { ascending: false }),
      supabase.from('verification_documents').select('*'),
    ]);
    if (!creators) { setLoading(false); return; }
    const docMap = new Map<string, VerificationDocument>();
    (docs as VerificationDocument[] ?? []).forEach(d => docMap.set(d.creator_id, d));
    setRows((creators as Creator[]).map(c => ({ ...c, doc: docMap.get(c.id) })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setAuditEntry(null);
    if (!selected || selected.verification_status === 'pending') return;
    setAuditLoading(true);
    (async () => {
      const { data } = await supabase
        .from('admin_audit_log_with_email')
        .select('action, reason, created_at, admin_email')
        .eq('creator_id', selected.id)
        .in('action', ['approved', 'rejected'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setAuditEntry(data as AuditEntry | null);
      setAuditLoading(false);
    })();
  }, [selected?.id, selected?.verification_status]);

  async function approve(id: string) {
    setBusy(true);
    await supabase.from('creators').update({ verification_status: 'approved' }).eq('id', id);
    await supabase.from('admin_audit_log').insert({ admin_id: admin!.id, creator_id: id, action: 'approved' });
    await load(); setSelected(null); setBusy(false);
  }

  async function reject(id: string) {
    setBusy(true);
    await supabase.from('creators').update({ verification_status: 'rejected' }).eq('id', id);
    if (selected?.doc && rejectNote.trim()) {
      await supabase.from('verification_documents')
        .update({ admin_notes: rejectNote }).eq('id', selected.doc.id);
    }
    await supabase.from('admin_audit_log').insert({
      admin_id: admin!.id, creator_id: id, action: 'rejected',
      reason: rejectNote.trim() || null,
    });
    setRejectNote(''); setShowReject(false);
    await load(); setSelected(null); setBusy(false);
  }

  async function viewDoc(path: string) {
    const { data } = await supabase.storage
      .from('verification-docs').createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  function closePanel() {
    setSelected(null);
    setShowReject(false);
    setRejectNote('');
    setAuditEntry(null);
  }

  const counts = {
    all:      rows.length,
    draft:    rows.filter(r => r.verification_status === 'draft').length,
    pending:  rows.filter(r => r.verification_status === 'pending').length,
    approved: rows.filter(r => r.verification_status === 'approved').length,
    rejected: rows.filter(r => r.verification_status === 'rejected').length,
  };
  const filtered = rows.filter(r => filter === 'all' || r.verification_status === filter);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all',      label: `All (${counts.all})` },
    { id: 'draft',    label: `Not Started (${counts.draft})` },
    { id: 'pending',  label: `Pending (${counts.pending})` },
    { id: 'approved', label: `Approved (${counts.approved})` },
    { id: 'rejected', label: `Rejected (${counts.rejected})` },
  ];

  return (
    <div className="min-h-screen bg-surface-950">
      <AdminNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            { label: 'Total Creators', value: counts.all,      icon: Users,       color: 'text-primary-400' },
            { label: 'Not Started',    value: counts.draft,    icon: Clock,       color: 'text-surface-400' },
            { label: 'Pending Review', value: counts.pending,  icon: Clock,       color: 'text-warning-400' },
            { label: 'Approved',       value: counts.approved, icon: CheckCircle, color: 'text-accent-400'  },
            { label: 'Rejected',       value: counts.rejected, icon: XCircle,     color: 'text-danger-400'  },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">{label}</span>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className="text-3xl font-bold text-surface-50">{value}</div>
            </div>
          ))}
        </div>

        {/* Creator table */}
        <div className="card p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-surface-800">
            <h2 className="font-semibold text-surface-100">Creators</h2>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={[
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    filter === f.id
                      ? 'bg-primary-600/20 text-primary-400 border border-primary-600/30'
                      : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800',
                  ].join(' ')}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-surface-500 text-sm">No creators in this category.</div>
          ) : (
            <div className="divide-y divide-surface-800">
              {filtered.map(c => (
                <div key={c.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-800/40 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-primary-600/20 flex items-center justify-center text-primary-400 font-semibold text-sm flex-shrink-0">
                    {c.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-surface-100 text-sm">@{c.username}</span>
                      <span className="text-surface-500 text-xs">{c.country}</span>
                    </div>
                    <div className="text-xs text-surface-500 truncate">{c.email}</div>
                  </div>
                  <div className="hidden sm:block">
                    {c.doc
                      ? <span className="text-xs text-accent-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3" />Docs</span>
                      : <span className="text-xs text-surface-600">No docs</span>}
                  </div>
                  <StatusBadge status={c.verification_status} />
                  <button onClick={() => setSelected(c)} className="btn-secondary text-xs px-3 py-1.5 gap-1.5 flex-shrink-0">
                    <Eye className="w-3.5 h-3.5" />Review
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Review side panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={closePanel} />
          <div className="w-full max-w-lg bg-surface-900 border-l border-surface-800 overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-surface-800 sticky top-0 bg-surface-900 z-10">
              <h3 className="font-semibold text-surface-100">Review Creator</h3>
              <button onClick={closePanel}
                className="text-surface-400 hover:text-surface-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Creator info */}
              <div className="card space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary-600/20 flex items-center justify-center text-primary-400 font-bold text-xl flex-shrink-0">
                    {selected.username[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-surface-100">@{selected.username}</div>
                    <div className="text-sm text-surface-400">{selected.email}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm pt-1 border-t border-surface-800">
                  <div>
                    <span className="text-xs text-surface-500 uppercase tracking-wide">Country</span>
                    <div className="text-surface-200 mt-0.5 font-medium">{selected.country}</div>
                  </div>
                  <div>
                    <span className="text-xs text-surface-500 uppercase tracking-wide">Registered</span>
                    <div className="text-surface-200 mt-0.5 font-medium">
                      {new Date(selected.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-surface-500 uppercase tracking-wide">Status</span>
                    <div className="mt-1.5"><StatusBadge status={selected.verification_status} /></div>
                  </div>
                </div>
              </div>

              {/* Verification Decision */}
              {selected.verification_status !== 'pending' && (
                <div>
                  {auditLoading ? (
                    <div className="flex items-center gap-2 text-xs text-surface-500 py-1">
                      <div className="w-3.5 h-3.5 border border-surface-500 border-t-transparent rounded-full animate-spin" />
                      Loading decision details…
                    </div>
                  ) : selected.verification_status === 'approved' ? (
                    <div className="rounded-xl border border-accent-500/20 bg-accent-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-accent-400 text-sm font-medium">
                        <CheckCircle className="w-4 h-4" />Creator is verified — portal is live.
                      </div>
                      {auditEntry && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-surface-800/60 rounded-lg px-3 py-2.5">
                            <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-0.5">Approved On</div>
                            <div className="text-sm text-surface-200 font-medium">
                              {new Date(auditEntry.created_at).toLocaleString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </div>
                          </div>
                          <div className="bg-surface-800/60 rounded-lg px-3 py-2.5">
                            <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-0.5">Approved By</div>
                            <div className="text-sm text-surface-200 font-medium truncate" title={auditEntry.admin_email ?? undefined}>
                              {auditEntry.admin_email ?? '—'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-danger-500/20 bg-danger-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-danger-400 text-sm font-medium">
                        <XCircle className="w-4 h-4" />Verification was rejected.
                      </div>
                      {auditEntry && (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-surface-800/60 rounded-lg px-3 py-2.5">
                              <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-0.5">Rejected On</div>
                              <div className="text-sm text-surface-200 font-medium">
                                {new Date(auditEntry.created_at).toLocaleString('en-US', {
                                  month: 'short', day: 'numeric', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </div>
                            </div>
                            <div className="bg-surface-800/60 rounded-lg px-3 py-2.5">
                              <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-0.5">Rejected By</div>
                              <div className="text-sm text-surface-200 font-medium truncate" title={auditEntry.admin_email ?? undefined}>
                                {auditEntry.admin_email ?? '—'}
                              </div>
                            </div>
                          </div>
                          {auditEntry.reason && (
                            <div className="bg-surface-800/60 rounded-lg px-3 py-2.5">
                              <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-0.5">Rejection Reason</div>
                              <div className="text-sm text-surface-300">{auditEntry.reason}</div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Documents */}
              <div className="card">
                <h4 className="text-sm font-semibold text-surface-200 mb-4">Verification Documents</h4>
                {!selected.doc ? (
                  <p className="text-sm text-surface-500">No documents uploaded yet.</p>
                ) : (
                  <div className="space-y-3">
                    <DocRow label="Government ID"       path={selected.doc.government_id_url} onView={viewDoc} />
                    <DocRow label="Verification Selfie" path={selected.doc.selfie_url}        onView={viewDoc} />
                    {selected.doc.admin_notes && (
                      <div className="p-3 bg-surface-800 rounded-lg text-sm text-surface-400">
                        <span className="text-surface-300 font-medium">Previous note: </span>
                        {selected.doc.admin_notes}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              {selected.verification_status === 'draft' ? (
                <div className="card border-surface-700/40 bg-surface-800/30">
                  <p className="text-sm text-surface-500 text-center">
                    Creator has not submitted documents yet — no action required.
                  </p>
                </div>
              ) : selected.verification_status === 'approved' ? null : selected.verification_status === 'rejected' ? (
                <div className="flex gap-3">
                  <button onClick={() => approve(selected.id)} disabled={busy} className="btn-accent flex-1">
                    <CheckCircle className="w-4 h-4" />{busy ? 'Saving...' : 'Approve'}
                  </button>
                  <button disabled className="btn-danger flex-1 opacity-40 cursor-not-allowed">
                    <XCircle className="w-4 h-4" />Reject
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => approve(selected.id)} disabled={busy} className="btn-accent flex-1">
                    <CheckCircle className="w-4 h-4" />{busy ? 'Saving...' : 'Approve'}
                  </button>
                  <button onClick={() => setShowReject(true)} disabled={busy} className="btn-danger flex-1">
                    <XCircle className="w-4 h-4" />Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject note modal */}
      {showReject && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowReject(false)} />
          <div className="relative bg-surface-900 border border-surface-700 rounded-xl p-6 w-full max-w-md animate-slide-up shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-danger-400" />
              <h3 className="font-semibold text-surface-100">Reject Verification</h3>
            </div>
            <p className="text-sm text-surface-400 mb-4">
              Provide a reason for rejection — this will be visible to the creator.
            </p>
            <textarea rows={3} className="input-field resize-none mb-4"
              placeholder="e.g. The government ID photo is too blurry to read."
              value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
            <div className="flex gap-3">
              <button onClick={() => setShowReject(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => reject(selected.id)} disabled={busy} className="btn-danger flex-1">
                {busy ? 'Saving...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') return <span className="badge-approved"><CheckCircle className="w-3 h-3" />Approved</span>;
  if (status === 'rejected') return <span className="badge-rejected"><XCircle className="w-3 h-3" />Rejected</span>;
  if (status === 'pending')  return <span className="badge-pending"><Clock className="w-3 h-3" />Pending</span>;
  return <span className="badge-pending opacity-60"><Clock className="w-3 h-3" />Not Started</span>;
}

function DocRow({
  label, path, onView,
}: {
  label: string;
  path: string | null | undefined;
  onView: (p: string) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-surface-800 rounded-lg gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-surface-200">{label}</div>
        {path
          ? <div className="text-xs text-surface-500 font-mono truncate">{path.split('/').pop()}</div>
          : <div className="text-xs text-surface-600">Not uploaded</div>}
      </div>
      {path && (
        <button onClick={() => onView(path)} className="btn-secondary text-xs px-3 py-1.5 gap-1.5 flex-shrink-0">
          <Eye className="w-3.5 h-3.5" />View
        </button>
      )}
    </div>
  );
}
