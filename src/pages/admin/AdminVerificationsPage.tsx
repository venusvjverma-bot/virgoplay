import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, XCircle, Clock, Eye, AlertCircle, FileImage,
  X, ChevronRight, Users, ShieldCheck, Power,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { Creator, VerificationDocument, VerificationStatus } from '../../types';
import AdminNav from '../../components/AdminNav';

interface PendingRow extends Creator {
  doc: VerificationDocument | null;
}

interface AuditEntry {
  action: 'approved' | 'rejected';
  reason: string | null;
  created_at: string;
  admin_email: string | null;
}

interface DocUrls {
  govId:  string | null;
  selfie: string | null;
}

const STATUS_ORDER: Record<VerificationStatus, number> = { draft: -1, pending: 0, rejected: 1, approved: 2 };

export default function AdminVerificationsPage() {
  const { creator: admin } = useAuth();
  const [rows, setRows]               = useState<PendingRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<PendingRow | null>(null);
  const [auditEntry, setAuditEntry]   = useState<AuditEntry | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [docUrls, setDocUrls]         = useState<DocUrls>({ govId: null, selfie: null });
  const [docsLoading, setDocsLoading] = useState(false);
  const [busy, setBusy]               = useState(false);
  const [showReject, setShowReject]   = useState(false);
  const [rejectNote, setRejectNote]   = useState('');
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [deactivateToggled, setDeactivateToggled] = useState(false);
  const [deactivateBusy, setDeactivateBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: creators }, { data: docs }] = await Promise.all([
      supabase
        .from('creators')
        .select('*')
        .neq('role', 'admin')
        .in('verification_status', ['pending', 'approved', 'rejected'])
        .order('created_at', { ascending: true }),
      supabase.from('verification_documents').select('*'),
    ]);

    const docMap = new Map<string, VerificationDocument>();
    (docs as VerificationDocument[] ?? []).forEach(d => docMap.set(d.creator_id, d));

    const mapped = (creators as Creator[] ?? []).map(c => ({ ...c, doc: docMap.get(c.id) ?? null }));
    mapped.sort((a, b) => STATUS_ORDER[a.verification_status] - STATUS_ORDER[b.verification_status]);
    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Sync the toggle to the real DB state when switching creators
  useEffect(() => {
    setDeactivateToggled(selected?.is_temporarily_deactivated ?? false);
  }, [selected?.id]);

  // Load signed URLs whenever the selected creator changes
  useEffect(() => {
    if (!selected?.doc) { setDocUrls({ govId: null, selfie: null }); return; }
    setDocsLoading(true);
    setDocUrls({ govId: null, selfie: null });
    (async () => {
      const [govRes, selfieRes] = await Promise.all([
        selected.doc?.government_id_url
          ? supabase.storage.from('verification-docs').createSignedUrl(selected.doc.government_id_url, 3600)
          : Promise.resolve({ data: null }),
        selected.doc?.selfie_url
          ? supabase.storage.from('verification-docs').createSignedUrl(selected.doc.selfie_url, 3600)
          : Promise.resolve({ data: null }),
      ]);
      setDocUrls({ govId: govRes.data?.signedUrl ?? null, selfie: selfieRes.data?.signedUrl ?? null });
      setDocsLoading(false);
    })();
  }, [selected?.id]);

  // Fetch the latest audit log entry for non-pending creators
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
  }, [selected?.id]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function logAction(creatorId: string, action: 'approved' | 'rejected' | 'deactivated' | 'reactivated', reason?: string) {
    if (!admin?.id) return;
    await supabase.from('admin_audit_log').insert({
      admin_id:   admin.id,
      creator_id: creatorId,
      action,
      reason: reason ?? null,
    });
  }

  async function toggleDeactivation() {
    if (!selected || deactivateBusy) return;
    setDeactivateBusy(true);
    const newValue = !deactivateToggled;
    const { error } = await supabase.rpc('set_creator_deactivation', {
      target_creator_id: selected.id,
      deactivated: newValue,
    });
    if (error) {
      showToast('Failed to update deactivation: ' + error.message, false);
    } else {
      await logAction(selected.id, newValue ? 'deactivated' : 'reactivated');
      showToast(`@${selected.username} ${newValue ? 'temporarily deactivated' : 'reactivated'}`, true);
      setDeactivateToggled(newValue);
      await load();
    }
    setDeactivateBusy(false);
  }

  async function approve() {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase
      .from('creators')
      .update({ verification_status: 'approved' })
      .eq('id', selected.id);

    if (error) {
      showToast('Failed to approve: ' + error.message, false);
    } else {
      await logAction(selected.id, 'approved');
      showToast(`@${selected.username} approved`, true);
      setSelected(null);
      setShowReject(false);
      await load();
    }
    setBusy(false);
  }

  async function reject() {
    if (!selected) return;
    setBusy(true);
    const [{ error: statusErr }] = await Promise.all([
      supabase.from('creators').update({ verification_status: 'rejected' }).eq('id', selected.id),
      selected.doc && rejectNote.trim()
        ? supabase.from('verification_documents')
            .update({ admin_notes: rejectNote.trim() })
            .eq('id', selected.doc.id)
        : Promise.resolve({ error: null }),
    ]);

    if (statusErr) {
      showToast('Failed to reject: ' + statusErr.message, false);
    } else {
      await logAction(selected.id, 'rejected', rejectNote.trim() || undefined);
      showToast(`@${selected.username} rejected`, false);
      setRejectNote('');
      setShowReject(false);
      setSelected(null);
      await load();
    }
    setBusy(false);
  }

  function closeDrawer() {
    setSelected(null);
    setShowReject(false);
    setRejectNote('');
    setAuditEntry(null);
  }

  const pendingCount = rows.filter(r => r.verification_status === 'pending').length;

  return (
    <div className="min-h-screen bg-surface-950">
      <AdminNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="page-header">Creator Verifications</h1>
            <p className="text-sm text-surface-400 mt-1">
              Review identity documents and approve or reject each submission.
            </p>
          </div>
          {!loading && pendingCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-warning-500/10 border border-warning-500/20">
              <Clock className="w-4 h-4 text-warning-400" />
              <span className="text-warning-400 font-semibold">{pendingCount}</span>
              <span className="text-warning-400/70 text-sm">pending</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-accent-500/10 border border-accent-500/20 flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-accent-400" />
            </div>
            <h3 className="text-lg font-semibold text-surface-200 mb-1">No creators yet</h3>
            <p className="text-sm text-surface-500">Creator accounts will appear here once registered.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map(row => (
              <div key={row.id}
                className="card p-0 hover:border-surface-700 transition-all duration-150 overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary-600/20 flex items-center justify-center text-primary-400 font-bold flex-shrink-0">
                    {row.username[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 grid sm:grid-cols-3 gap-1">
                    <div>
                      <div className="font-medium text-surface-100 text-sm">@{row.username}</div>
                      <div className="text-xs text-surface-500 truncate">{row.email}</div>
                    </div>
                    <div className="hidden sm:block">
                      <div className="text-xs text-surface-500">Country</div>
                      <div className="text-sm text-surface-300">{row.country || '—'}</div>
                    </div>
                    <div className="hidden sm:block">
                      <div className="text-xs text-surface-500">Submitted</div>
                      <div className="text-sm text-surface-300">
                        {row.doc
                          ? new Date(row.doc.uploaded_at).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })
                          : 'No docs'}
                      </div>
                    </div>
                  </div>

                  {/* Status pill */}
                  <StatusPill status={row.verification_status} />

                  {/* Review button */}
                  <button onClick={() => setSelected(row)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium
                      bg-primary-600/15 hover:bg-primary-600/25 text-primary-400 border border-primary-600/20
                      transition-colors flex-shrink-0">
                    Review
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Review drawer ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={closeDrawer} />

          <div className="w-full max-w-xl bg-surface-900 border-l border-surface-800 flex flex-col overflow-hidden">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-600/20 flex items-center justify-center text-primary-400 font-bold">
                  {selected.username[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-surface-100">@{selected.username}</div>
                  <div className="text-xs text-surface-500">{selected.email}</div>
                </div>
              </div>
              <button onClick={closeDrawer}
                className="text-surface-500 hover:text-surface-300 transition-colors p-1.5 rounded-lg hover:bg-surface-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Creator details */}
              <section>
                <h4 className="section-title">Creator Details</h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Username',    value: `@${selected.username}` },
                    { label: 'Email',       value: selected.email },
                    { label: 'Creator ID',  value: selected.id },
                    { label: 'Country',     value: selected.country || '—' },
                    { label: 'Registered',  value: new Date(selected.created_at).toLocaleDateString() },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-surface-800/60 rounded-lg px-3 py-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-0.5">{label}</div>
                      <div className="text-sm text-surface-200 font-medium truncate">{value}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Verification Decision (approved / rejected) */}
              {selected.verification_status !== 'pending' && (
                <section>
                  <h4 className="section-title">Verification Decision</h4>
                  {auditLoading ? (
                    <div className="flex items-center gap-2 text-xs text-surface-500 py-2">
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
                </section>
              )}

              {/* Upload date */}
              {selected.doc && (
                <div className="flex items-center gap-2 text-xs text-surface-500 -mt-2">
                  <Clock className="w-3.5 h-3.5" />
                  Documents uploaded{' '}
                  {new Date(selected.doc.uploaded_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              )}

              {/* Documents */}
              <section>
                <h4 className="section-title">Identity Documents</h4>
                {!selected.doc ? (
                  <div className="rounded-xl border border-surface-700 bg-surface-800/40 p-8 text-center text-sm text-surface-500">
                    <FileImage className="w-8 h-8 mx-auto mb-2 text-surface-600" />
                    Creator has not uploaded any documents yet.
                  </div>
                ) : docsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <DocPreview label="Government ID" url={docUrls.govId} path={selected.doc.government_id_url} />
                    <DocPreview label="Verification Selfie" url={docUrls.selfie} path={selected.doc.selfie_url} />
                    {selected.doc.admin_notes && (
                      <div className="rounded-lg bg-warning-500/8 border border-warning-500/20 px-3 py-2.5 text-sm">
                        <span className="text-warning-400 font-medium">Previous rejection note: </span>
                        <span className="text-surface-400">{selected.doc.admin_notes}</span>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Temporary Deactivate — verified child creators only */}
              {selected.verification_status === 'approved'
                && !selected.is_content_master
                && !selected.is_super_admin && (
                <section>
                  <h4 className="section-title">Temporary Deactivate</h4>
                  <div className="rounded-xl border border-surface-700 bg-surface-800/40 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-surface-200">
                          <Power className="w-4 h-4 text-surface-400" />
                          Temporary Deactivate
                        </div>
                        <p className="text-xs text-surface-500 mt-1">
                          Temporarily suspend this child creator's account access.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleDeactivation}
                        disabled={deactivateBusy}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
                          deactivateToggled ? 'bg-danger-500' : 'bg-surface-600'
                        } ${deactivateBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                        aria-label="Toggle temporary deactivation"
                        aria-pressed={deactivateToggled}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                            deactivateToggled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* Reject note form (inline) — only shown for pending */}
              {showReject && selected.verification_status === 'pending' && (
                <section className="rounded-xl border border-danger-500/25 bg-danger-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-danger-400 text-sm font-medium">
                    <AlertCircle className="w-4 h-4" />Rejection Reason
                  </div>
                  <textarea rows={3} className="input-field resize-none text-sm"
                    placeholder="Describe why the documents are insufficient…"
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)} />
                  <p className="text-xs text-surface-500">
                    This message will be shown to the creator so they can re-submit.
                  </p>
                </section>
              )}
            </div>

            {/* Drawer actions — sticky footer */}
            <div className="px-6 py-4 border-t border-surface-800 bg-surface-900 flex-shrink-0">
              {selected.verification_status === 'approved' ? (
                // Approved: no action buttons
                <p className="text-xs text-surface-500 text-center">No further action required.</p>
              ) : selected.verification_status === 'rejected' ? (
                // Rejected: can re-approve; reject disabled
                !showReject ? (
                  <div className="flex gap-3">
                    <button onClick={approve} disabled={busy}
                      className="btn-accent flex-1 py-2.5 text-sm">
                      <CheckCircle className="w-4 h-4" />
                      {busy ? 'Saving…' : 'Approve'}
                    </button>
                    <button disabled
                      className="btn-danger flex-1 py-2.5 text-sm opacity-40 cursor-not-allowed">
                      <XCircle className="w-4 h-4" />Reject
                    </button>
                  </div>
                ) : null
              ) : (
                // Pending: both buttons active
                !showReject ? (
                  <div className="flex gap-3">
                    <button onClick={approve} disabled={busy}
                      className="btn-accent flex-1 py-2.5 text-sm">
                      <CheckCircle className="w-4 h-4" />
                      {busy ? 'Saving…' : 'Approve'}
                    </button>
                    <button onClick={() => setShowReject(true)} disabled={busy}
                      className="btn-danger flex-1 py-2.5 text-sm">
                      <XCircle className="w-4 h-4" />Reject
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => { setShowReject(false); setRejectNote(''); }}
                      className="btn-secondary flex-1 py-2.5 text-sm">
                      Cancel
                    </button>
                    <button onClick={reject} disabled={busy}
                      className="btn-danger flex-1 py-2.5 text-sm">
                      {busy ? 'Saving…' : 'Confirm Rejection'}
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={[
          'fixed bottom-5 right-5 z-[70] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl',
          'text-sm font-medium border transition-all duration-300',
          toast.ok
            ? 'bg-accent-900/90 border-accent-500/30 text-accent-300'
            : 'bg-danger-900/90 border-danger-500/30 text-danger-300',
        ].join(' ')}>
          {toast.ok
            ? <CheckCircle className="w-4 h-4 text-accent-400" />
            : <XCircle className="w-4 h-4 text-danger-400" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: VerificationStatus }) {
  if (status === 'approved') return (
    <span className="hidden md:inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full
      bg-accent-500/10 border border-accent-500/20 text-accent-400 flex-shrink-0">
      <CheckCircle className="w-3 h-3" />Approved
    </span>
  );
  if (status === 'rejected') return (
    <span className="hidden md:inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full
      bg-danger-500/10 border border-danger-500/20 text-danger-400 flex-shrink-0">
      <XCircle className="w-3 h-3" />Rejected
    </span>
  );
  return (
    <span className="hidden md:inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full
      bg-warning-500/10 border border-warning-500/20 text-warning-400 flex-shrink-0">
      <Clock className="w-3 h-3" />Pending
    </span>
  );
}

function DocPreview({ label, url, path }: { label: string; url: string | null; path: string | null | undefined }) {
  const [imgError, setImgError] = useState(false);
  const isPdf = path?.toLowerCase().endsWith('.pdf');

  return (
    <div className="rounded-xl border border-surface-700 bg-surface-800/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-700">
        <span className="text-xs font-medium text-surface-300">{label}</span>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors">
            <Eye className="w-3 h-3" />Open full size
          </a>
        )}
      </div>
      <div className="p-3">
        {!path ? (
          <div className="h-32 flex items-center justify-center text-sm text-surface-600">Not uploaded</div>
        ) : !url ? (
          <div className="h-32 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-surface-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isPdf ? (
          <div className="h-32 flex flex-col items-center justify-center gap-2 text-sm text-surface-400">
            <FileImage className="w-8 h-8 text-surface-500" />
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="text-primary-400 hover:text-primary-300 transition-colors">
              View PDF document
            </a>
          </div>
        ) : imgError ? (
          <div className="h-32 flex items-center justify-center text-sm text-surface-500">
            Could not load image —{' '}
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="text-primary-400 hover:text-primary-300 ml-1 transition-colors">
              open directly
            </a>
          </div>
        ) : (
          <img src={url} alt={label}
            onError={() => setImgError(true)}
            className="w-full max-h-64 object-contain rounded-lg bg-surface-950" />
        )}
      </div>
    </div>
  );
}
