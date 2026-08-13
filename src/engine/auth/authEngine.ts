/**
 * Offline-Ready Authentication & User Profile Engine
 * Manages user authentication, session persistence, surveyor credentials, and security state.
 */

import { UserProfile, LoginCredentials, RegisterCredentials, AuthSession } from './authTypes';

const AUTH_STORAGE_KEY = 'nsurvey_auth_session_v1';
const USERS_DB_KEY = 'nsurvey_registered_users_v1';

// Seed demo users for immediate testing out of the box
const SEED_USERS: UserProfile[] = [
  {
    id: 'usr_pro_001',
    email: 'surv.chikezie@geotrek.ng',
    fullName: 'Precious Chikezie',
    title: 'Surv. (Dr.)',
    surconNumber: 'SURCON Reg. No. 1984/2019',
    nisChapter: 'FCT Abuja Chapter',
    phone: '+234 803 123 4567',
    companyName: 'Geotrek Survey & Engineering Services Ltd',
    officeAddress: 'Suite 402, Reinsurance Plaza, Central Business District, Abuja, Nigeria',
    digitalSealUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><circle cx='80' cy='80' r='74' fill='none' stroke='%23059669' stroke-width='4'/><circle cx='80' cy='80' r='64' fill='none' stroke='%23059669' stroke-width='1.5' stroke-dasharray='4,2'/><text x='80' y='36' font-family='Arial,sans-serif' font-size='10' font-weight='bold' fill='%23059669' text-anchor='middle'>SURVEYORS COUNCIL</text><text x='80' y='50' font-family='Arial,sans-serif' font-size='9' font-weight='bold' fill='%23059669' text-anchor='middle'>OF NIGERIA</text><polygon points='80,62 84,74 96,74 86,82 90,94 80,86 70,94 74,82 64,74 76,74' fill='%23059669'/><text x='80' y='110' font-family='Arial,sans-serif' font-size='10' font-weight='bold' fill='%23059669' text-anchor='middle'>REG. NO. 1984/2019</text><text x='80' y='130' font-family='Arial,sans-serif' font-size='9' font-weight='bold' fill='%23059669' text-anchor='middle'>P. CHIKEZIE, mnis</text></svg>",
    signatureUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='60' viewBox='0 0 200 60'><path d='M20,40 Q40,10 60,35 T100,25 T140,40 T180,20 M70,45 Q90,30 110,48' fill='none' stroke='%231e3a8a' stroke-width='2.5' stroke-linecap='round'/></svg>",
    subscriptionTier: 'PROFESSIONAL',
    subscriptionExpiresAt: Date.now() + 1000 * 60 * 60 * 24 * 365, // 1 Year active
    activeOrganizationId: 'org_geotrek_001',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 60
  },
  {
    id: 'usr_free_002',
    email: 'cadastral.demo@nsurvey.app',
    fullName: 'Abubakar Ibrahim',
    title: 'Surv.',
    surconNumber: 'SURCON Reg. No. 2450/2023',
    nisChapter: 'Kaduna State Branch',
    phone: '+234 812 987 6543',
    companyName: 'Northern Cadastral Consult',
    officeAddress: '12 Yakubu Gowon Way, Kaduna, Nigeria',
    subscriptionTier: 'COMMUNITY',
    activeOrganizationId: null,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10
  }
];

function getStoredUsers(): UserProfile[] {
  try {
    const raw = localStorage.getItem(USERS_DB_KEY);
    if (!raw) {
      localStorage.setItem(USERS_DB_KEY, JSON.stringify(SEED_USERS));
      return SEED_USERS;
    }
    return JSON.parse(raw);
  } catch {
    return SEED_USERS;
  }
}

function saveUsers(users: UserProfile[]): void {
  try {
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
  } catch (err) {
    console.error('Failed to save users database', err);
  }
}

// ─── Active Session Management ────────────────────────────────────────────────

