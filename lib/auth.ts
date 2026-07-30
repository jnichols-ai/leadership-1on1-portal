import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { requireEnv, adminUserIds } from './config';
import { mondayQuery } from './monday';
import type { SessionUser } from './types';

const COOKIE_NAME = 'l1on1_session';
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

const MONDAY_AUTHORIZE_URL = 'https://auth.monday.com/oauth2/authorize';
const MONDAY_TOKEN_URL = 'https://auth.monday.com/oauth2/token';
const SCOPES = 'me:read boards:read boards:write';

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireEnv('SESSION_SECRET'));
}

export function redirectUri(): string {
  return `${requireEnv('APP_BASE_URL').replace(/\/$/, '')}/api/auth/callback`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('MONDAY_CLIENT_ID'),
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
  });
  return `${MONDAY_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch(MONDAY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: requireEnv('MONDAY_CLIENT_ID'),
      client_secret: requireEnv('MONDAY_CLIENT_SECRET'),
      redirect_uri: redirectUri(),
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`monday token exchange failed: ${await res.text()}`);
  }

  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error('monday token exchange returned no access_token');
  }
  return body.access_token;
}

/** Reads the authenticated identity straight from monday, not from the client. */
export async function fetchMondayIdentity(
  token: string
): Promise<{ id: string; name: string; email: string }> {
  const data = await mondayQuery<{
    me: { id: string; name: string; email: string };
  }>(token, `query { me { id name email } }`);
  return data.me;
}

export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    name: user.name,
    email: user.email,
    token: user.token,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

/** Returns the current user, or null when unauthenticated. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jwt = cookies().get(COOKIE_NAME)?.value;
  if (!jwt) return null;

  try {
    const { payload } = await jwtVerify(jwt, secretKey());
    return {
      id: String(payload.sub),
      name: String(payload.name),
      email: String(payload.email),
      token: String(payload.token),
    };
  } catch {
    return null;
  }
}

/** Throws a 401-shaped error when unauthenticated. Use in API routes. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const err = new Error('Not authenticated') as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return user;
}

export function isAdmin(user: SessionUser): boolean {
  return adminUserIds().includes(user.id);
}
