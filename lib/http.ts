import { NextResponse } from 'next/server';

/** Normalizes thrown errors into a JSON response with a sensible status. */
export function apiError(err: unknown): NextResponse {
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: number }).status) || 500
      : 500;

  const message = err instanceof Error ? err.message : 'Unexpected error';

  if (status >= 500) {
    console.error('[api]', err);
  }

  return NextResponse.json({ error: message }, { status });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}
