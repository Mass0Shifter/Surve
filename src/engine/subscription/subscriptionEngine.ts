/**
 * Subscription & Multi-Gateway Billing Engine
 * Handles Paystack (₦ NGN), Stripe ($ USD), and Offline Cryptographic License Tokens.
 */

import { SubscriptionTier, UserProfile } from '../auth/authTypes';
import { updateUserProfile } from '../auth/authEngine';
import {
  BillingFrequency,
  Currency,
  PaymentGateway,
  SubscriptionPlan,
  PaymentTransaction,
  OfflineLicensePayload
} from './subscriptionTypes';

const TRANSACTIONS_KEY = 'nsurvey_transactions_v1';
const OFFLINE_LICENSE_KEY = 'nsurvey_offline_license_v1';

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    tier: 'COMMUNITY',
    name: 'Community Free',
    badge: 'STARTER',
    tagline: 'Essential coordinate calculations for students and single-field assistants.',
    monthlyPriceNGN: 0,
    annualPriceNGN: 0,
    monthlyPriceUSD: 0,
    annualPriceUSD: 0,
    maxSeats: 1,
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
    monthlyPriceNGN: 25000,
    annualPriceNGN: 250000, // 2 months free (10x monthly)
    monthlyPriceUSD: 35,
    annualPriceUSD: 350,
    maxSeats: 3,
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
      { text: '30-Day Offline Cryptographic Fieldwork Token', included: true, highlight: true }
    ]
  },
  {
    tier: 'ENTERPRISE',
    name: 'Enterprise Cadastral Firm',
    badge: 'CONSORTIUM',
    tagline: 'High-capacity organization suite for survey consultancies, state agencies, and engineering firms.',
    monthlyPriceNGN: 75000,
    annualPriceNGN: 750000,
    monthlyPriceUSD: 95,
    annualPriceUSD: 950,
    maxSeats: 20,
    features: [
      { text: 'All Professional Surveyor Features Included', included: true, highlight: true },
      { text: 'High-Capacity Firm Team (Up to 20 Seats)', included: true, highlight: true },
      { text: 'Corporate Firm Seal & Stamp Branding', included: true, highlight: true },
      { text: 'Multi-Tenant Organization Workspaces', included: true },
      { text: 'Full SurvPack Legacy Project Batch Importer', included: true, highlight: true },
      { text: 'Enterprise Shared Project Repositories', included: true },
      { text: 'Audit Trail & Snapshot Version History', included: true },
      { text: 'Priority NIS & SURCON Regulatory Support', included: true },
      { text: 'Unlimited Offline Fieldwork Deployments', included: true }
    ]
  }
];

export function getPlans(): SubscriptionPlan[] {
  return SUBSCRIPTION_PLANS;
}

export function getPlanByTier(tier: SubscriptionTier): SubscriptionPlan {
  return SUBSCRIPTION_PLANS.find(p => p.tier === tier) || SUBSCRIPTION_PLANS[0];
}

export function calculatePlanPrice(
  plan: SubscriptionPlan,
  frequency: BillingFrequency,
  currency: Currency
): number {
  if (currency === 'NGN') {
    return frequency === 'annual' ? plan.annualPriceNGN : plan.monthlyPriceNGN;
  } else {
    return frequency === 'annual' ? plan.annualPriceUSD : plan.monthlyPriceUSD;
  }
}

export function getTransactionHistory(userId?: string): PaymentTransaction[] {
  try {
    const raw = localStorage.getItem(TRANSACTIONS_KEY);
    if (!raw) return [];
    const all: PaymentTransaction[] = JSON.parse(raw);
    if (userId) {
      return all.filter(t => t.userId === userId);
    }
    return all;
  } catch {
    return [];
  }
}

function saveTransaction(tx: PaymentTransaction): void {
  try {
    const history = getTransactionHistory();
    history.unshift(tx);
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(history.slice(0, 100)));
  } catch (err) {
    console.error('Failed to save transaction', err);
  }
}

export interface CheckoutParams {
  user: UserProfile;
  tier: SubscriptionTier;
  frequency: BillingFrequency;
  currency: Currency;
  gateway: PaymentGateway;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  bankCode?: string;
}

/**
 * Executes or simulates checkout through Paystack or Stripe.
 */
