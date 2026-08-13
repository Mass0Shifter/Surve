/**
 * Subscription Models & Multi-Gateway Billing Types
 * Supports Nigerian Paystack (₦ NGN), International Stripe ($ USD),
 * and Cryptographic Offline Fieldwork Licenses.
 */

import { SubscriptionTier } from '../auth/authTypes';

export type BillingFrequency = 'monthly' | 'annual';
export type Currency = 'NGN' | 'USD';
export type PaymentGateway = 'paystack' | 'stripe';

export interface PlanFeature {
  text: string;
  included: boolean;
  highlight?: boolean;
}

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  badge?: string;
  tagline: string;
  monthlyPriceNGN: number;
  annualPriceNGN: number;
  monthlyPriceUSD: number;
  annualPriceUSD: number;
  maxSeats: number;
  features: PlanFeature[];
  isPopular?: boolean;
}

export interface PaymentTransaction {
  id: string;
  reference: string;
  userId: string;
  userEmail: string;
  tier: SubscriptionTier;
  frequency: BillingFrequency;
  amount: number;
  currency: Currency;
  gateway: PaymentGateway;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  timestamp: number;
  receiptNumber: string;
  surconInvoiceRef?: string;
}

export interface OfflineLicensePayload {
  version: '1.0';
  userId: string;
  userEmail: string;
  surconNumber?: string;
  tier: SubscriptionTier;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}
