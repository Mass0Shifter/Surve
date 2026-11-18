/**
 * Subscription & Billing Engine
 * - Checkout: Paystack (NGN), initialised and verified server-side (/api/paystack/*).
 *   The client never sees card details and cannot grant itself a plan.
 * - Offline field licences: Ed25519-signed by the server (/api/license/issue),
 *   verified here with the public key only.
 */

import * as ed from '@noble/ed25519';
import { SubscriptionTier, UserProfile } from '../auth/authTypes';
import { refreshCurrentUser } from '../auth/authEngine';
import { BillingFrequency, Currency, SubscriptionPlan, PaymentTransaction } from './subscriptionTypes';
import { apiFetch, requireSupabase, friendlyError } from '../../lib/supabase';
import { PRICING, LICENSE_PREFIX, OfflineLicenseClaims } from '../../../shared/pricing';

const OFFLINE_LICENSE_KEY = 'nsurvey_offline_license_v2';

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    tier: 'COMMUNITY',
    name: 'Community Free',
    badge: 'STARTER',
    tagline: 'Essential coordinate calculations for students and single-field assistants.',
    monthlyPriceNGN: PRICING.COMMUNITY.monthlyNGN,
    annualPriceNGN: PRICING.COMMUNITY.annualNGN,
    monthlyPriceUSD: PRICING.COMMUNITY.monthlyUSD,
    annualPriceUSD: PRICING.COMMUNITY.annualUSD,
    maxSeats: PRICING.COMMUNITY.maxSeats,
    features: [
      { text: 'Interactive 2D Vector CAD Canvas', included: true },
      { text: 'Basic Coordinate Table (up to 100 points)', included: true },
      { text: 'Standard CSV & Text Importer', included: true },
      { text: 'Local Personal Workspace only', included: true },
      { text: 'SURCON Seal & Signature Stamping', included: false },
      { text: 'Official Title Deed Plan (TDP) PDF Generator', included: false },
      { text: 'Traverse Loop Balancing & Leveling Reduction', included: false },
      { text: 'Multi-User Organization Teams', included: false },
      { text: 'Native .nsurv Project Bundles', included: false },
      { text: '30-Day Offline Fieldwork License', included: false }
    ]
  },
  {
    tier: 'PROFESSIONAL',
    name: 'Professional Surveyor',
    badge: 'RECOMMENDED',
    tagline: 'Full cadastral, engineering, TDP stamping, and traverse balancing suite for registered surveyors.',
    monthlyPriceNGN: PRICING.PROFESSIONAL.monthlyNGN,
    annualPriceNGN: PRICING.PROFESSIONAL.annualNGN, // 2 months free (10x monthly)
    monthlyPriceUSD: PRICING.PROFESSIONAL.monthlyUSD,
    annualPriceUSD: PRICING.PROFESSIONAL.annualUSD,
    maxSeats: PRICING.PROFESSIONAL.maxSeats,
    isPopular: true,
    features: [
      { text: 'Unlimited Beacons & Parcel Boundaries', included: true, highlight: true },
      { text: 'Official SURCON Seal & Signature Stamping', included: true, highlight: true },
      { text: 'Print-Ready Title Deed Plan (TDP) Vector PDF', included: true, highlight: true },
      { text: 'Traverse Bowditch Reduction & Loop Balancing', included: true, highlight: true },
      { text: 'Spirit Leveling (HPC & Rise/Fall) 3D Sync', included: true },
      { text: 'Tacheometry & Total Station Reduction', included: true },
      { text: 'Minna Datum Transformation (West/Mid/East Belt)', included: true },
      { text: 'Horizontal & Vertical Road Alignment Profiles', included: true },
      { text: 'Area Sub-Division & Land Splitting', included: true },
      { text: 'AutoCAD DXF & SCR Script Exporters', included: true },
      { text: 'Team Organization (Up to 3 Surveyor Seats)', included: true, highlight: true },
      { text: 'Scoped Project Library & .nsurv Bundles', included: true },
      { text: '30-Day Signed Offline Fieldwork Licence', included: true, highlight: true }
    ]
  },
  {
    tier: 'ENTERPRISE',
    name: 'Enterprise Cadastral Firm',
    badge: 'CONSORTIUM',
    tagline: 'High-capacity organization suite for survey consultancies, state agencies, and engineering firms.',
    monthlyPriceNGN: PRICING.ENTERPRISE.monthlyNGN,
    annualPriceNGN: PRICING.ENTERPRISE.annualNGN,
    monthlyPriceUSD: PRICING.ENTERPRISE.monthlyUSD,
    annualPriceUSD: PRICING.ENTERPRISE.annualUSD,
    maxSeats: PRICING.ENTERPRISE.maxSeats,
    features: [
      { text: 'All Professional Surveyor Features Included', included: true, highlight: true },
      { text: 'High-Capacity Firm Team (Up to 20 Seats)', included: true, highlight: true },
      { text: 'Corporate Firm Seal & Stamp Branding', included: true, highlight: true },
      { text: 'Multi-Tenant Organization Workspaces', included: true },
      { text: 'Full SurvPack Legacy Project Batch Importer', included: true, highlight: true },
      { text: 'Enterprise Shared Project Repositories', included: true },
      { text: 'Audit Trail & Snapshot Version History', included: true },
      { text: 'Priority NIS & SURCON Regulatory Support', included: true },
      { text: 'Signed Offline Fieldwork Licences', included: true }
    ]
  }
];

export function getPlans(): SubscriptionPlan[] {
  return SUBSCRIPTION_PLANS;
}

export function getPlanByTier(tier: SubscriptionTier): SubscriptionPlan {
  return SUBSCRIPTION_PLANS.find(p => p.tier === tier) || SUBSCRIPTION_PLANS[0];
}

