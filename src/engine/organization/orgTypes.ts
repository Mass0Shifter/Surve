import { NigerianGridBelt } from '../types';
import { UserRole, SubscriptionTier } from '../auth/authTypes';

export interface OrganizationMember {
  /** Row id of the membership (used for server-side updates). */
  memberId?: string;
  /** Account id, or `pending:<memberId>` for an invite not yet accepted. */
  userId: string;
  /** True while the invited person has not signed up / signed in yet. */
  pending?: boolean;
  email: string;
  fullName: string;
  title?: string;
  surconNumber?: string;
  role: UserRole;
  joinedAt: number;
}

export interface Organization {
  id: string;
  name: string;                // e.g. "Geotrek Survey & Engineering Services Ltd"
  slug: string;                // e.g. "geotrek-survey"
  ownerUserId: string;
  subscriptionTier: SubscriptionTier;
  maxSeats: number;            // e.g. Pro = 3 seats, Enterprise = 20 seats
  members: OrganizationMember[];
  firmLogoUrl?: string;
  officialSealUrl?: string;
  officeAddress?: string;
  phone?: string;
  email?: string;
  defaultGridBelt: NigerianGridBelt;
  createdAt: number;
}

export interface CreateOrgParams {
  name: string;
  slug?: string;
  officeAddress?: string;
  phone?: string;
  email?: string;
  defaultGridBelt?: NigerianGridBelt;
}

export interface InviteMemberParams {
  email: string;
  fullName: string;
  role: UserRole;
  title?: string;
  surconNumber?: string;
}
