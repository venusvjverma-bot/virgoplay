import { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, X, Eye, CheckCircle, XCircle,
  Plus, Minus, Loader2, AlertCircle, ArrowLeft, Mail,
  Calendar, Wallet, ShieldCheck, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import AdminNav from '../../components/AdminNav';

interface ClientRow {
  id: string;
  email: string;
  email_verified: boolean;
  is_active: boolean;
  credit_balance: number;
  created_at: string;
  full_name: string | null;
  phone: string | null;
  country: string | null;
}

interface TransactionRow {
  id: string;
  client_id: string;
  credits: number;
  transaction_type: 'grant' | 'spend';
  description: string | null;
  created_at: string;
}

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ClientRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('id, email, email_verified, is_active, credit_balance, created_at, full_name, phone, country')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load clients:', error.message);
    } else {
      setClients((data as ClientRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? clients.filter(c => c.email.toLowerCase().includes(search.trim().toLowerCase()))
    : clients;

  return (
    <div className="min-h-screen bg-surface-950">
      <AdminNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Clients', value: clients.length, icon: Users, color: 'text-primary-400' },
            { label: 'Verified', value: clients.filter(c => c.email_verified).length, icon: ShieldCheck, color: 'text-accent-400' },
            { label: 'Active', value: clients.filter(c => c.is_active).length, icon: CheckCircle, color: 'text-success-400' },
            { label: 'Total Credits', value: clients.reduce((sum, c) => sum + (c.credit_balance || 0), 0), icon: Wallet, color: 'text-warning-400' },
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

        {/* Client table */}
        <div className="card p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-surface-800">
            <h2 className="font-semibold text-surface-100">Clients</h2>
            <div className="relative">
              <Search className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by email…"
                className="pl-9 pr-3 py-1.5 rounded-lg text-xs bg-surface-800 border border-surface-700 text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-primary-600/40 transition-colors w-56"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-surface-500 text-sm">
              {search.trim() ? 'No clients match your search.' : 'No clients yet.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-surface-500 uppercase tracking-wider border-b border-surface-800">
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">Client ID</th>
                    <th className="px-5 py-3 font-medium">Registration Date</th>
                    <th className="px-5 py-3 font-medium text-right">Credit Balance</th>
                    <th className="px-5 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-surface-800/40 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
                          <span className="font-medium text-surface-100">{c.email}</span>
                          {!c.email_verified && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning-500/10 border border-warning-500/20 text-warning-400 font-medium">
                              Unverified
                            </span>
                          )}
                          {!c.is_active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger-500/10 border border-danger-500/20 text-danger-400 font-medium">
                              Inactive
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs text-surface-400">{c.id.slice(0, 8)}…</span>
                      </td>
                      <td className="px-5 py-4 text-surface-300">
                        {new Date(c.created_at).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="font-semibold text-surface-100">{c.credit_balance ?? 0}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => setSelected(c)}
                          className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <ClientDetailPanel
          client={selected}
          onClose={() => setSelected(null)}
          onUpdated={async () => {
            await load();
            const { data } = await supabase
              .from('clients')
              .select('id, email, email_verified, is_active, credit_balance, created_at, full_name, phone, country')
              .eq('id', selected.id)
              .maybeSingle();
            if (data) setSelected(data as ClientRow);
          }}
        />
      )}
    </div>
  );
}

function ClientDetailPanel({
  client,
  onClose,
  onUpdated,
}: {
  client: ClientRow;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    const { data, error } = await supabase
      .from('client_spending_history')
      .select('id, client_id, credits, transaction_type, description, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load transactions:', error.message);
    } else {
      setTransactions((data as TransactionRow[]) ?? []);
    }
    setTxLoading(false);
  }, [client.id]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [client.id]);

  async function toggleActive() {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .rpc('admin_update_client', {
          p_client_id: client.id,
          p_action: 'toggle_active',
        });
      if (error) throw new Error(error.message);
      if (data && data.success === false) throw new Error(data.error || 'Failed to toggle status');
      await onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function adjustCredits(type: 'grant' | 'spend') {
    const amount = parseInt(adjustAmount, 10);
    if (!amount || amount <= 0) {
      setError('Enter a positive number of credits.');
      return;
    }
    if (type === 'spend' && amount > client.credit_balance) {
      setError(`Cannot remove ${amount} credits — client only has ${client.credit_balance}.`);
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const signedAmount = type === 'grant' ? amount : -amount;

      const { data: rpcData, error: rpcError } = await supabase
        .rpc('admin_update_client', {
          p_client_id: client.id,
          p_action: 'adjust_credits',
          p_amount: signedAmount,
          p_description: adjustNote.trim() || undefined,
        });

      if (rpcError) throw new Error(rpcError.message);
      if (rpcData && rpcData.success === false) {
        throw new Error(rpcData.error || 'Failed to adjust credits');
      }

      setAdjustAmount('');
      setAdjustNote('');
      setSuccess(`${type === 'grant' ? 'Added' : 'Removed'} ${amount} credits.`);
      await onUpdated();
      await loadTransactions();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-surface-900 border-l border-surface-800 overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-800 sticky top-0 bg-surface-900 z-10">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-surface-400 hover:text-surface-200 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="font-semibold text-surface-100">Client Management</h3>
          </div>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Account info */}
          <div className="card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary-600/20 flex items-center justify-center text-primary-400 flex-shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-surface-100 truncate">{client.email}</div>
                <div className="text-xs text-surface-500 font-mono mt-0.5">{client.id}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm pt-1 border-t border-surface-800">
              <div>
                <span className="text-xs text-surface-500 uppercase tracking-wide">Full Name</span>
                <div className="text-surface-200 mt-0.5 font-medium">{client.full_name || '—'}</div>
              </div>
              <div>
                <span className="text-xs text-surface-500 uppercase tracking-wide">Phone</span>
                <div className="text-surface-200 mt-0.5 font-medium">{client.phone || '—'}</div>
              </div>
              <div>
                <span className="text-xs text-surface-500 uppercase tracking-wide">Country</span>
                <div className="text-surface-200 mt-0.5 font-medium">{client.country || '—'}</div>
              </div>
              <div>
                <span className="text-xs text-surface-500 uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="w-3 h-3" />Registered
                </span>
                <div className="text-surface-200 mt-0.5 font-medium">
                  {new Date(client.created_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Status badges */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-xl border p-4 ${client.email_verified ? 'border-accent-500/20 bg-accent-500/5' : 'border-warning-500/20 bg-warning-500/5'}`}>
              <div className="flex items-center gap-2 mb-1">
                {client.email_verified
                  ? <ShieldCheck className="w-4 h-4 text-accent-400" />
                  : <AlertCircle className="w-4 h-4 text-warning-400" />}
                <span className="text-xs font-medium text-surface-400 uppercase tracking-wider">Email</span>
              </div>
              <div className={`text-sm font-semibold ${client.email_verified ? 'text-accent-400' : 'text-warning-400'}`}>
                {client.email_verified ? 'Verified' : 'Unverified'}
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${client.is_active ? 'border-success-500/20 bg-success-500/5' : 'border-danger-500/20 bg-danger-500/5'}`}>
              <div className="flex items-center gap-2 mb-1">
                {client.is_active
                  ? <CheckCircle className="w-4 h-4 text-success-400" />
                  : <XCircle className="w-4 h-4 text-danger-400" />}
                <span className="text-xs font-medium text-surface-400 uppercase tracking-wider">Account</span>
              </div>
              <div className={`text-sm font-semibold ${client.is_active ? 'text-success-400' : 'text-danger-400'}`}>
                {client.is_active ? 'Active' : 'Deactivated'}
              </div>
            </div>
          </div>

          {/* Activate / Deactivate */}
          <button
            onClick={toggleActive}
            disabled={busy}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
              client.is_active
                ? 'bg-danger-500/10 border border-danger-500/20 text-danger-400 hover:bg-danger-500/20'
                : 'bg-success-500/10 border border-success-500/20 text-success-400 hover:bg-success-500/20'
            }`}
          >
            {client.is_active
              ? <><ToggleRight className="w-4 h-4" />Deactivate Client</>
              : <><ToggleLeft className="w-4 h-4" />Activate Client</>}
          </button>

          {/* Credit balance + adjustments */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-surface-200">Credit Balance</h4>
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-warning-400" />
                <span className="text-2xl font-bold text-surface-50">{client.credit_balance ?? 0}</span>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-surface-800">
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value)}
                  placeholder="Amount"
                  className="input-field text-sm flex-1"
                />
                <button
                  onClick={() => adjustCredits('grant')}
                  disabled={busy}
                  className="btn-accent text-sm gap-1.5 px-4 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add
                </button>
                <button
                  onClick={() => adjustCredits('spend')}
                  disabled={busy}
                  className="bg-danger-500/10 border border-danger-500/20 text-danger-400 hover:bg-danger-500/20 text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Minus className="w-4 h-4" />
                  Remove
                </button>
              </div>
              <input
                type="text"
                value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)}
                placeholder="Optional note (shown in transaction history)"
                className="input-field text-sm"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-success-500/10 border border-success-500/20 text-success-400 text-sm">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />{success}
              </div>
            )}
          </div>

          {/* Transaction history */}
          <div className="card">
            <h4 className="text-sm font-semibold text-surface-200 mb-4">Transaction History</h4>
            {txLoading ? (
              <div className="flex items-center gap-2 text-xs text-surface-500 py-4">
                <div className="w-3.5 h-3.5 border border-surface-500 border-t-transparent rounded-full animate-spin" />
                Loading transactions…
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-surface-500 py-4 text-center">No transactions yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {transactions.map(tx => (
                  <div key={tx.id} className="flex items-center gap-3 p-3 bg-surface-800/60 rounded-lg">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      tx.transaction_type === 'grant'
                        ? 'bg-accent-500/10 text-accent-400'
                        : 'bg-danger-500/10 text-danger-400'
                    }`}>
                      {tx.transaction_type === 'grant'
                        ? <Plus className="w-4 h-4" />
                        : <Minus className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-surface-200 font-medium">
                        {tx.transaction_type === 'grant' ? '+' : '−'}{tx.credits} credits
                      </div>
                      <div className="text-xs text-surface-500 truncate">
                        {tx.description || (tx.transaction_type === 'grant' ? 'Credit grant' : 'Credit spend')}
                      </div>
                    </div>
                    <div className="text-xs text-surface-500 flex-shrink-0">
                      {new Date(tx.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
