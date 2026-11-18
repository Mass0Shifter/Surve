import { env, HttpError, supabaseAdmin } from './server.js';
import { isFrequency, isPaidTier, periodMs, priceNGN } from '../../shared/pricing.js';

const PAYSTACK = 'https://api.paystack.co';

export async function paystack<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${PAYSTACK}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const body: any = await r.json().catch(() => ({}));
  if (!r.ok || body.status === false) {
    throw new HttpError(502, `Payment provider error: ${body.message || r.statusText}`);
  }
  return body as T;
}

/**
 * Verifies a transaction with Paystack and, if it is a genuine successful
 * charge for the expected amount, upgrades the user. Idempotent.
 */
export async function fulfil(reference: string): Promise<{ status: 'SUCCESS' | 'PENDING' | 'FAILED'; tier?: string; expiresAt?: string }> {
  const db = supabaseAdmin();
  const { data: tx, error } = await db
    .from('payment_transactions')
    .select('*')
    .eq('reference', reference)
    .maybeSingle();
  if (error) throw new HttpError(500, 'Could not read transaction');
  if (!tx) throw new HttpError(404, 'Unknown payment reference');

  if (tx.status === 'SUCCESS') {
    const { data: p } = await db.from('profiles').select('subscription_tier, subscription_expires_at').eq('id', tx.user_id).single();
    return { status: 'SUCCESS', tier: p?.subscription_tier, expiresAt: p?.subscription_expires_at };
  }

  const v = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  const d = v.data;
  const expectedKobo = Math.round(Number(tx.amount) * 100);

  if (d.status !== 'success') {
    if (['failed', 'abandoned', 'reversed'].includes(d.status)) {
      await db.from('payment_transactions').update({ status: 'FAILED' }).eq('id', tx.id).eq('status', 'PENDING');
      return { status: 'FAILED' };
    }
    return { status: 'PENDING' };
  }

  if (d.amount < expectedKobo || d.currency !== tx.currency) {
    await db.from('payment_transactions').update({ status: 'FAILED' }).eq('id', tx.id);
    throw new HttpError(400, 'Payment amount did not match the selected plan.');
  }
  if (!isPaidTier(tx.tier) || !isFrequency(tx.frequency)) throw new HttpError(500, 'Corrupt transaction record');

  // Claim the transaction atomically so concurrent webhook + redirect don't double-extend.
  const { data: claimed } = await db
    .from('payment_transactions')
    .update({ status: 'SUCCESS', paid_at: new Date(d.paid_at || Date.now()).toISOString(), receipt_number: `REC-${new Date().getFullYear()}-${String(d.id).slice(-8)}` })
    .eq('id', tx.id)
    .eq('status', 'PENDING')
    .select('id');

  const { data: profile } = await db
    .from('profiles')
    .select('subscription_tier, subscription_expires_at')
    .eq('id', tx.user_id)
    .single();

  if (claimed && claimed.length > 0) {
    // Extend from the later of now / current expiry when renewing the same tier.
    const now = Date.now();
    const current = profile?.subscription_expires_at ? Date.parse(profile.subscription_expires_at) : 0;
    const base = profile?.subscription_tier === tx.tier && current > now ? current : now;
    const expiresAt = new Date(base + periodMs(tx.frequency)).toISOString();
    const { error: upErr } = await db
      .from('profiles')
      .update({ subscription_tier: tx.tier, subscription_expires_at: expiresAt })
      .eq('id', tx.user_id);
    if (upErr) throw new HttpError(500, 'Payment received but the account upgrade failed. Contact support with your reference.');
    return { status: 'SUCCESS', tier: tx.tier, expiresAt };
  }

  return { status: 'SUCCESS', tier: profile?.subscription_tier, expiresAt: profile?.subscription_expires_at };
}

export function amountFor(tier: unknown, frequency: unknown): { tier: 'PROFESSIONAL' | 'ENTERPRISE'; frequency: 'monthly' | 'annual'; amount: number } {
  if (!isPaidTier(tier)) throw new HttpError(400, 'Choose a paid plan.');
  if (!isFrequency(frequency)) throw new HttpError(400, 'Choose monthly or annual billing.');
  return { tier, frequency, amount: priceNGN(tier, frequency) };
}
