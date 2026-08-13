/**
 * Multi-Tenant Organization & Team Collaboration Engine
 * Manages surveying firms, memberships, RBAC roles, firm seals, and subscription seat limits.
 */

import { Organization, OrganizationMember, CreateOrgParams, InviteMemberParams } from './orgTypes';
import { UserProfile, UserRole } from '../auth/authTypes';
import { isPaidSubscription, updateUserProfile } from '../auth/authEngine';
import { NigerianGridBelt } from '../types';

const ORGS_STORAGE_KEY = 'nsurvey_organizations_v1';

// Seed demo organization for the pro surveyor
const SEED_ORGS: Organization[] = [
  {
    id: 'org_geotrek_001',
    name: 'Geotrek Survey & Engineering Services Ltd',
    slug: 'geotrek-survey',
    ownerUserId: 'usr_pro_001',
    subscriptionTier: 'PROFESSIONAL',
    maxSeats: 3, // Pro plan includes up to 3 seats
    members: [
      {
        userId: 'usr_pro_001',
        email: 'surv.chikezie@geotrek.ng',
        fullName: 'Precious Chikezie',
        title: 'Surv. (Dr.)',
        surconNumber: 'SURCON Reg. No. 1984/2019',
        role: 'OWNER',
        joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 60
      },
      {
        userId: 'usr_mem_002',
        email: 'amina.bello@geotrek.ng',
        fullName: 'Amina Bello',
        title: 'Surv.',
        surconNumber: 'SURCON Reg. No. 2310/2021',
        role: 'ADMIN',
        joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 30
      }
    ],
    officeAddress: 'Suite 402, Reinsurance Plaza, Central Business District, Abuja, Nigeria',
    phone: '+234 803 123 4567',
    email: 'info@geotrek.ng',
    defaultGridBelt: NigerianGridBelt.MID_BELT,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 60
  }
];

function getStoredOrgs(): Organization[] {
  try {
    const raw = localStorage.getItem(ORGS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(ORGS_STORAGE_KEY, JSON.stringify(SEED_ORGS));
      return SEED_ORGS;
    }
    return JSON.parse(raw);
  } catch {
    return SEED_ORGS;
  }
}

function saveOrgs(orgs: Organization[]): void {
  try {
    localStorage.setItem(ORGS_STORAGE_KEY, JSON.stringify(orgs));
    window.dispatchEvent(new CustomEvent('nsurvey_orgs_changed'));
  } catch (err) {
    console.error('Failed to save organizations database', err);
  }
}

// ─── Query Operations ─────────────────────────────────────────────────────────

export function getOrganizationsForUser(userId?: string | null): Organization[] {
  if (!userId) return [];
  const orgs = getStoredOrgs();
  return orgs.filter(o => o.members.some(m => m.userId === userId));
}

export function getOrganizationById(orgId?: string | null): Organization | null {
  if (!orgId) return null;
  const orgs = getStoredOrgs();
  return orgs.find(o => o.id === orgId) || null;
}

export function canUserCreateOrg(user: UserProfile | null): boolean {
  if (!user) return false;
  return isPaidSubscription(user);
}

export function getActiveOrganization(user: UserProfile | null): Organization | null {
  if (!user || !user.activeOrganizationId) return null;
  return getOrganizationById(user.activeOrganizationId);
}

// ─── Organization CRUD Operations ─────────────────────────────────────────────

