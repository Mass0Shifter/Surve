/**
 * Subscription Models & Multi-Gateway Billing Types
 * Checkout is Paystack (NGN), verified server-side.
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
}
