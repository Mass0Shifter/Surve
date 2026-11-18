/**
 * Multi-Tenant Organization & Team Engine (Supabase backed).
 * Reads are served from an in-memory cache (refreshed from the server and
 * broadcast via `nsurvey_orgs_changed`); every write goes through a
 * permission-checked Postgres function.
 */

import { Organization, OrganizationMember, CreateOrgParams, InviteMemberParams } from './orgTypes';
import { UserProfile, UserRole } from '../auth/authTypes';
import { isPaidSubscription, refreshCurrentUser } from '../auth/authEngine';
import { NigerianGridBelt } from '../types';
import { supabase, requireSupabase, friendlyError } from '../../lib/supabase';
import { PRICING } from '../../../shared/pricing';

let cache: Organization[] = [];
let cacheUserId: string | null = null;

function emit(): void {
  window.dispatchEvent(new CustomEvent('nsurvey_orgs_changed'));
}

function toBelt(v: unknown): NigerianGridBelt {
  const n = Number(v);
  return n === NigerianGridBelt.WEST_BELT || n === NigerianGridBelt.EAST_BELT ? n : NigerianGridBelt.MID_BELT;
}

/** Loads all organizations the signed-in user belongs to. */
export async function refreshOrganizations(user: UserProfile | null): Promise<Organization[]> {
  if (!supabase || !user) {
    cache = [];
    cacheUserId = null;
    emit();
    return cache;
  }
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('*, organization_members(*)')
    .order('created_at', { ascending: true });
  if (error) throw friendlyError(error);

  // Seat limit follows the owner's live subscription (resolved server-side).
  const seats = new Map<string, number>();
  await Promise.all((orgs || []).map(async (o: any) => {
    const { data: n } = await supabase!.rpc('org_seat_limit_for_member', { org: o.id });
    seats.set(o.id, typeof n === 'number' ? n : 1);
  }));

  cache = (orgs || []).map((o: any): Organization => {
    const maxSeats = seats.get(o.id) ?? 1;
    const tier: UserProfile['subscriptionTier'] =
      maxSeats >= PRICING.ENTERPRISE.maxSeats ? 'ENTERPRISE' : maxSeats >= PRICING.PROFESSIONAL.maxSeats ? 'PROFESSIONAL' : 'COMMUNITY';
    const members: OrganizationMember[] = (o.organization_members || [])
      .sort((a: any, b: any) => Date.parse(a.joined_at) - Date.parse(b.joined_at))
      .map((m: any) => ({
        memberId: m.id,
        userId: m.user_id || `pending:${m.id}`,
        pending: !m.user_id,
        email: m.email,
        fullName: m.full_name || m.email,
        title: m.title || undefined,
        surconNumber: m.surcon_number || undefined,
        role: m.role,
        joinedAt: Date.parse(m.joined_at)
      }));
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      ownerUserId: o.owner_user_id,
      subscriptionTier: tier,
      maxSeats,
      members,
      firmLogoUrl: o.firm_logo_url || undefined,
      officialSealUrl: o.official_seal_url || undefined,
      officeAddress: o.office_address || undefined,
      phone: o.phone || undefined,
      email: o.email || undefined,
      defaultGridBelt: toBelt(o.default_grid_belt),
      createdAt: Date.parse(o.created_at)
    };
  });
  cacheUserId = user.id;
  emit();
  return cache;
}

// ─── Query operations (synchronous, from cache) ──────────────────────────────

export function getOrganizationsForUser(userId?: string | null): Organization[] {
  if (!userId || userId !== cacheUserId) return [];
  return cache;
}

export function getOrganizationById(orgId?: string | null): Organization | null {
  if (!orgId) return null;
  return cache.find(o => o.id === orgId) || null;
}

export function canUserCreateOrg(user: UserProfile | null): boolean {
  return isPaidSubscription(user);
}

export function getActiveOrganization(user: UserProfile | null): Organization | null {
  if (!user || !user.activeOrganizationId) return null;
  return getOrganizationById(user.activeOrganizationId);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
}

async function afterWrite(user: UserProfile, orgId: string): Promise<Organization> {
  const fresh = (await refreshCurrentUser()) || user;
  await refreshOrganizations(fresh);
  const org = getOrganizationById(orgId);
  if (!org) throw new Error('Organization not found.');
  return org;
}

function memberRowId(org: Organization | null, memberUserId: string): string {
  const m = org?.members.find(x => x.userId === memberUserId || x.memberId === memberUserId);
  if (!m?.memberId) throw new Error('Member not found in organization.');
  return m.memberId;
}

export async function createOrganization(params: CreateOrgParams, creator: UserProfile): Promise<Organization> {
  if (!canUserCreateOrg(creator)) {
    throw new Error('Creating an Organization requires an active Professional Surveyor or Enterprise Firm subscription.');
  }
  const slug = slugify(params.slug || params.name);
  if (!slug) throw new Error('Please enter an organization name.');
  const { data, error } = await requireSupabase().rpc('create_organization', {
    p_name: params.name,
    p_slug: slug,
    p_office_address: params.officeAddress ?? null,
    p_phone: params.phone ?? null,
    p_email: params.email ?? null,
    p_grid_belt: params.defaultGridBelt ?? NigerianGridBelt.MID_BELT
  });
  if (error) throw friendlyError(error);
  return afterWrite(creator, data as string);
}

export async function inviteMemberToOrg(orgId: string, params: InviteMemberParams, requesterUser: UserProfile): Promise<Organization> {
  const { error } = await requireSupabase().rpc('invite_org_member', {
    p_org: orgId,
    p_email: params.email,
    p_full_name: params.fullName,
    p_role: params.role,
    p_title: params.title ?? null,
    p_surcon: params.surconNumber ?? null
  });
  if (error) throw friendlyError(error);
  return afterWrite(requesterUser, orgId);
}

export async function removeMemberFromOrg(orgId: string, memberUserId: string, requesterUser: UserProfile): Promise<Organization> {
  const { error } = await requireSupabase().rpc('remove_org_member', {
    p_member: memberRowId(getOrganizationById(orgId), memberUserId)
  });
  if (error) throw friendlyError(error);
  return afterWrite(requesterUser, orgId);
}

export async function updateMemberRoleInOrg(orgId: string, memberUserId: string, newRole: UserRole, requesterUser: UserProfile): Promise<Organization> {
  const { error } = await requireSupabase().rpc('update_org_member_role', {
    p_member: memberRowId(getOrganizationById(orgId), memberUserId),
    p_role: newRole
  });
  if (error) throw friendlyError(error);
  return afterWrite(requesterUser, orgId);
}

export async function updateOrganizationDetails(orgId: string, updates: Partial<Organization>, requesterUser: UserProfile): Promise<Organization> {
  const { error } = await requireSupabase().rpc('update_organization', {
    p_org: orgId,
    p_name: updates.name ?? null,
    p_office_address: updates.officeAddress ?? null,
    p_phone: updates.phone ?? null,
    p_email: updates.email ?? null,
    p_grid_belt: updates.defaultGridBelt ?? null,
    p_logo: updates.firmLogoUrl ?? null,
    p_seal: updates.officialSealUrl ?? null
  });
  if (error) throw friendlyError(error);
  return afterWrite(requesterUser, orgId);
}
