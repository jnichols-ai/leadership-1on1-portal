'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProgramSession, SessionRecord } from '@/lib/types';
import { promptLabel } from '@/lib/prompt-labels';

interface Props {
  sessionItemId: string;
  definition: ProgramSession;
  record: SessionRecord;
  program: {
    programName: string;
    sessionCount: number;
    ratingScale: { value: number; label: string }[];
    cadenceDays: number;
  };
  enrollment: { trainee: string; status: string };
  managerName: string;
}

export default function SessionForm({
  sessionItemId,
  definition,
  record,
  program,
  enrollment,
  managerName,
}: Props) {
  const router = useRouter();
  const locked = record.locked;

  const [showPrep, setShowPrep] = useState(!locked);
  const [showSource, setShowSource] = useState(false);
  const [ratings, setRatings] = useState<(number | null)[]>(
    record.blockRatings.length === 3 ? record.blockRatings : [null, null, null]
  );
  const [notes, setNotes] = useState<string[]>(
    record.blockNotes.length === 3 ? record.blockNotes : ['', '', '']
  );
  // The board always returns one boolean per criterion column; a program that
  // defines fewer criteria than the board has columns ignores the extras.
  const criteriaCount = definition.successCriteria.length;
  const [criteria, setCriteria] = useState<boolean[]>(() =>
    Array.from({ length: criteriaCount }, (_, i) => record.criteria[i] ?? false)
  );
  const [followUp, setFollowUp] = useState(record.followUp);
  const [meetingDate, setMeetingDate] = useState(
    record.meetingDate ?? new Date().toISOString().slice(0, 10)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    cleared: boolean;
    certified: boolean;
    retakeDate: string | null;
    retakeCalendarLink: string | null;
    shiftedSessions: number;
  } | null>(null);

  const allCriteria = criteria.every(Boolean);
  const notesComplete = notes.every((n) => n.trim().length > 0);
  const ratingsComplete = ratings.every((r) => r !== null);
  const followUpOk = allCriteria || followUp.trim().length > 0;
  const canSubmit =
    !locked && notesComplete && ratingsComplete && followUpOk && !submitting;

  function setRating(i: number, v: number) {
    setRatings((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  }
  function setNote(i: number, v: string) {
    setNotes((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  }
  function toggleCriterion(i: number) {
    setCriteria((prev) => prev.map((x, idx) => (idx === i ? !x : x)));
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionItemId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockRatings: ratings,
          blockNotes: notes,
          criteria,
          followUp,
          meetingDate,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Submission failed');
      setResult(body);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="card">
        <h2>
          {result.certified
            ? 'Certification awarded'
            : result.cleared
              ? 'Session signed off'
              : 'Session signed off — not cleared'}
        </h2>

        {result.cleared ? (
          <p className="muted">
            {result.certified
              ? `${enrollment.trainee} has completed all ${program.sessionCount} sessions and is certified.`
              : `${enrollment.trainee} is cleared for the next module.`}
          </p>
        ) : (
          <>
            <p className="muted">
              {definition.title} has been scheduled again for{' '}
              <strong>{result.retakeDate}</strong>.
              {result.shiftedSessions > 0 &&
                ` The remaining ${result.shiftedSessions} session${
                  result.shiftedSessions === 1 ? '' : 's'
                } moved out by ${program.cadenceDays} days.`}
            </p>

            {result.retakeCalendarLink && (
              <p className="small">
                <a
                  href={result.retakeCalendarLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Add the retake to Google Calendar
                </a>{' '}
                <span className="muted">
                  — only needed if the monday calendar sync is not set up.
                </span>
              </p>
            )}
          </>
        )}

        <a href="/dashboard">
          <button className="primary">Back to dashboard</button>
        </a>
      </div>
    );
  }

  return (
    <>
      <p className="small" style={{ marginTop: 0 }}>
        <a href="/dashboard">← Dashboard</a>
      </p>

      <div className="card">
        <div className="eyebrow">
          {program.programName} · {definition.moduleLabel} · Session{' '}
          {definition.sessionNumber} of {program.sessionCount}
          {record.attempt > 1 ? ` · Retake ${record.attempt}` : ''}
        </div>
        <h2 style={{ fontSize: 21 }}>{definition.title}</h2>
        <p className="muted" style={{ margin: '2px 0 14px' }}>
          {definition.level} · {enrollment.trainee}
        </p>

        <label htmlFor="date">Meeting date</label>
        <input
          id="date"
          type="date"
          value={meetingDate}
          disabled={locked}
          onChange={(e) => setMeetingDate(e.target.value)}
          style={{ maxWidth: 220 }}
        />
      </div>

      {locked && (
        <div className="banner ok">
          Signed off by {record.signedBy} on {record.signedAt}. This record is
          locked. Outcome: <strong>{record.outcome}</strong>.
        </div>
      )}

      {error && <div className="banner error">{error}</div>}

      {/* ---------------- Prep ---------------- */}
      <div className="prep">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div className="eyebrow" style={{ margin: 0 }}>
            Prep · {definition.prepMinutes} min
          </div>
          <button
            className="secondary"
            style={{ padding: '4px 10px', fontSize: 13 }}
            onClick={() => setShowPrep((s) => !s)}
          >
            {showPrep ? 'Hide' : 'Show'}
          </button>
        </div>

        {showPrep && (
          <div style={{ marginTop: 10 }}>
            <p style={{ marginTop: 0 }}>
              <strong>Core concept.</strong> {definition.coreConcept}
            </p>
            {definition.supervisorTip && (
              <p style={{ marginBottom: 0 }}>
                <strong>Supervisor mindset tip.</strong>{' '}
                {definition.supervisorTip}
              </p>
            )}
            {definition.purpose && (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Goal: {definition.purpose}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ------- Source material (SKOOL lesson + reference article) ------- */}
      {definition.sourceMaterial && (
        <div className="prep">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div className="eyebrow" style={{ margin: 0 }}>
              What the trainee prepared
            </div>
            <button
              className="secondary"
              style={{ padding: '4px 10px', fontSize: 13 }}
              onClick={() => setShowSource((s) => !s)}
            >
              {showSource ? 'Hide' : 'Show'}
            </button>
          </div>

          {showSource && (
            <div style={{ marginTop: 10 }}>
              {definition.sourceMaterial.skool.map((section) => (
                <details key={section.heading} style={{ marginBottom: 8 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                    {section.heading}
                  </summary>
                  <div style={{ marginTop: 6 }}>
                    {section.paragraphs.map((para, i) => (
                      <p key={i} className="small" style={{ margin: '0 0 6px' }}>
                        {para}
                      </p>
                    ))}
                  </div>
                </details>
              ))}

              {definition.sourceMaterial.reference && (
                <details style={{ marginBottom: 0 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                    Reference · {definition.sourceMaterial.reference.title}
                  </summary>
                  <div style={{ marginTop: 6 }}>
                    {definition.sourceMaterial.reference.paragraphs.map(
                      (para, i) => (
                        <p
                          key={i}
                          className="small"
                          style={{ margin: '0 0 6px' }}
                        >
                          {para}
                        </p>
                      )
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Blocks ---------------- */}
      {definition.blocks.map((block, i) => (
        <div className="card" key={block.id}>
          <div className="eyebrow">Discussion {i + 1}</div>
          <h3>{block.title}</h3>

          {block.context && (
            <p className="muted small" style={{ marginTop: 0 }}>
              {block.context}
            </p>
          )}

          <div className="look-for">
            <strong>What to look for.</strong> {block.whatToLookFor}
          </div>

          {block.prompts.map((p, pi) => (
            <div className="prompt" key={pi}>
              <span className="ptype">{promptLabel(p.type)}</span>
              {p.text}
            </div>
          ))}

          <div style={{ marginTop: 16 }}>
            <label>Assessment</label>
            <div className="ratings">
              {program.ratingScale.map((r, ri) => (
                <button
                  key={r.value}
                  type="button"
                  disabled={locked}
                  aria-pressed={ratings[i] === ri}
                  onClick={() => setRating(i, ri)}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <label htmlFor={`notes-${i}`}>
              Notes — what did they actually say?
            </label>
            <textarea
              id={`notes-${i}`}
              value={notes[i]}
              disabled={locked}
              onChange={(e) => setNote(i, e.target.value)}
              placeholder="Capture their answer, not your summary."
            />
          </div>
        </div>
      ))}

      {/* ---------------- Gate ---------------- */}
      <div className="card">
        <div className="eyebrow">Sign-off</div>
        <h3>{definition.gateLabel}</h3>

        {definition.successCriteria.map((c, i) => (
          <label
            key={i}
            className={`criterion ${criteria[i] ? 'checked' : ''}`}
            style={{ fontWeight: 400 }}
          >
            <input
              type="checkbox"
              checked={criteria[i]}
              disabled={locked}
              onChange={() => toggleCriterion(i)}
            />
            <span>{c}</span>
          </label>
        ))}

        <div className={`gate ${allCriteria ? 'cleared' : 'blocked'}`}>
          {allCriteria ? (
            <>
              <strong>Cleared.</strong>{' '}
              {definition.isFinalSession
                ? `Signing off will award the certification to ${enrollment.trainee}.`
                : definition.nextStep}
            </>
          ) : (
            <>
              <strong>Not yet cleared.</strong> Signing off now will schedule{' '}
              {definition.title} again in {program.cadenceDays} days and push the
              remaining sessions out by the same amount.
            </>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <label htmlFor="followup">
            {allCriteria
              ? 'Commitments before the next session (optional)'
              : 'What needs to happen before you meet again? (required)'}
          </label>
          <textarea
            id="followup"
            value={followUp}
            disabled={locked}
            onChange={(e) => setFollowUp(e.target.value)}
          />
        </div>
      </div>

      {!locked && (
        <div className="card">
          <p className="small muted" style={{ marginTop: 0 }}>
            Signing off records <strong>{managerName}</strong> and today&apos;s
            date, then locks this session. It cannot be edited afterwards.
          </p>
          {!ratingsComplete && (
            <p className="small" style={{ color: 'var(--red)' }}>
              Set an assessment for all three discussion blocks.
            </p>
          )}
          {!notesComplete && (
            <p className="small" style={{ color: 'var(--red)' }}>
              Notes are required for all three discussion blocks.
            </p>
          )}
          {!followUpOk && (
            <p className="small" style={{ color: 'var(--red)' }}>
              A follow-up note is required when the trainee is not cleared.
            </p>
          )}
          <button className="primary" disabled={!canSubmit} onClick={submit}>
            {submitting
              ? 'Signing…'
              : allCriteria
                ? definition.isFinalSession
                  ? 'Sign off and award certification'
                  : 'Sign off as cleared'
                : 'Sign off as not cleared'}
          </button>
        </div>
      )}
    </>
  );
}