export async function createOrganization(
  params: CreateOrgParams,
  creator: UserProfile
): Promise<Organization> {
  if (!canUserCreateOrg(creator)) {
    throw new Error('Creating an Organization requires an active Professional Surveyor or Enterprise Firm subscription.');
  }

  const orgs = getStoredOrgs();
  const slug = (params.slug || params.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  if (orgs.some(o => o.slug === slug)) {
    throw new Error(`An organization with the identifier "${slug}" already exists. Please choose a different name.`);
  }

  const maxSeats = creator.subscriptionTier === 'ENTERPRISE' ? 20 : 3;

  const newOrg: Organization = {
    id: `org_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: params.name.trim(),
    slug,
    ownerUserId: creator.id,
    subscriptionTier: creator.subscriptionTier,
    maxSeats,
    members: [
      {
        userId: creator.id,
        email: creator.email,
        fullName: creator.fullName,
        title: creator.title,
        surconNumber: creator.surconNumber,
        role: 'OWNER',
        joinedAt: Date.now()
      }
    ],
    officeAddress: params.officeAddress?.trim() || creator.officeAddress,
    phone: params.phone?.trim() || creator.phone,
    email: params.email?.trim() || creator.email,
    defaultGridBelt: params.defaultGridBelt || NigerianGridBelt.MID_BELT,
    createdAt: Date.now()
  };

  orgs.push(newOrg);
  saveOrgs(orgs);

  // Set as active organization for creator
  await updateUserProfile({ activeOrganizationId: newOrg.id });

  return newOrg;
}

export async function inviteMemberToOrg(
  orgId: string,
  params: InviteMemberParams,
  requesterUser: UserProfile
): Promise<Organization> {
  const orgs = getStoredOrgs();
  const org = orgs.find(o => o.id === orgId);
  if (!org) throw new Error('Organization not found.');

  // Verify requester permission (must be OWNER or ADMIN)
  const requesterMember = org.members.find(m => m.userId === requesterUser.id);
  if (!requesterMember || (requesterMember.role !== 'OWNER' && requesterMember.role !== 'ADMIN')) {
    throw new Error('Permission denied. Only organization Owners or Admins can invite team members.');
  }

  // Check seat capacity limit
  if (org.members.length >= org.maxSeats) {
    throw new Error(
      `Organization seat capacity reached (${org.members.length}/${org.maxSeats} seats used). Upgrade to Enterprise to add more members.`
    );
  }

  const emailNorm = params.email.trim().toLowerCase();
  if (org.members.some(m => m.email.toLowerCase() === emailNorm)) {
    throw new Error(`A member with email "${emailNorm}" is already part of this organization.`);
  }

  const newMember: OrganizationMember = {
    userId: `usr_inv_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    email: emailNorm,
    fullName: params.fullName.trim(),
    title: params.title || 'Surv.',
    surconNumber: params.surconNumber?.trim() || undefined,
    role: params.role,
    joinedAt: Date.now()
  };

  org.members.push(newMember);
  saveOrgs(orgs);
  return org;
}

export async function removeMemberFromOrg(
  orgId: string,
  memberUserId: string,
  requesterUser: UserProfile
): Promise<Organization> {
  const orgs = getStoredOrgs();
  const org = orgs.find(o => o.id === orgId);
  if (!org) throw new Error('Organization not found.');

  // Verify requester permission
  const requesterMember = org.members.find(m => m.userId === requesterUser.id);
  if (!requesterMember || (requesterMember.role !== 'OWNER' && requesterMember.role !== 'ADMIN')) {
    throw new Error('Permission denied. Only organization Owners or Admins can remove members.');
  }

  // Prevent removing owner
  const targetMember = org.members.find(m => m.userId === memberUserId);
  if (!targetMember) throw new Error('Member not found in organization.');
  if (targetMember.role === 'OWNER') {
    throw new Error('The Organization Owner cannot be removed.');
  }

  org.members = org.members.filter(m => m.userId !== memberUserId);
  saveOrgs(orgs);
  return org;
}

export async function updateMemberRoleInOrg(
  orgId: string,
  memberUserId: string,
  newRole: UserRole,
  requesterUser: UserProfile
): Promise<Organization> {
  const orgs = getStoredOrgs();
  const org = orgs.find(o => o.id === orgId);
  if (!org) throw new Error('Organization not found.');

  const requesterMember = org.members.find(m => m.userId === requesterUser.id);
  if (!requesterMember || requesterMember.role !== 'OWNER') {
    throw new Error('Only the Organization Owner can modify member access roles.');
  }

  const targetMember = org.members.find(m => m.userId === memberUserId);
  if (!targetMember) throw new Error('Member not found in organization.');

  targetMember.role = newRole;
  saveOrgs(orgs);
  return org;
}

export async function updateOrganizationDetails(
  orgId: string,
  updates: Partial<Organization>,
  requesterUser: UserProfile
): Promise<Organization> {
  const orgs = getStoredOrgs();
  const org = orgs.find(o => o.id === orgId);
  if (!org) throw new Error('Organization not found.');

  const requesterMember = org.members.find(m => m.userId === requesterUser.id);
  if (!requesterMember || (requesterMember.role !== 'OWNER' && requesterMember.role !== 'ADMIN')) {
    throw new Error('Permission denied. Only organization Owners or Admins can update firm details.');
  }

  Object.assign(org, updates);
  saveOrgs(orgs);
  return org;
}