export function calculatePlanPrice(plan: SubscriptionPlan, frequency: BillingFrequency, currency: Currency): number {
  if (currency === 'NGN') return frequency === 'annual' ? plan.annualPriceNGN : plan.monthlyPriceNGN;
  return frequency === 'annual' ? plan.annualPriceUSD : plan.monthlyPriceUSD;
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function fetchTransactionHistory(): Promise<PaymentTransaction[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('payment_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw friendlyError(error);
  return (data || []).map((t: any): PaymentTransaction => ({
    id: t.id,
    reference: t.reference,
    userId: t.user_id,
    userEmail: t.user_email,
    tier: t.tier,
    frequency: t.frequency,
    amount: Number(t.amount),
    currency: t.currency,
    gateway: t.gateway,
    status: t.status,
    timestamp: Date.parse(t.paid_at || t.created_at),
    receiptNumber: t.receipt_number || '—'
  }));
}

/** Starts a Paystack checkout and redirects the browser to Paystack's hosted page. */
export async function startCheckout(tier: SubscriptionTier, frequency: BillingFrequency): Promise<void> {
  const { authorizationUrl } = await apiFetch<{ authorizationUrl: string; reference: string }>(
    '/api/paystack/initialize',
    { tier, frequency }
  );
  if (!/^https:\/\/([a-z0-9-]+\.)*paystack\.(com|co)\//i.test(authorizationUrl)) {
    throw new Error('Unexpected checkout address returned by the server.');
  }
  window.location.assign(authorizationUrl);
}

/**
 * Called when Paystack redirects back with ?payment_ref=…  Verifies the payment
 * on the server and refreshes the profile.
 */
export async function confirmCheckout(reference: string): Promise<{ status: 'SUCCESS' | 'PENDING' | 'FAILED'; user: UserProfile | null }> {
  const r = await apiFetch<{ status: 'SUCCESS' | 'PENDING' | 'FAILED' }>('/api/paystack/verify', { reference });
  const user = await refreshCurrentUser();
  return { status: r.status, user };
}

// ─── Offline field licences ──────────────────────────────────────────────────

const b64urlDecode = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

function publicKey(): Uint8Array | null {
  const k = import.meta.env.VITE_LICENSE_PUBLIC_KEY || 'bQg5lo-3FKShMEsvNV2qa9kJ2XP_YtJsaHfMluPdQsM';
  if (!k) return null;
  try {
    const raw = b64urlDecode(k.trim());
    return raw.length === 32 ? raw : null;
  } catch {
    return null;
  }
}

/** Requests a signed licence from the server (requires an active paid plan). */
export async function requestOfflineLicense(days = 30): Promise<string> {
  const { token } = await apiFetch<{ token: string }>('/api/license/issue', { days });
  return token;
}

async function verifyToken(token: string): Promise<OfflineLicenseClaims> {
  const t = token.trim();
  if (!t.startsWith(LICENSE_PREFIX)) throw new Error(`Invalid licence format. It should start with "${LICENSE_PREFIX}".`);
  const [p, sig] = t.slice(LICENSE_PREFIX.length).split('.');
  if (!p || !sig) throw new Error('Malformed licence.');
  const key = publicKey();
  if (!key) throw new Error('This build cannot verify offline licences (public key not configured).');
  const payload = b64urlDecode(p);
  const ok = await ed.verifyAsync(b64urlDecode(sig), payload, key);
  if (!ok) throw new Error('Signature check failed — this licence was not issued by NSurvey or has been altered.');
  const claims = JSON.parse(new TextDecoder().decode(payload)) as OfflineLicenseClaims;
  if (claims.v !== 2 || !claims.sub || !claims.exp) throw new Error('Malformed licence.');
  if (Date.now() > claims.exp) {
    throw new Error(`Licence expired on ${new Date(claims.exp).toLocaleDateString('en-GB')}. Get a new one while online.`);
  }
  return claims;
}

let activeLicense: OfflineLicenseClaims | null = null;

/** Re-verifies the stored licence (call at start-up). */
export async function loadOfflineLicense(): Promise<OfflineLicenseClaims | null> {
  try {
    const raw = localStorage.getItem(OFFLINE_LICENSE_KEY);
    activeLicense = raw ? await verifyToken(raw) : null;
  } catch {
    activeLicense = null;
    try { localStorage.removeItem(OFFLINE_LICENSE_KEY); } catch { /* ignore */ }
  }
  return activeLicense;
}

export async function activateOfflineLicense(token: string, currentUser: UserProfile | null): Promise<{ success: boolean; message: string }> {
  try {
    const claims = await verifyToken(token);
    if (currentUser && currentUser.id !== claims.sub) {
      return { success: false, message: 'This licence belongs to a different account.' };
    }
    localStorage.setItem(OFFLINE_LICENSE_KEY, token.trim());
    activeLicense = claims;
    window.dispatchEvent(new CustomEvent('nsurvey_auth_changed', { detail: currentUser ? { ...currentUser } : null }));
    const days = Math.max(0, Math.ceil((claims.exp - Date.now()) / 86400000));
    return { success: true, message: `Offline licence active: ${claims.tier} tools unlocked for ${days} more day(s) on this device.` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Licence verification failed.' };
  }
}

/** The verified licence for this user, if any (synchronous; populated by loadOfflineLicense/activate). */
export function getActiveOfflineLicense(userId?: string | null): OfflineLicenseClaims | null {
  if (!activeLicense) return null;
  if (Date.now() > activeLicense.exp) return null;
  if (userId && activeLicense.sub !== userId) return null;
  return activeLicense;
}
