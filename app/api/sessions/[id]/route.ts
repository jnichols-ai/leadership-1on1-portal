import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth';
import { getEnrollmentDetail, getSessionRecord } from '@/lib/monday';
import { submitSession, assertManagerOwns } from '@/lib/enrollment';
import { getProgram, getSession } from '@/lib/programs';
import { apiError, badRequest } from '@/lib/http';
import { MAX_CRITERIA } from '@/lib/config';
import type { SubmitSessionPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSessionUser();
    const stub = await getSessionRecord(user.token, params.id);
    if (!stub.enrollmentItemId) {
      return badRequest('This session is not linked to an enrollment');
    }

    const detail = await getEnrollmentDetail(user.token, stub.enrollmentItemId);
    assertManagerOwns(detail, user);

    const record = detail.sessions.find((s) => s.itemId === params.id);
    if (!record) return badRequest('Session not found on this enrollment');

    const program = getProgram(detail.enrollment.program);
    const definition = getSession(program.programId, record.sessionNumber);

    return NextResponse.json({
      enrollment: detail.enrollment,
      record,
      definition,
      program: {
        programId: program.programId,
        programName: program.programName,
        sessionCount: program.sessionCount,
        ratingScale: program.ratingScale,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSessionUser();
    const body = (await req.json()) as Partial<SubmitSessionPayload>;

    if (
      !Array.isArray(body.blockRatings) ||
      body.blockRatings.length !== 3 ||
      body.blockRatings.some((r) => typeof r !== 'number' || r < 0 || r > 2)
    ) {
      return badRequest('blockRatings must be three values between 0 and 2');
    }
    if (
      !Array.isArray(body.blockNotes) ||
      body.blockNotes.length !== 3 ||
      body.blockNotes.some((n) => typeof n !== 'string' || !n.trim())
    ) {
      return badRequest('Notes are required for all three discussion blocks');
    }
    // The exact count is program-specific and is enforced in submitSession,
    // which knows the enrollment's program. Here we only bound it.
    if (
      !Array.isArray(body.criteria) ||
      body.criteria.length < 1 ||
      body.criteria.length > MAX_CRITERIA ||
      body.criteria.some((c) => typeof c !== 'boolean')
    ) {
      return badRequest(`criteria must be 1-${MAX_CRITERIA} booleans`);
    }
    if (!body.meetingDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.meetingDate)) {
      return badRequest('meetingDate must be YYYY-MM-DD');
    }

    const result = await submitSession(
      user,
      params.id,
      {
        blockRatings: body.blockRatings,
        blockNotes: body.blockNotes,
        criteria: body.criteria,
        followUp: body.followUp ?? '',
        meetingDate: body.meetingDate,
      },
      process.env.APP_BASE_URL ?? req.nextUrl.origin
    );

    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