export function getCurrentSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session: AuthSession = JSON.parse(raw);
    if (session.expiresAt && Date.now() > session.expiresAt) {
      logout();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function getCurrentUser(): UserProfile | null {
  const session = getCurrentSession();
  return session ? session.user : null;
}

function saveSession(user: UserProfile, rememberMe: boolean = true): AuthSession {
  const expiresAt = rememberMe
    ? Date.now() + 1000 * 60 * 60 * 24 * 30 // 30 days
    : Date.now() + 1000 * 60 * 60 * 24;     // 1 day

  const session: AuthSession = {
    user,
    token: `jwt_nsurvey_${user.id}_${Date.now()}`,
    expiresAt
  };

  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent('nsurvey_auth_changed', { detail: user }));
  } catch (err) {
    console.error('Failed to save auth session', err);
  }

  return session;
}

// ─── Auth Actions ─────────────────────────────────────────────────────────────

export async function loginUser(creds: LoginCredentials): Promise<UserProfile> {
  const emailNorm = creds.email.trim().toLowerCase();
  const users = getStoredUsers();

  const found = users.find(u => u.email.toLowerCase() === emailNorm);
  if (!found) {
    // If it's the demo account password or any password for mock, create or throw
    if (emailNorm === 'surv.chikezie@geotrek.ng' || emailNorm === 'cadastral.demo@nsurvey.app') {
      // Seed account exists
      const user = users.find(u => u.email.toLowerCase() === emailNorm)!;
      saveSession(user, creds.rememberMe);
      return user;
    }
    throw new Error('Invalid email or password. Please verify your credentials or register a new account.');
  }

  saveSession(found, creds.rememberMe);
  return found;
}

export async function registerUser(creds: RegisterCredentials): Promise<UserProfile> {
  const emailNorm = creds.email.trim().toLowerCase();
  const users = getStoredUsers();

  if (users.some(u => u.email.toLowerCase() === emailNorm)) {
    throw new Error('An account with this email address already exists. Please sign in instead.');
  }

  const newUser: UserProfile = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    email: emailNorm,
    fullName: creds.fullName.trim(),
    title: creds.title || 'Surv.',
    surconNumber: creds.surconNumber?.trim() || undefined,
    nisChapter: creds.nisChapter?.trim() || undefined,
    phone: creds.phone?.trim() || undefined,
    companyName: creds.companyName?.trim() || undefined,
    subscriptionTier: 'COMMUNITY', // New users start on Community tier
    activeOrganizationId: null,
    createdAt: Date.now()
  };

  users.push(newUser);
  saveUsers(users);
  saveSession(newUser, true);

  return newUser;
}

export function logout(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('nsurvey_auth_changed', { detail: null }));
  } catch (err) {
    console.error('Failed to clear session', err);
  }
}

export async function updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const current = getCurrentUser();
  if (!current) throw new Error('No active user session. Please sign in.');

  const updated: UserProfile = {
    ...current,
    ...updates,
    id: current.id,
    email: current.email // preserve email
  };

  // Update in users database
  const users = getStoredUsers();
  const idx = users.findIndex(u => u.id === current.id);
  if (idx !== -1) {
    users[idx] = updated;
    saveUsers(users);
  }

  // Update in active session
  saveSession(updated, true);
  return updated;
}

export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  const emailNorm = email.trim().toLowerCase();
  const users = getStoredUsers();
  const found = users.find(u => u.email.toLowerCase() === emailNorm);

  if (!found) {
    throw new Error('No registered account was found with this email address.');
  }

  return {
    success: true,
    message: `A password reset link has been dispatched to ${emailNorm}. Please check your inbox and follow the instructions.`
  };
}

// ─── Subscription & Permission Helpers ────────────────────────────────────────

export function isPaidSubscription(user?: UserProfile | null): boolean {
  if (!user) return false;
  if (user.subscriptionTier === 'COMMUNITY') return false;
  if (user.subscriptionExpiresAt && Date.now() > user.subscriptionExpiresAt) return false;
  return true;
}

export function canCreateOrganization(user?: UserProfile | null): boolean {
  return isPaidSubscription(user);
}
