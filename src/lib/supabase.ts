import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when the build was given Supabase credentials. Without them the CAD tools still work offline, but accounts are disabled. */
export const isBackendConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isBackendConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'nsurvey_supabase_auth'
      }
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Online accounts are not configured for this deployment yet. You can keep working offline.');
  }
  return supabase;
}

/** Calls one of our serverless API routes with the current user's access token. */
export async function apiFetch<T = any>(path: string, body?: unknown): Promise<T> {
  const sb = requireSupabase();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in first.');
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {})
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `Request failed (${r.status})`);
  return json as T;
}

/** Turns Supabase/Postgres errors into short, user-facing messages. */
export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): Error {
  const msg = (err as any)?.message as string | undefined;
  if (!msg) return new Error(fallback);
  if (/Invalid login credentials/i.test(msg)) return new Error('Incorrect email or password.');
  if (/Email not confirmed/i.test(msg)) return new Error('Please confirm your email address first — check your inbox for the confirmation link.');
  if (/User already registered/i.test(msg)) return new Error('An account with this email already exists. Please sign in instead.');
  if (/Failed to fetch|NetworkError/i.test(msg)) return new Error('Cannot reach the server. Check your internet connection.');
  return new Error(msg);
}
