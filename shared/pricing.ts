/**
 * Single source of truth for plan prices. Imported by the browser app (display)
 * and by the serverless API (the amount actually charged). Never trust a price
 * sent from the client.
 */

export type PaidTier = 'PROFESSIONAL' | 'ENTERPRISE';
export type Tier = 'COMMUNITY' | PaidTier;
export type Frequency = 'monthly' | 'annual';

export interface TierPricing {
  monthlyNGN: number;
  annualNGN: number;
  monthlyUSD: number;
  annualUSD: number;
  maxSeats: number;
}

export const PRICING: Record<Tier, TierPricing> = {
  COMMUNITY:    { monthlyNGN: 0,     annualNGN: 0,      monthlyUSD: 0,  annualUSD: 0,   maxSeats: 1 },
  PROFESSIONAL: { monthlyNGN: 25000, annualNGN: 250000, monthlyUSD: 35, annualUSD: 350, maxSeats: 3 },
  ENTERPRISE:   { monthlyNGN: 75000, annualNGN: 750000, monthlyUSD: 95, annualUSD: 950, maxSeats: 20 }
};

export function isPaidTier(t: unknown): t is PaidTier {
  return t === 'PROFESSIONAL' || t === 'ENTERPRISE';
}

export function isFrequency(f: unknown): f is Frequency {
  return f === 'monthly' || f === 'annual';
}

export function priceNGN(tier: Tier, frequency: Frequency): number {
  const p = PRICING[tier];
  return frequency === 'annual' ? p.annualNGN : p.monthlyNGN;
}

export function periodMs(frequency: Frequency): number {
  return (frequency === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000;
}

/** Offline licence wire format shared by issuer (server) and verifier (client). */
export interface OfflineLicenseClaims {
  v: 2;
  sub: string;      // user id
  email: string;
  tier: PaidTier;
  iat: number;      // ms epoch
  exp: number;      // ms epoch
}

export const LICENSE_PREFIX = 'NSURV-LIC2-';
