import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { BookizError } from '../errors.ts';
import type { CloudEnv } from './env.ts';

export type User = { id: string; email: string };
export type Session = { access_token: string; refresh_token: string; user: User };

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksFor = '';

/**
 * Verify a Supabase access token against the project's public keys. Used for
 * both the dashboard session and tokens an AI assistant obtained through OAuth.
 */
export async function verifyAccessToken(env: CloudEnv, token: string): Promise<User | null> {
  if (!jwks || jwksFor !== env.supabaseUrl) {
    jwks = createRemoteJWKSet(new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`));
    jwksFor = env.supabaseUrl;
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${env.supabaseUrl}/auth/v1`,
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
    });
    if (typeof payload.sub !== 'string' || payload.role !== 'authenticated') return null;
    if (payload.is_anonymous === true) return null;
    return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : '' };
  } catch {
    return null;
  }
}

export class AuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function authApi(env: CloudEnv, path: string, key: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${env.supabaseUrl}/auth/v1${path}`, {
    method: 'POST',
    // Supabase's current API keys are not JWTs: they go in `apikey` only.
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new AuthError(response.status, String(data.msg ?? data.error_description ?? data.message ?? 'auth error'));
  return data;
}

/**
 * Create a one-time sign-in code for an address, creating the user on first
 * use. Supabase does not send mail here; the caller does, so every message
 * from Bookiz leaves through one sender.
 */
export async function createLoginCode(env: CloudEnv, email: string): Promise<string> {
  const data = await authApi(env, '/admin/generate_link', env.supabaseSecretKey, { type: 'magiclink', email });
  const code = data.email_otp;
  if (typeof code !== 'string' || !/^\d{6,10}$/.test(code)) throw new Error('Supabase returned no sign-in code');
  return code;
}

function toSession(data: Record<string, unknown>): Session {
  const user = data.user as { id?: string; email?: string } | undefined;
  if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string' || !user?.id) {
    throw new AuthError(401, 'no session');
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token, user: { id: user.id, email: user.email ?? '' } };
}

export async function verifyLoginCode(env: CloudEnv, email: string, code: string): Promise<Session> {
  try {
    // 'email' covers both a first sign-in (which Supabase calls a signup) and later ones.
    return toSession(await authApi(env, '/verify', env.supabasePublishableKey, { type: 'email', email, token: code }));
  } catch (error) {
    if (error instanceof AuthError) throw new BookizError('Die code klopt niet of is verlopen.', 'Vraag een nieuwe code aan.');
    throw error;
  }
}

export async function refreshSession(env: CloudEnv, refreshToken: string): Promise<Session | null> {
  try {
    return toSession(await authApi(env, '/token?grant_type=refresh_token', env.supabasePublishableKey, { refresh_token: refreshToken }));
  } catch {
    return null;
  }
}

const ACCESS_COOKIE = '__Host-bz_at';
const REFRESH_COOKIE = '__Host-bz_rt';

export function readCookies(req: IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((pair) => pair.trim().split('='))
      .filter((pair): pair is [string, string] => pair.length === 2 && Boolean(pair[0]))
      .map(([name, value]) => [name, decodeURIComponent(value)]),
  );
}

function cookie(name: string, value: string, maxAge: number): string {
  // __Host- cookies are bound to this exact origin; Lax keeps them off cross-site form posts.
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function sessionCookies(session: Session | null): string[] {
  if (!session) return [cookie(ACCESS_COOKIE, '', 0), cookie(REFRESH_COOKIE, '', 0)];
  return [cookie(ACCESS_COOKIE, session.access_token, 3600), cookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 60)];
}

/** The signed-in dashboard user, refreshing an expired session when possible. */
export async function currentSession(env: CloudEnv, req: IncomingMessage, res: ServerResponse): Promise<Session | null> {
  const cookies = readCookies(req);
  const access = cookies[ACCESS_COOKIE];
  const refresh = cookies[REFRESH_COOKIE];
  if (access) {
    const user = await verifyAccessToken(env, access);
    if (user && refresh) return { access_token: access, refresh_token: refresh, user };
  }
  if (!refresh) return null;
  const renewed = await refreshSession(env, refresh);
  if (renewed) res.setHeader('set-cookie', sessionCookies(renewed));
  return renewed;
}

export function bearerToken(req: IncomingMessage): string | undefined {
  return /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
}
