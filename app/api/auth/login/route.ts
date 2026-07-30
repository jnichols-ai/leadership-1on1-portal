import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { authorizeUrl } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(authorizeUrl(state));

  // CSRF guard: the callback compares this against the returned state.
  res.cookies.set('l1on1_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return res;
}
