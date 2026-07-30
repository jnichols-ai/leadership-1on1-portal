import { redirect } from 'next/navigation';
import { getSessionUser, isAdmin } from '@/lib/auth';
import { listEnrollments, getEnrollmentDetail } from '@/lib/monday';
import { getProgram } from '@/lib/programs';
import { OUTCOME } from '@/lib/config';

export const dynamic = 'force-dynamic';

function statusPill(status: string) {
  const cls =
    status === 'Certified'
      ? 'green'
      : status === 'In Progress'
        ? 'amber'
        : status === 'Stalled'
          ? 'red'
          : 'grey';
  return <span className={`pill ${cls}`}>{status}</span>;
}

export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect('/');

  const enrollments = await listEnrollments(
    user.token,
    isAdmin(user) ? null : user.id
  );

  const rows = await Promise.all(
    enrollments.map(async (e) => {
      const detail = await getEnrollmentDetail(user.token, e.itemId);
      const next = detail.sessions.find((s) => !s.locked);
      let programName = e.program;
      let sessionCount = 6;
      try {
        const p = getProgram(e.program);
        programName = p.programName;
        sessionCount = p.sessionCount;
      } catch {
        /* unknown program — show the raw id */
      }
      const cleared = detail.sessions.filter(
        (s) => s.outcome === OUTCOME.cleared
      ).length;
      return { e, next, programName, sessionCount, cleared };
    })
  );

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Your leaders in training</h1>
          <p className="muted small" style={{ margin: '2px 0 0' }}>
            {rows.length === 0
              ? 'No active enrollments yet.'
              : `${rows.length} enrollment${rows.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <a href="/enroll">
          <button className="primary">Start a new certification</button>
        </a>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <h3>Nothing here yet</h3>
          <p className="muted" style={{ margin: 0 }}>
            Start a certification to schedule the six weekly 1:1s and generate
            the discussion guides.
          </p>
        </div>
      ) : (
        rows.map(({ e, next, programName, sessionCount, cleared }) => (
          <div className="card" key={e.itemId}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'flex-start',
              }}
            >
              <div>
                <h2>{e.trainee}</h2>
                <p className="muted small" style={{ margin: 0 }}>
                  {programName}
                </p>
              </div>
              {statusPill(e.status)}
            </div>

            <div className="meta" style={{ marginTop: 14 }}>
              <div>
                <dt>Progress</dt>
                <dd>
                  {cleared} of {sessionCount} cleared
                </dd>
              </div>
              <div>
                <dt>Next session</dt>
                <dd>
                  {next
                    ? `#${next.sessionNumber} · ${next.meetingDate ?? 'unscheduled'}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{e.startDate ?? '—'}</dd>
              </div>
              <div>
                <dt>Certified</dt>
                <dd>{e.certifiedDate ?? '—'}</dd>
              </div>
            </div>

            {next && (
              <div style={{ marginTop: 16 }}>
                <a href={`/session/${next.itemId}`}>
                  <button className="primary">
                    Open Session {next.sessionNumber}
                    {next.attempt > 1 ? ` (retake ${next.attempt})` : ''}
                  </button>
                </a>
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
