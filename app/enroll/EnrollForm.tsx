'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Trainee {
  itemId: string;
  displayName: string;
  office: string | null;
  jobPosition: string | null;
  hireDate: string | null;
  suggestedEmail: string;
  hasWorkEmail: boolean;
}

interface ProgramOption {
  programId: string;
  programName: string;
  sessionCount: number;
  cadenceDays: number;
  startOffsetDays: number;
  meetingDurationMinutes: number;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function EnrollForm({
  trainees,
  programs,
  defaultManagerEmail,
}: {
  trainees: Trainee[];
  programs: ProgramOption[];
  defaultManagerEmail: string;
}) {
  const router = useRouter();
  const [traineeId, setTraineeId] = useState('');
  const [programId, setProgramId] = useState(programs[0]?.programId ?? '');
  const [email, setEmail] = useState('');
  const [managerEmail, setManagerEmail] = useState(defaultManagerEmail);
  const [time, setTime] = useState('09:00');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    calendarLinks: {
      sessionNumber: number;
      title: string;
      date: string;
      url: string;
    }[];
  } | null>(null);

  const trainee = trainees.find((t) => t.itemId === traineeId) ?? null;
  const program = programs.find((p) => p.programId === programId) ?? null;

  const schedule = useMemo(() => {
    if (!program) return [];
    const today = new Date().toISOString().slice(0, 10);
    const start = addDays(today, program.startOffsetDays);
    return Array.from({ length: program.sessionCount }, (_, i) =>
      addDays(start, i * program.cadenceDays)
    );
  }, [program]);

  function selectTrainee(id: string) {
    setTraineeId(id);
    const t = trainees.find((x) => x.itemId === id);
    setEmail(t?.suggestedEmail ?? '');
    setWarning(
      t && !t.hasWorkEmail
        ? 'This employee has no work email in the HR directory. Confirm the address below before continuing — it is what the calendar invite goes to.'
        : null
    );
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traineeItemId: traineeId,
          traineeEmail: email,
          managerEmail,
          programId,
          meetingTime: time,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to create enrollment');

      setCreated({ calendarLinks: body.calendarLinks ?? [] });
      setSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
      setSubmitting(false);
    }
  }

  const ready =
    traineeId &&
    programId &&
    email.includes('@') &&
    managerEmail.includes('@') &&
    time;

  if (created) {
    return (
      <>
        <div className="banner ok">
          Enrollment created. {created.calendarLinks.length} sessions are on the
          Leadership 1:1 Sessions board in monday.
        </div>

        <div className="card">
          <h3>Calendar</h3>
          <p className="muted small" style={{ marginTop: 0 }}>
            Nothing more to do — all {created.calendarLinks.length} meetings are
            being added to the <strong>Frontline Leaders</strong> calendar
            automatically, with you and the trainee both invited. They usually
            appear within a minute.
          </p>

          <details style={{ marginTop: 12 }}>
            <summary
              className="muted small"
              style={{ cursor: 'pointer', marginBottom: 10 }}
            >
              Meeting dates, and manual backup links
            </summary>

            <p className="muted small">
              Only use these if a meeting has not appeared after a few minutes —
              they add the event by hand, with the trainee already set as a
              guest.
            </p>

            <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {created.calendarLinks.map((l) => (
                <tr key={l.sessionNumber}>
                  <td>Session {l.sessionNumber}</td>
                  <td>
                    {new Date(`${l.date}T12:00:00Z`).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td>
                    <a href={l.url} target="_blank" rel="noopener noreferrer">
                      Add manually
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </details>
        </div>

        <button className="primary" onClick={() => router.push('/dashboard')}>
          Done
        </button>
      </>
    );
  }

  return (
    <>
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <h3>1. Who are you certifying?</h3>
        <label htmlFor="trainee">Leader in training</label>
        <select
          id="trainee"
          value={traineeId}
          onChange={(e) => selectTrainee(e.target.value)}
        >
          <option value="">Select one of your direct reports…</option>
          {trainees.map((t) => (
            <option key={t.itemId} value={t.itemId}>
              {t.displayName}
              {t.jobPosition ? ` — ${t.jobPosition}` : ''}
              {t.office ? ` (${t.office})` : ''}
            </option>
          ))}
        </select>

        {trainee && (
          <dl className="meta" style={{ marginTop: 16 }}>
            <div>
              <dt>Office</dt>
              <dd>{trainee.office ?? '—'}</dd>
            </div>
            <div>
              <dt>Position</dt>
              <dd>{trainee.jobPosition ?? '—'}</dd>
            </div>
            <div>
              <dt>Hire date</dt>
              <dd>{trainee.hireDate ?? '—'}</dd>
            </div>
          </dl>
        )}
      </div>

      {trainee && (
        <>
          <div className="card">
            <h3>2. Confirm the email addresses</h3>
            {warning && <div className="banner warn">{warning}</div>}
            <label htmlFor="email">Calendar invite goes to</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@frontlinepest.com"
            />
            <label htmlFor="mgr-email" style={{ marginTop: 16 }}>
              Your email
            </label>
            <input
              id="mgr-email"
              type="email"
              value={managerEmail}
              onChange={(e) => setManagerEmail(e.target.value)}
              placeholder="you@frontlinepest.com"
            />
            <p className="muted small" style={{ marginBottom: 0 }}>
              Prefilled from your monday login. Change it if your calendar uses
              a different address — both of you are added to every meeting.
              Stored on the enrollment record; the HR Employee Directory is not
              modified.
            </p>
          </div>

          <div className="card">
            <h3>3. Program and schedule</h3>
            <div className="row">
              <div>
                <label htmlFor="program">Program</label>
                <select
                  id="program"
                  value={programId}
                  onChange={(e) => setProgramId(e.target.value)}
                >
                  {programs.map((p) => (
                    <option key={p.programId} value={p.programId}>
                      {p.programName} ({p.sessionCount} sessions)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="time">Weekly meeting time</label>
                <input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>

            {program && (
              <>
                <p
                  className="muted small"
                  style={{ marginBottom: 6, marginTop: 16 }}
                >
                  {program.sessionCount} meetings ·{' '}
                  {program.meetingDurationMinutes} min · starting next week
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((d, i) => (
                      <tr key={d}>
                        <td>Session {i + 1}</td>
                        <td>
                          {new Date(`${d}T12:00:00Z`).toLocaleDateString(
                            'en-US',
                            {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            }
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <button
            className="primary"
            disabled={!ready || submitting}
            onClick={submit}
          >
            {submitting
              ? 'Creating…'
              : `Create enrollment and schedule ${program?.sessionCount ?? 6} meetings`}
          </button>
        </>
      )}
    </>
  );
}
