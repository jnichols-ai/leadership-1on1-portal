import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForToken,
  fetchMondayIdentity,
  createSession,
  sessionCookieOptions,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const expectedState = req.cookies.get('l1on1_oauth_state')?.value;

  if (!code) {
    return NextResponse.redirect(new URL('/?error=missing_code', req.url));
  }
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL('/?error=bad_state', req.url));
  }

  try {
    const token = await exchangeCodeForToken(code);
    const me = await fetchMondayIdentity(token);

    const jwt = await createSession({
      id: me.id,
      name: me.name,
      email: me.email,
      token,
    });

    const res = NextResponse.redirect(new URL('/dashboard', req.url));
    const opts = sessionCookieOptions();
    res.cookies.set(opts.name, jwt, opts);
    res.cookies.delete('l1on1_oauth_state');
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(message)}`, req.url)
    );
  }
}
