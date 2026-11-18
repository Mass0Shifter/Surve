import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

export type Req = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };
export type Res = ServerResponse & {
  status: (code: number) => Res;
  json: (body: unknown) => void;
};

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new HttpError(500, `Server is missing configuration: ${name}`);
  return v;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    if (!url) throw new HttpError(500, 'Server is missing configuration: SUPABASE_URL');
    admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return admin;
}

/** Resolves the signed-in user from the `Authorization: Bearer <supabase access token>` header. */
export async function requireUser(req: Req): Promise<User> {
  const header = req.headers['authorization'] || '';
  const token = Array.isArray(header) ? header[0] : header;
  const jwt = token.startsWith('Bearer ') ? token.slice(7) : '';
  if (!jwt) throw new HttpError(401, 'Please sign in.');
  const { data, error } = await supabaseAdmin().auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  return data.user;
}

export function allowMethods(req: Req, methods: string[]): void {
  if (!methods.includes(req.method || '')) throw new HttpError(405, 'Method not allowed');
}

export function jsonBody<T = Record<string, unknown>>(req: Req): T {
  const b = req.body;
  if (b && typeof b === 'object') return b as T;
  if (typeof b === 'string') {
    try { return JSON.parse(b) as T; } catch { /* fallthrough */ }
  }
  throw new HttpError(400, 'Invalid JSON body');
}

export function send(res: Res, status: number, body: unknown): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export function handle(fn: (req: Req, res: Res) => Promise<void>) {
  return async (req: Req, res: Res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : 'Unexpected server error';
      if (status >= 500) console.error(err);
      send(res, status, { error: message });
    }
  };
}

export function appOrigin(req: Req): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `https://${Array.isArray(host) ? host[0] : host}`;
}

/** Reads the raw request body (used for webhook signature checks). */
export function rawBody(req: Req): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
