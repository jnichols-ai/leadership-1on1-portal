import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth';
import { getEnrollmentDetail } from '@/lib/monday';
import { assertManagerOwns } from '@/lib/enrollment';
import { getProgram } from '@/lib/programs';
import { apiError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSessionUser();
    const detail = await getEnrollmentDetail(user.token, params.id);
    assertManagerOwns(detail, user);

    const program = getProgram(detail.enrollment.program);

    return NextResponse.json({
      enrollment: detail.enrollment,
      sessions: detail.sessions,
      program: {
        programId: program.programId,
        programName: program.programName,
        sessionCount: program.sessionCount,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
