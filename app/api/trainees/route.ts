import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth';
import { getDirectReports } from '@/lib/monday';
import { apiError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Returns the authenticated manager's Active direct reports from the HR
 * Employee Directory, flagging which ones are missing a usable work email.
 */
export async function GET() {
  try {
    const user = await requireSessionUser();
    const reports = await getDirectReports(user.token, user.id);

    return NextResponse.json({
      trainees: reports.map((r) => ({
        ...r,
        suggestedEmail: r.workEmail ?? r.personalEmail ?? '',
        needsEmailConfirmation:
          !r.workEmail || !r.workEmail.toLowerCase().includes('@'),
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}
