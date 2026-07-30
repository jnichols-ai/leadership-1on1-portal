import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/', req.url));
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
