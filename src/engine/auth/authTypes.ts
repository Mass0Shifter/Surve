export type UserRole = 'OWNER' | 'ADMIN' | 'SURVEYOR' | 'VIEWER';

export type SubscriptionTier = 'COMMUNITY' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  title?: string;              // e.g. "Surv. (Dr.)", "Engr."
  surconNumber?: string;       // e.g. "SURCON Reg. No. 1845 / 2018"
  nisChapter?: string;         // e.g. "FCT Abuja Chapter", "Lagos State Branch"
  phone?: string;
  companyName?: string;
  officeAddress?: string;
  avatarUrl?: string;
  digitalSealUrl?: string;     // Base64 or URL of transparent surveyor seal stamp
  signatureUrl?: string;       // Base64 or URL of signature
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt?: number; // Epoch timestamp (null = perpetual / free)
  activeOrganizationId?: string | null;
  createdAt: number;
}

export interface AuthSession {
  user: UserProfile;
  token: string;
  expiresAt: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  fullName: string;
  title?: string;
  surconNumber?: string;
  nisChapter?: string;
  phone?: string;
  companyName?: string;
}