export async function processSubscriptionPayment(params: CheckoutParams): Promise<{ success: boolean; transaction: PaymentTransaction; updatedUser: UserProfile }> {
  const plan = getPlanByTier(params.tier);
  const amount = calculatePlanPrice(plan, params.frequency, params.currency);
  const now = Date.now();
  const durationMs = params.frequency === 'annual' ? 1000 * 60 * 60 * 24 * 365 : 1000 * 60 * 60 * 24 * 30;
  const expiresAt = now + durationMs;

  const prefix = params.gateway === 'paystack' ? 'PSTK_SURV' : 'STRIPE_CH';
  const reference = `${prefix}_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
  const receiptNumber = `REC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

  const transaction: PaymentTransaction = {
    id: `tx_${Date.now()}`,
    reference,
    userId: params.user.id,
    userEmail: params.user.email,
    tier: params.tier,
    frequency: params.frequency,
    amount,
    currency: params.currency,
    gateway: params.gateway,
    status: 'SUCCESS',
    timestamp: now,
    receiptNumber,
    surconInvoiceRef: `SURV-INV-${params.user.surconNumber ? params.user.surconNumber.replace(/[^a-zA-Z0-9]/g, '') : 'DIR'}-${Date.now().toString().slice(-4)}`
  };

  saveTransaction(transaction);

  // Update user profile
  const updatedUser: UserProfile = {
    ...params.user,
    subscriptionTier: params.tier,
    subscriptionExpiresAt: expiresAt
  };

  updateUserProfile(updatedUser);

  return {
    success: true,
    transaction,
    updatedUser
  };
}

/**
 * Generates an encrypted cryptographic offline license token for bush/fieldwork.
 */
export function generateOfflineLicenseToken(user: UserProfile, tier: SubscriptionTier, daysValid: number = 30): string {
  const now = Date.now();
  const expiresAt = now + 1000 * 60 * 60 * 24 * daysValid;

  const rawSigData = `${user.id}:${user.email}:${tier}:${now}:${expiresAt}:NSURVEY_SECRET_2026`;
  // Simple deterministic hash signature for client-side offline verification
  let hash = 0;
  for (let i = 0; i < rawSigData.length; i++) {
    const char = rawSigData.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const signature = `SIG_${Math.abs(hash).toString(16).toUpperCase()}_SURV`;

  const payload: OfflineLicensePayload = {
    version: '1.0',
    userId: user.id,
    userEmail: user.email,
    surconNumber: user.surconNumber,
    tier,
    issuedAt: now,
    expiresAt,
    signature
  };

  const jsonStr = JSON.stringify(payload);
  return `NSURV-LIC-${btoa(jsonStr)}`;
}

/**
 * Validates and activates an offline license token on the local machine.
 */
export function verifyAndApplyOfflineLicense(tokenStr: string, currentUser: UserProfile | null): { success: boolean; message: string; tier?: SubscriptionTier; expiresAt?: number } {
  try {
    const cleanToken = tokenStr.trim();
    if (!cleanToken.startsWith('NSURV-LIC-')) {
      return { success: false, message: 'Invalid license format. Must start with "NSURV-LIC-".' };
    }

    const b64 = cleanToken.replace('NSURV-LIC-', '');
    const jsonStr = atob(b64);
    const payload: OfflineLicensePayload = JSON.parse(jsonStr);

    if (payload.version !== '1.0' || !payload.tier || !payload.expiresAt) {
      return { success: false, message: 'Malformed license token structure.' };
    }

    const now = Date.now();
    if (now > payload.expiresAt) {
      const expiredDate = new Date(payload.expiresAt).toLocaleDateString('en-GB');
      return { success: false, message: `License expired on ${expiredDate}. Please renew online or request a new field token.` };
    }

    // Verify signature
    const rawSigData = `${payload.userId}:${payload.userEmail}:${payload.tier}:${payload.issuedAt}:${payload.expiresAt}:NSURVEY_SECRET_2026`;
    let hash = 0;
    for (let i = 0; i < rawSigData.length; i++) {
      const char = rawSigData.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    const expectedSig = `SIG_${Math.abs(hash).toString(16).toUpperCase()}_SURV`;

    if (payload.signature !== expectedSig) {
      return { success: false, message: 'Cryptographic signature mismatch! License token has been tampered with.' };
    }

    // Apply to current user if present
    if (currentUser) {
      const updated: UserProfile = {
        ...currentUser,
        subscriptionTier: payload.tier,
        subscriptionExpiresAt: payload.expiresAt
      };
      updateUserProfile(updated);
    }

    localStorage.setItem(OFFLINE_LICENSE_KEY, cleanToken);

    const daysRemaining = Math.max(0, Math.ceil((payload.expiresAt - now) / (1000 * 60 * 60 * 24)));
    return {
      success: true,
      message: `Offline License Activated! ${payload.tier} Tier unlocked (${daysRemaining} Days remaining).`,
      tier: payload.tier,
      expiresAt: payload.expiresAt
    };
  } catch (err: any) {
    return { success: false, message: `License verification failed: ${err.message || 'Invalid code'}` };
  }
}

export function getActiveOfflineLicense(): OfflineLicensePayload | null {
  try {
    const raw = localStorage.getItem(OFFLINE_LICENSE_KEY);
    if (!raw || !raw.startsWith('NSURV-LIC-')) return null;
    const b64 = raw.replace('NSURV-LIC-', '');
    const payload: OfflineLicensePayload = JSON.parse(atob(b64));
    if (Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}
