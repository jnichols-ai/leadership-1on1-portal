import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser, isAdmin } from '@/lib/auth';
import { listEnrollments, getDirectReports } from '@/lib/monday';
import { createEnrollment } from '@/lib/enrollment';
import { getProgram } from '@/lib/programs';
import { apiError, badRequest } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireSessionUser();
    const enrollments = await listEnrollments(
      user.token,
      isAdmin(user) ? null : user.id
    );
    return NextResponse.json({ enrollments });
  } catch (err) {
    return apiError(err);
  }
}

interface CreateBody {
  traineeItemId?: string;
  traineeEmail?: string;
  managerEmail?: string;
  programId?: string;
  meetingTime?: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = (await req.json()) as CreateBody;

    if (!body.traineeItemId) return badRequest('traineeItemId is required');
    if (!body.programId) return badRequest('programId is required');
    if (!body.meetingTime || !/^\d{2}:\d{2}$/.test(body.meetingTime)) {
      return badRequest('meetingTime must be HH:mm');
    }
    if (!body.traineeEmail || !body.traineeEmail.includes('@')) {
      return badRequest('A valid trainee email is required');
    }
    if (!body.managerEmail || !body.managerEmail.includes('@')) {
      return badRequest('A valid manager email is required');
    }

    // Re-resolve the trainee server-side. Never trust the client's copy of
    // employee data, and this also confirms the trainee really reports to the
    // authenticated manager.
    const reports = await getDirectReports(user.token, user.id);
    const trainee = reports.find((r) => r.itemId === body.traineeItemId);
    if (!trainee) {
      return badRequest(
        'That employee is not an active direct report of yours in the Employee Directory'
      );
    }

    getProgram(body.programId); // throws on unknown program

    const result = await createEnrollment({
      user,
      trainee,
      traineeEmail: body.traineeEmail,
      managerEmail: body.managerEmail,
      programId: body.programId,
      meetingTime: body.meetingTime,
      appBaseUrl: process.env.APP_BASE_URL ?? req.nextUrl.origin,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
