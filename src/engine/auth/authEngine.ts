/**
 * Authentication & User Profile Engine (Supabase Auth backed).
 *
 * The rest of the app reads the signed-in user synchronously via getCurrentUser();
 * this module keeps an in-memory copy of the profile, hydrated from Supabase on
 * start-up and on every auth change, and broadcasts `nsurvey_auth_changed`.
 */

import { UserProfile, LoginCredentials, RegisterCredentials } from './authTypes';
import { supabase, requireSupabase, friendlyError, isBackendConfigured } from '../../lib/supabase';

const PROFILE_CACHE_KEY = 'nsurvey_profile_cache_v2';

let currentUser: UserProfile | null = readCache();

function readCache(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function setCurrent(user: UserProfile | null): void {
  currentUser = user;
  try {
    if (user) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    /* storage full or blocked — in-memory copy still works */
  }
  window.dispatchEvent(new CustomEvent('nsurvey_auth_changed', { detail: user }));
}

// ─── Row mapping ─────────────────────────────────────────────────────────────

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  title: string | null;
  surcon_number: string | null;
  nis_chapter: string | null;
  phone: string | null;
  company_name: string | null;
  office_address: string | null;
  avatar_url: string | null;
  digital_seal_url: string | null;
  signature_url: string | null;
  subscription_tier: UserProfile['subscriptionTier'];
  subscription_expires_at: string | null;
  active_organization_id: string | null;
  created_at: string;
}

const u = (v: string | null | undefined) => (v == null || v === '' ? undefined : v);

function fromRow(r: ProfileRow): UserProfile {
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    title: u(r.title),
    surconNumber: u(r.surcon_number),
    nisChapter: u(r.nis_chapter),
    phone: u(r.phone),
    companyName: u(r.company_name),
    officeAddress: u(r.office_address),
    avatarUrl: u(r.avatar_url),
    digitalSealUrl: u(r.digital_seal_url),
    signatureUrl: u(r.signature_url),
    subscriptionTier: r.subscription_tier,
    subscriptionExpiresAt: r.subscription_expires_at ? Date.parse(r.subscription_expires_at) : undefined,
    activeOrganizationId: r.active_organization_id,
    createdAt: Date.parse(r.created_at)
  };
}

const EDITABLE: Record<string, keyof ProfileRow> = {
  fullName: 'full_name',
  title: 'title',
  surconNumber: 'surcon_number',
  nisChapter: 'nis_chapter',
  phone: 'phone',
  companyName: 'company_name',
  officeAddress: 'office_address',
  avatarUrl: 'avatar_url',
  digitalSealUrl: 'digital_seal_url',
  signatureUrl: 'signature_url',
  activeOrganizationId: 'active_organization_id'
};

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw friendlyError(error);
  return data ? fromRow(data as ProfileRow) : null;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

let initialised = false;
let recoveryListener: (() => void) | null = null;

/** Call once at start-up. Hydrates the session and subscribes to auth changes. */
export async function initAuth(): Promise<UserProfile | null> {
  if (!supabase) {
    if (currentUser) setCurrent(null);
    return null;
  }
  if (!initialised) {
    initialised = true;
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recoveryListener?.();
      if (event === 'SIGNED_OUT' || !session) {
        setCurrent(null);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        // Defer: Supabase recommends not awaiting other calls inside this callback.
        setTimeout(() => { void refreshCurrentUser(); }, 0);
      }
    });
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    setCurrent(null);
    return null;
  }
  return refreshCurrentUser();
}

/** Re-reads the profile from the server (e.g. after a payment). */
export async function refreshCurrentUser(): Promise<UserProfile | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const sessionUser = data.session?.user;
  if (!sessionUser) {
    setCurrent(null);
    return null;
  }
  try {
    await supabase.rpc('claim_org_invites');
  } catch {
    /* non-fatal */
  }
  const profile = await fetchProfile(sessionUser.id);
  setCurrent(profile);
  return profile;
}

