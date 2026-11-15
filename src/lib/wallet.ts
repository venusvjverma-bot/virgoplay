import { supabase } from './supabase';

export const IMAGE_COST = 0.08;
export const VIDEO_COST = 0.80;

export interface WalletInfo {
  id: string;
  available_balance: number;
  total_earnings: number;
}

export async function loadWallet(creatorId: string): Promise<WalletInfo | null> {
  let { data: wal } = await supabase
    .from('creator_wallets')
    .select('id, available_balance, total_earnings')
    .eq('creator_id', creatorId)
    .maybeSingle();

  if (!wal) {
    const { data: newWal, error: insErr } = await supabase
      .from('creator_wallets')
      .insert({ creator_id: creatorId })
      .select('id, available_balance, total_earnings')
      .single();
    if (insErr) throw insErr;
    wal = newWal;
  }

  return wal as WalletInfo;
}

export async function addTestFunds(creatorId: string, walletId: string): Promise<WalletInfo> {
  const { data: updated, error: updErr } = await supabase
    .rpc('add_test_funds', {
      p_wallet_id: walletId,
      p_amount: 1.00,
    });

  if (updErr) throw updErr;
  return updated as unknown as WalletInfo;
}

export async function deductGenerationCost(
  walletId: string,
  amount: number,
  description: string,
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const { data, error } = await supabase
    .rpc('deduct_wallet_balance', {
      p_wallet_id: walletId,
      p_amount: amount,
      p_description: description,
    });

  if (error) return { success: false, newBalance: 0, error: error.message };
  if (!data) return { success: false, newBalance: 0, error: 'Deduction failed' };

  const result = data as { success: boolean; new_balance: number; error?: string };
  return {
    success: result.success,
    newBalance: result.new_balance,
    error: result.error,
  };
}
