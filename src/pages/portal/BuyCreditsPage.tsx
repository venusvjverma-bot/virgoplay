import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, ArrowLeft, Loader2, CheckCircle, Info, Package, ShieldCheck, Receipt,
  FlaskConical, XCircle, Ban, RefreshCw, LogIn,
} from 'lucide-react';
import { useClientAuth } from '../../context/ClientAuthContext';
import { supabase } from '../../lib/supabase';

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;          // USD
  referencePrice?: number; // optional struck-through reference (USD)
  badge?: string;          // e.g. "Save 40%" / "Best Value"
  note: string;
  featured?: boolean;
}

interface PurchaseOrder {
  order_id: string;
  package_id: string;
  package_name: string | null;
  credit_amount: number;
  price_amount: string | number | null;
  currency: string | null;
  payment_provider: string | null;
  provider_transaction_ref: string | null;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  created_at: string;
  updated_at: string;
}

interface ActiveOrder {
  order_id: string;
  package_id: string;
  package_name: string | null;
  credit_amount: number;
  price_amount: string | number | null;
  currency: string | null;
  status: string;
}

const STATUS_STYLES: Record<PurchaseOrder['status'], string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
  refunded: 'bg-sky-50 text-sky-700 border-sky-200',
};

// Display-only package metadata. The server holds its own trusted copy of
// these definitions inside client_purchase_action; browser values are never
// used for pricing or fulfillment.
const PACKAGES: CreditPackage[] = [
  {
    id: 'starter', name: 'Starter', credits: 100, price: 0.99,
    note: 'Test-mode purchase — no real payment.',
  },
  {
    id: 'plus', name: 'Plus', credits: 500, price: 2.99, referencePrice: 4.99,
    badge: 'Save 40%', note: 'Test-mode purchase — no real payment.', featured: true,
  },
  {
    id: 'premium', name: 'Premium', credits: 1500, price: 7.99,
    badge: 'Best Value', note: 'Test-mode purchase — no real payment.',
  },
];

function formatUsd(amount: number | string | null | undefined): string {
  if (amount == null) return '';
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(n)) return '';
  return `$${n.toFixed(2)}`;
}