export function onPasswordRecovery(cb: () => void): void {
  recoveryListener = cb;
}

export function getCurrentUser(): UserProfile | null {
  return currentUser;
}

export function isAccountsEnabled(): boolean {
  return isBackendConfigured;
}

// ─── Auth actions ────────────────────────────────────────────────────────────

export async function loginUser(creds: LoginCredentials): Promise<UserProfile> {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.signInWithPassword({
    email: creds.email.trim().toLowerCase(),
    password: creds.password
  });
  if (error || !data.user) throw friendlyError(error, 'Sign-in failed.');
  const profile = await fetchProfile(data.user.id);
  if (!profile) throw new Error('Your profile could not be loaded. Please contact support.');
  setCurrent(profile);
  return profile;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain letters and numbers.';
  return null;
}

/**
 * Creates an account. Returns the profile when the session starts immediately,
 * or null when Supabase requires email confirmation first.
 */
export async function registerUser(creds: RegisterCredentials): Promise<UserProfile | null> {
  const sb = requireSupabase();
  const pwErr = validatePassword(creds.password);
  if (pwErr) throw new Error(pwErr);
  if (!creds.fullName.trim()) throw new Error('Please enter your full name.');

  const { data, error } = await sb.auth.signUp({
    email: creds.email.trim().toLowerCase(),
    password: creds.password,
    options: {
      emailRedirectTo: window.location.origin,
      data: {
        full_name: creds.fullName.trim(),
        title: creds.title || 'Surv.',
        surcon_number: creds.surconNumber?.trim() || null,
        nis_chapter: creds.nisChapter?.trim() || null,
        phone: creds.phone?.trim() || null,
        company_name: creds.companyName?.trim() || null
      }
    }
  });
  if (error) throw friendlyError(error, 'Registration failed.');
  // Supabase returns a user with no identities when the email is already registered.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new Error('An account with this email already exists. Please sign in instead.');
  }
  if (!data.session || !data.user) return null;
  const profile = await fetchProfile(data.user.id);
  setCurrent(profile);
  return profile;
}

export async function logout(): Promise<void> {
  try {
    await supabase?.auth.signOut();
  } finally {
    setCurrent(null);
  }
}

export async function updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const sb = requireSupabase();
  const current = currentUser;
  if (!current) throw new Error('Please sign in first.');

  const row: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(EDITABLE)) {
    if (k in updates) {
      const v = (updates as Record<string, unknown>)[k];
      row[col] = v === undefined || v === '' ? null : v;
    }
  }
  if (Object.keys(row).length === 0) return current;

  const { data, error } = await sb.from('profiles').update(row).eq('id', current.id).select('*').single();
  if (error) throw friendlyError(error, 'Could not save your profile.');
  const profile = fromRow(data as ProfileRow);
  setCurrent(profile);
  return profile;
}

export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  const sb = requireSupabase();
  const emailNorm = email.trim().toLowerCase();
  const { error } = await sb.auth.resetPasswordForEmail(emailNorm, { redirectTo: window.location.origin });
  if (error) throw friendlyError(error, 'Could not send the reset email.');
  // Same message whether or not the account exists, to avoid account enumeration.
  return {
    success: true,
    message: `If an account exists for ${emailNorm}, a password reset link is on its way. Check your inbox.`
  };
}

export async function setNewPassword(password: string): Promise<void> {
  const sb = requireSupabase();
  const pwErr = validatePassword(password);
  if (pwErr) throw new Error(pwErr);
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw friendlyError(error, 'Could not update your password.');
}

// ─── Subscription helpers ────────────────────────────────────────────────────

export function isPaidSubscription(user?: UserProfile | null): boolean {
  if (!user) return false;
  if (user.subscriptionTier === 'COMMUNITY') return false;
  if (user.subscriptionExpiresAt && Date.now() > user.subscriptionExpiresAt) return false;
  return true;
}

export function canCreateOrganization(user?: UserProfile | null): boolean {
  return isPaidSubscription(user);
}
