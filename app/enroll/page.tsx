import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getDirectReports } from '@/lib/monday';
import { listPrograms } from '@/lib/programs';
import EnrollForm from './EnrollForm';

export const dynamic = 'force-dynamic';

export default async function EnrollPage() {
  const user = await getSessionUser();
  if (!user) redirect('/');

  const reports = await getDirectReports(user.token, user.id);
  const programs = listPrograms().map((p) => ({
    programId: p.programId,
    programName: p.programName,
    sessionCount: p.sessionCount,
    cadenceDays: p.cadenceDays,
    startOffsetDays: p.startOffsetDays,
    meetingDurationMinutes: p.meetingDurationMinutes,
  }));

  const trainees = reports.map((r) => ({
    itemId: r.itemId,
    displayName: r.displayName,
    office: r.office,
    jobPosition: r.jobPosition,
    hireDate: r.hireDate,
    suggestedEmail: r.workEmail ?? r.personalEmail ?? '',
    hasWorkEmail: Boolean(r.workEmail),
  }));

  return (
    <>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Start a certification</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        This schedules the weekly 1:1s on the Frontline Leaders calendar and
        creates the tracking record in monday.
      </p>

      {trainees.length === 0 ? (
        <div className="card">
          <h3>No direct reports found</h3>
          <p className="muted" style={{ margin: 0 }}>
            The HR Employee Directory has no Active employees with you set as
            their Manager. Ask HR to update the Manager column, then reload.
          </p>
        </div>
      ) : (
        <EnrollForm
          trainees={trainees}
          programs={programs}
          defaultManagerEmail={user.email}
        />
      )}
    </>
  );
}