export default function BuyCreditsPage() {
  const navigate = useNavigate();
  const { client, loading, sessionToken, refreshClient } = useClientAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyErrorKind, setHistoryErrorKind] = useState<'session' | 'temporary'>('temporary');
  const [historyRetrying, setHistoryRetrying] = useState(false);

  useEffect(() => {
    if (!loading && !client) navigate('/client-signup', { replace: true });
  }, [loading, client, navigate]);

  // Purchase history: loaded via the session-token-verified RPC so a bare
  // client_id from the browser can never read someone else's orders.
  const loadHistory = useCallback(async (isRetry = false) => {
    if (!client || !sessionToken) return;
    if (isRetry) setHistoryRetrying(true);
    const { data, error } = await supabase.rpc('client_get_purchase_history', {
      p_client_id: client.id,
      p_session_token: sessionToken,
    });
    if (isRetry) setHistoryRetrying(false);
    if (error) {
      // Temporary failure (network, API schema cache). Keep the real error in
      // the console for diagnostics instead of swallowing it.
      console.error('[purchase-history] RPC request failed:', error.code, error.message);
      setHistoryErrorKind('temporary');
      setHistoryError('Could not load your purchase history. Please try again later.');
      setOrders(null);
      return;
    }
    if (!data || data.success !== true || !Array.isArray(data.orders)) {
      const msg = data?.error ?? 'Unknown error';
      console.error('[purchase-history] RPC rejected:', msg);
      // The RPC only ever returns success=false with an "Unauthorized" error
      // when the session token is invalid or expired (30-day lifetime).
      const sessionError = typeof msg === 'string' && msg.toLowerCase().includes('unauthorized');
      setHistoryErrorKind(sessionError ? 'session' : 'temporary');
      setHistoryError(
        sessionError
          ? 'Your session has expired. Please sign in again to view your purchase history.'
          : 'Could not load your purchase history. Please try again later.'
      );
      setOrders(null);
      return;
    }
    setOrders(data.orders as PurchaseOrder[]);
    setHistoryError(null);
  }, [client, sessionToken]);

  useEffect(() => {
    if (loading || !client || !sessionToken) return;
    void loadHistory();
  }, [loading, client, sessionToken, loadHistory]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }
  if (!client) return null;

  const balance = client.credit_balance ?? 0;

  function resetCheckout() {
    setSelectedId(null);
    setActiveOrder(null);
  }

  async function handleSelect(pkg: CreditPackage) {
    if (!client || !sessionToken || busy) return;
    setBusy(true);
    setNotice(null);
    setSelectedId(pkg.id);
    setActiveOrder(null);

    const { data, error } = await supabase.rpc('client_purchase_action', {
      p_client_id: client.id,
      p_session_token: sessionToken,
      p_action: 'create',
      p_package_id: pkg.id,
    });

    setBusy(false);
    if (error || !data || data.success !== true || !data.order) {
      const msg = error?.message || data?.error || 'Could not create the order. Please try again.';
      setNotice({ ok: false, text: msg });
      setSelectedId(null);
      return;
    }
    setActiveOrder({
      order_id: data.order.order_id,
      package_id: data.order.package_id,
      package_name: data.order.package_name,
      credit_amount: data.order.credit_amount,
      price_amount: data.order.price_amount,
      currency: data.order.currency,
      status: data.order.status,
    });
    setNotice({
      ok: true,
      text: `Test order ${data.order.order_id} created — pending. No real payment is involved.`,
    });
    void loadHistory();
  }

  async function handleSimulatePayment() {
    if (!client || !sessionToken || !activeOrder || busy) return;
    setBusy(true);
    setNotice(null);

    const { data, error } = await supabase.rpc('client_purchase_action', {
      p_client_id: client.id,
      p_session_token: sessionToken,
      p_action: 'simulate_payment',
      p_package_id: activeOrder.package_id,
    });

    setBusy(false);
    if (error || !data || data.success !== true) {
      const msg = error?.message || data?.error || 'Test payment could not be completed.';
      setNotice({ ok: false, text: msg });
      return;
    }

    // Database confirmed fulfillment: show success with authoritative balance.
    const newBalance = typeof data.credit_balance === 'number' ? data.credit_balance : null;
    setActiveOrder(null);
    setSelectedId(null);
    setNotice({
      ok: true,
      text: `TEST TRANSACTION SUCCESSFUL — ${data.credits_granted ?? activeOrder.credit_amount} credits granted for order ${data.order_id}. ` +
        (newBalance != null ? `New balance: ${newBalance} credits. ` : '') +
        'No real payment was processed.',
    });
    // Refresh authoritative balance from the database.
    void refreshClient();
    void loadHistory();
  }

  async function handleCancelOrder() {
    if (!client || !sessionToken || !activeOrder || busy) return;
    setBusy(true);
    setNotice(null);

    const { data, error } = await supabase.rpc('client_purchase_action', {
      p_client_id: client.id,
      p_session_token: sessionToken,
      p_action: 'cancel',
      p_package_id: activeOrder.package_id,
    });

    setBusy(false);
    if (error || !data || data.success !== true) {
      const msg = error?.message || data?.error || 'Could not cancel the order.';
      setNotice({ ok: false, text: msg });
      return;
    }
    setNotice({ ok: true, text: `Order ${data.order_id} cancelled. No credits were granted.` });
    resetCheckout();
    void loadHistory();
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar — banner header */}
      <header className="vp-header-banner sticky top-0 z-30 border-b border-slate-200/60 relative">
        <img src="/client-header-banner.png" alt="VirgoPlay" className="block w-full h-auto" />
        <div className="absolute top-1/2 right-3 -translate-y-1/2 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-sm font-semibold shadow-md ring-2 ring-white/80">
          {(client.full_name || client.email).charAt(0).toUpperCase()}
        </div>
      </header>

      <main className="flex-1 pb-24">
        <div className="max-w-2xl mx-auto px-5 pt-6 space-y-5">
          {/* Back + heading */}
          <div>
            <button
              onClick={() => navigate('/client-welcome')}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-600 transition-colors mb-3"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Buy Credits</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Choose a credit package below. This checkout is in test mode.
            </p>
          </div>

          {/* TEST MODE banner */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-sm text-amber-800">
            <FlaskConical className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>TEST MODE — NO REAL PAYMENT.</strong> Checkout is a simulated demo. No payment
              provider is connected, no money is charged, and purchases are labelled as test
              transactions in your history.
            </span>
          </div>

          {/* Current balance */}
          <section className="bg-gradient-to-br from-violet-500 to-indigo-500 rounded-2xl shadow-md p-5 text-white relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
            <div className="relative flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-white/80" />
                  <span className="text-xs font-medium text-white/80 uppercase tracking-wider">Current Balance</span>
                </div>
                <div className="text-4xl font-bold tracking-tight">{balance}</div>
                <div className="text-sm text-white/70 mt-1">Credits</div>
              </div>
            </div>
          </section>

          {/* Active test order checkout box */}
          {activeOrder && (
            <section className="relative bg-white rounded-2xl border-2 border-violet-300 shadow-md p-5">
              <span className="absolute -top-2.5 left-5 px-2.5 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-bold uppercase tracking-wider shadow-sm">
                Test Order — Pending
              </span>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-800">
                    {activeOrder.package_name} — {activeOrder.credit_amount} credits
                  </h3>
                  <div className="text-xs text-slate-400 mt-1">
                    Order <span className="font-mono">{activeOrder.order_id}</span>
                    {activeOrder.price_amount != null && activeOrder.currency
                      ? ` · ${formatUsd(activeOrder.price_amount)} ${activeOrder.currency.toUpperCase()}`
                      : ''}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    This is a simulated checkout. Confirming below grants credits as a clearly-labelled
                    test transaction — no payment provider is involved.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleSimulatePayment}
                  disabled={busy}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:from-violet-600 hover:to-indigo-600 hover:shadow-md transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Simulate Payment (Test — No Real Charge)'}
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={busy}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Ban className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
                  Cancel
                </button>
              </div>
            </section>
          )}

          {/* Packages */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Credit Packages</h2>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {PACKAGES.map((pkg) => {
                const selected = selectedId === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    className={`relative bg-white rounded-2xl border shadow-sm p-5 transition-all duration-200 ${
                      selected
                        ? 'border-violet-300 ring-2 ring-violet-100'
                        : 'border-slate-200/70 hover:border-violet-200 hover:shadow-md'
                    }`}
                  >
                    {pkg.badge && (
                      <span
                        className={`absolute -top-2.5 left-5 px-2.5 py-0.5 rounded-full text-white text-[10px] font-bold uppercase tracking-wider shadow-sm ${
                          pkg.id === 'plus'
                            ? 'bg-gradient-to-r from-violet-500 to-indigo-500'
                            : 'bg-emerald-500'
                        }`}
                      >
                        {pkg.badge}
                      </span>
                    )}
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-800">{pkg.name}</h3>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span className="text-2xl font-bold text-violet-600 tracking-tight">{pkg.credits}</span>
                          <span className="text-sm text-slate-400 font-medium">credits</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{pkg.note}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {/* Price block: reference price struck through for Plus, else single price */}
                        {pkg.referencePrice != null ? (
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm text-slate-400 line-through">
                              {formatUsd(pkg.referencePrice)}
                            </span>
                            <span className="text-lg font-bold text-slate-800">
                              {formatUsd(pkg.price)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-lg font-bold text-slate-800">{formatUsd(pkg.price)}</span>
                        )}
                        <button
                          onClick={() => handleSelect(pkg)}
                          disabled={busy || activeOrder !== null}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed ${
                            selected
                              ? 'bg-violet-100 text-violet-700 border border-violet-300'
                              : 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:from-violet-600 hover:to-indigo-600 hover:shadow-md'
                          }`}
                        >
                          {selected ? 'Selected' : 'Select Package'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Checkout notice */}
          {notice && (
            <div
              className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-sm ${
                notice.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border-rose-200 text-rose-600'
              }`}
            >
              {notice.ok ? (
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <span>{notice.text}</span>
            </div>
          )}

          {/* Purchase history */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Purchase History</h2>
            </div>
            {historyError ? (
              <div className="px-4 py-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-600">
                <div className="flex items-start gap-2.5">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{historyError}</span>
                </div>
                <div className="mt-3">
                  {historyErrorKind === 'session' ? (
                    <button
                      onClick={() => navigate('/client-signup', { replace: true })}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      Sign In Again
                    </button>
                  ) : (
                    <button
                      onClick={() => void loadHistory(true)}
                      disabled={historyRetrying}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      {historyRetrying
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5" />}
                      Try Again
                    </button>
                  )}
                </div>
              </div>
            ) : orders === null ? (
              <div className="flex items-center justify-center py-6 text-slate-300">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : orders.length === 0 ? (
              <div className="px-4 py-5 rounded-xl bg-white border border-slate-200/70 text-sm text-slate-400 text-center">
                No purchases have been made yet. When you complete a credit purchase, your orders and
                their status will appear here.
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block bg-white rounded-xl border border-slate-200/70 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200/70 text-left">
                        <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Package</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Order ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.order_id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/40 transition-colors">
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            <span className="block text-xs text-slate-300">
                              {new Date(order.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-slate-800">{order.package_name || order.package_id}</span>
                            <span className="block text-xs text-slate-400">{order.credit_amount} credits</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {order.price_amount != null && order.currency
                              ? <><span className="font-medium">{formatUsd(order.price_amount)}</span> {order.currency.toUpperCase()}</>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="block text-xs font-semibold text-amber-700">Test transaction</span>
                            <span className="block text-[11px] text-slate-300">No real payment</span>
                            {order.provider_transaction_ref && (
                              <span className="block text-[11px] font-mono text-slate-400 mt-0.5 break-all" title="Provider transaction reference">
                                Ref: {order.provider_transaction_ref}
                              </span>
                            )}
                            {order.payment_provider && !order.provider_transaction_ref && (
                              <span className="block text-[11px] text-slate-300">via {order.payment_provider}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${STATUS_STYLES[order.status] || STATUS_STYLES.cancelled}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-mono text-[11px] text-slate-400 break-all" title={order.order_id}>
                              {order.order_id.slice(0, 8)}…
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile stacked cards */}
                <div className="sm:hidden space-y-3">
                  {orders.map((order) => (
                    <div key={order.order_id} className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-800">
                              {order.package_name || order.package_id}
                            </span>
                            <span className="text-xs text-slate-400">{order.credit_amount} credits</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {order.price_amount != null && order.currency
                              ? <>{formatUsd(order.price_amount)} {order.currency.toUpperCase()}</>
                              : '—'}
                          </div>
                        </div>
                        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLES[order.status] || STATUS_STYLES.cancelled}`}>
                          {order.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 mt-2.5 pt-2.5 border-t border-slate-100">
                        <span className="text-xs text-slate-400">
                          {new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          {' · '}
                          {new Date(order.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <span className="font-mono text-[11px] text-slate-300" title={order.order_id}>
                          #{order.order_id.slice(0, 8)}
                        </span>
                      </div>
                      <div className="mt-2">
                        <span className="text-[11px] font-semibold text-amber-700">Test transaction</span>
                        <span className="text-[11px] text-slate-300"> — no real payment</span>
                        {order.provider_transaction_ref && (
                          <span className="block text-[11px] font-mono text-slate-400 mt-0.5 break-all">
                            Ref: {order.provider_transaction_ref}
                          </span>
                        )}
                        {order.payment_provider && !order.provider_transaction_ref && (
                          <span className="block text-[11px] text-slate-300">via {order.payment_provider}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Assurance note */}
          <section className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-100/70 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-300" />
            <span>
              All checkout activity is test-mode only. No payment provider is connected and no real
              money is charged. Orders, balances, and history updates are recorded in the database as
              clearly-labelled test transactions.
            </span>
          </section>
        </div>
      </main>
    </div>
  );
}
