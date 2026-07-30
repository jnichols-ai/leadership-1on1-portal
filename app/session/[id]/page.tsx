import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getEnrollmentDetail, getSessionRecord } from '@/lib/monday';
import { assertManagerOwns } from '@/lib/enrollment';
import { getProgram, getSession } from '@/lib/programs';
import SessionForm from './SessionForm';

export const dynamic = 'force-dynamic';

export default async function SessionPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect('/');

  const stub = await getSessionRecord(user.token, params.id);
  if (!stub.enrollmentItemId) {
    return (
      <div className="card">
        <h3>Session not linked</h3>
        <p className="muted">
          This session item has no enrollment linked to it in monday.
        </p>
      </div>
    );
  }

  const detail = await getEnrollmentDetail(user.token, stub.enrollmentItemId);
  assertManagerOwns(detail, user);

  const record = detail.sessions.find((s) => s.itemId === params.id);
  if (!record) {
    return (
      <div className="card">
        <h3>Session not found</h3>
        <p className="muted">That session does not belong to this enrollment.</p>
      </div>
    );
  }

  const program = getProgram(detail.enrollment.program);
  const definition = getSession(program.programId, record.sessionNumber);

  return (
    <SessionForm
      sessionItemId={params.id}
      definition={definition}
      record={record}
      program={{
        programName: program.programName,
        sessionCount: program.sessionCount,
        ratingScale: program.ratingScale,
        cadenceDays: program.cadenceDays,
      }}
      enrollment={{
        trainee: detail.enrollment.trainee,
        status: detail.enrollment.status,
      }}
      managerName={user.name}
    />
  );
}
