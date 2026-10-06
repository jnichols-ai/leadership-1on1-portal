import {
  ENROLLMENT_BOARD,
  SESSION_BOARD,
  ENROLLMENT_STATUS,
  OUTCOME,
  RATING_LABELS,
  PROGRAM_GROUPS,
  CALENDAR,
} from './config';
import {
  createItem,
  updateColumnValues,
  getEnrollmentDetail,
  getSessionRecord,
  type EnrollmentDetail,
} from './monday';
import {
  buildSchedule,
  firstSessionDate,
  addDays,
  wallClockToUtc,
  googleCalendarLink,
  type IsoDate,
} from './scheduling';
import { criteriaCount, getProgram } from './programs';
import type {
  CalendarLink,
  DirectoryEmployee,
  Program,
  ProgramSession,
  SessionUser,
  SubmitSessionPayload,
} from './types';

const C = ENROLLMENT_BOARD.columns;
const S = SESSION_BOARD.columns;

// ---------------------------------------------------------------------------
// Event content
// ---------------------------------------------------------------------------

export function sessionTitle(
  traineeName: string,
  session: ProgramSession,
  attempt: number
): string {
  const retake = attempt > 1 ? ` (retake ${attempt})` : '';
  return `1:1 — ${traineeName} — Session ${session.sessionNumber}: ${session.title}${retake}`;
}

/**
 * Body text for the calendar event. monday's Google Calendar integration maps a
 * long-text column to the event description, so the manager gets their 2–3
 * minute prep and the form link without opening the portal first.
 */
export function sessionDescription(
  session: ProgramSession,
  program: Program,
  formUrl: string
): string {
  const lines = [
    `${program.programName} · ${session.moduleLabel} · ${session.level}`,
    '',
    `PREP (${session.prepMinutes} min): ${session.coreConcept}`,
  ];

  if (session.supervisorTip) {
    lines.push('', `SUPERVISOR TIP: ${session.supervisorTip}`);
  }

  lines.push(
    '',
    'DISCUSSION:',
    ...session.blocks.map((b, i) => `${i + 1}. ${b.title}`),
    '',
    `Discussion guide and sign-off: ${formUrl}`
  );

  return lines.join('\n');
}

function formUrlFor(appBaseUrl: string, sessionItemId: string): string {
  return `${appBaseUrl.replace(/\/$/, '')}/session/${sessionItemId}`;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreateEnrollmentInput {
  user: SessionUser;
  trainee: DirectoryEmployee;
  traineeEmail: string;
  managerEmail: string;
  programId: string;
  meetingTime: string;
  appBaseUrl: string;
}

export interface CreateEnrollmentResult {
  enrollmentItemId: string;
  sessionItemIds: string[];
  schedule: IsoDate[];
  calendarLinks: CalendarLink[];
}

/**
 * Creates the enrollment and one item per session.
 *
 * Scheduling is handled by monday's Google Calendar integration reading the
 * session board, so this writes the columns that integration maps rather than
 * calling any calendar API.
 */
export async function createEnrollment(
  input: CreateEnrollmentInput
): Promise<CreateEnrollmentResult> {
  const program = getProgram(input.programId);
  const groups = PROGRAM_GROUPS[input.programId];
  if (!groups) {
    throw new Error(
      `No monday groups configured for program ${input.programId}. Add it to PROGRAM_GROUPS.`
    );
  }

  const startDate = firstSessionDate(new Date(), program.startOffsetDays);
  const schedule = buildSchedule(
    startDate,
    program.sessionCount,
    program.cadenceDays
  );

  const enrollmentItemId = await createItem(
    input.user.token,
    ENROLLMENT_BOARD.id,
    groups.enrollment,
    input.trainee.displayName,
    {
      [C.trainee]: input.trainee.displayName,
      [C.traineeEmail]: { email: input.traineeEmail, text: input.traineeEmail },
      [C.manager]: {
        personsAndTeams: [{ id: Number(input.user.id), kind: 'person' }],
      },
      [C.managerEmail]: {
        email: input.managerEmail,
        text: input.managerEmail,
      },
      [C.office]: input.trainee.office ?? '',
      [C.jobPosition]: input.trainee.jobPosition ?? '',
      ...(input.trainee.hireDate
        ? { [C.hireDate]: { date: input.trainee.hireDate } }
        : {}),
      [C.directoryItemId]: input.trainee.itemId,
      [C.program]: program.programId,
      [C.status]: { label: ENROLLMENT_STATUS.notStarted },
      [C.progress]: 0,
      [C.startDate]: { date: startDate },
      [C.meetingTime]: input.meetingTime,
    }
  );

  const sessionItemIds: string[] = [];
  const calendarLinks: CalendarLink[] = [];

  for (const [index, session] of program.sessions.entries()) {
    const id = await createSessionItem({
      token: input.user.token,
      groupId: groups.session,
      program,
      session,
      date: schedule[index],
      attempt: 1,
      enrollmentItemId,
      traineeName: input.trainee.displayName,
      traineeEmail: input.traineeEmail,
      managerId: input.user.id,
      managerEmail: input.managerEmail,
      meetingTime: input.meetingTime,
      appBaseUrl: input.appBaseUrl,
    });

    sessionItemIds.push(id);
    calendarLinks.push({
      sessionNumber: session.sessionNumber,
      title: sessionTitle(input.trainee.displayName, session, 1),
      date: schedule[index],
      url: googleCalendarLink({
        title: sessionTitle(input.trainee.displayName, session, 1),
        description: sessionDescription(
          session,
          program,
          formUrlFor(input.appBaseUrl, id)
        ),
        date: schedule[index],
        time: input.meetingTime,
        durationMinutes: program.meetingDurationMinutes,
        timeZone: CALENDAR.timeZone,
        guestEmail: input.traineeEmail,
      }),
    });
  }

  return { enrollmentItemId, sessionItemIds, schedule, calendarLinks };
}

interface CreateSessionItemInput {
  token: string;
  groupId: string;
  program: Program;
  session: ProgramSession;
  date: IsoDate;
  attempt: number;
  enrollmentItemId: string;
  traineeName: string;
  traineeEmail: string;
  managerId: string;
  managerEmail: string;
  meetingTime: string;
  appBaseUrl: string;
}

/**
 * Creates one session item, then patches in the description and form link.
 *
 * Two passes are necessary because the form URL contains the item's own ID,
 * which monday only assigns on creation.
 */
async function createSessionItem(
  input: CreateSessionItemInput
): Promise<string> {
  // monday stores date-column times in UTC and renders them in the account's
  // timezone. Writing the raw wall-clock string would shift every meeting.
  const utc = wallClockToUtc(input.date, input.meetingTime, CALENDAR.timeZone);

  const itemId = await createItem(
    input.token,
    SESSION_BOARD.id,
    input.groupId,
    sessionTitle(input.traineeName, input.session, input.attempt),
    {
      [S.enrollment]: { item_ids: [Number(input.enrollmentItemId)] },
      [S.trainee]: input.traineeName,
      [S.traineeEmail]: {
        email: input.traineeEmail,
        text: input.traineeEmail,
      },
      // Manager drives the per-manager "items assigned to me" calendar sync.
      [S.manager]: {
        personsAndTeams: [{ id: Number(input.managerId), kind: 'person' }],
      },
      // Explicit email because Zapier cannot read an address out of a people
      // column, and Google Calendar needs one to add an attendee.
      [S.managerEmail]: {
        email: input.managerEmail,
        text: input.managerEmail,
      },
      [S.program]: input.program.programId,
      [S.sessionNumber]: input.session.sessionNumber,
      [S.module]: input.session.title,
      [S.meeting]: { date: utc.date, time: utc.time },
      [S.outcome]: { label: OUTCOME.pending },
      [S.attempt]: input.attempt,
    }
  );

  const formUrl = formUrlFor(input.appBaseUrl, itemId);
  await updateColumnValues(input.token, SESSION_BOARD.id, itemId, {
    [S.eventDescription]: sessionDescription(
      input.session,
      input.program,
      formUrl
    ),
    [S.formLink]: { url: formUrl, text: 'Open discussion guide' },
  });

  return itemId;
}

// ---------------------------------------------------------------------------
// Submission and sign-off
// ---------------------------------------------------------------------------

export interface SubmitResult {
  cleared: boolean;
  certified: boolean;
  retakeSessionItemId: string | null;
  retakeDate: IsoDate | null;
  retakeCalendarLink: string | null;
  shiftedSessions: number;
}

/**
 * Writes a completed session, signs it, and applies the consequences.
 *
 * Cleared     → progress increments; the final session certifies the enrollment.
 * Not cleared → the same module is scheduled again one cadence later as a new
 *               attempt, and every remaining session shifts out by one cadence.
 *               The gate is real, not advisory.
 */
export async function submitSession(
  user: SessionUser,
  sessionItemId: string,
  payload: SubmitSessionPayload,
  appBaseUrl: string
): Promise<SubmitResult> {
  const stub = await getSessionRecord(user.token, sessionItemId);
  if (!stub.enrollmentItemId) {
    throw new Error('This session is not linked to an enrollment');
  }

  const detail = await getEnrollmentDetail(user.token, stub.enrollmentItemId);
  assertManagerOwns(detail, user);

  const record = detail.sessions.find((s) => s.itemId === sessionItemId);
  if (!record) throw new Error('Session does not belong to this enrollment');
  if (record.locked) {
    throw new Error('This session was already signed off and cannot be changed');
  }

  const program = getProgram(detail.enrollment.program);

  // The criterion count is program-specific (3 for How Successful People Lead, 4 for 7 Habits),
  // so it can only be enforced here, once the enrollment's program is known.
  const expectedCriteria = criteriaCount(program);
  if (payload.criteria.length !== expectedCriteria) {
    throw new Error(
      `${program.programName} requires ${expectedCriteria} sign-off criteria, got ${payload.criteria.length}`
    );
  }

  const cleared = payload.criteria.every(Boolean);

  if (!cleared && !payload.followUp.trim()) {
    throw new Error(
      'A follow-up note is required when the trainee is not cleared'
    );
  }

  const signedAt = new Date().toISOString().slice(0, 10);
  const time = detail.enrollment.meetingTime ?? '09:00';
  const meetingUtc = wallClockToUtc(payload.meetingDate, time, CALENDAR.timeZone);

  await updateColumnValues(user.token, SESSION_BOARD.id, sessionItemId, {
    [S.meeting]: { date: meetingUtc.date, time: meetingUtc.time },
    [S.blockRating[0]]: { label: RATING_LABELS[payload.blockRatings[0]] },
    [S.blockRating[1]]: { label: RATING_LABELS[payload.blockRatings[1]] },
    [S.blockRating[2]]: { label: RATING_LABELS[payload.blockRatings[2]] },
    [S.blockNotes[0]]: payload.blockNotes[0],
    [S.blockNotes[1]]: payload.blockNotes[1],
    [S.blockNotes[2]]: payload.blockNotes[2],
    // One checkbox per criterion the program defines; any columns beyond that
    // belong to longer programs and are left untouched.
    ...Object.fromEntries(
      payload.criteria.map((checked, i) => [
        S.criterion[i],
        { checked: checked ? 'true' : 'false' },
      ])
    ),
    [S.outcome]: { label: cleared ? OUTCOME.cleared : OUTCOME.notCleared },
    [S.followUp]: payload.followUp,
    [S.signedBy]: user.name,
    [S.signedAt]: { date: signedAt },
  });

  if (cleared) {
    const clearedCount =
      detail.sessions.filter(
        (s) => s.outcome === OUTCOME.cleared && s.itemId !== sessionItemId
      ).length + 1;
    const isFinal = record.sessionNumber === program.sessionCount;

    await updateColumnValues(user.token, ENROLLMENT_BOARD.id, stub.enrollmentItemId, {
      [C.progress]: clearedCount,
      [C.status]: {
        label: isFinal
          ? ENROLLMENT_STATUS.certified
          : ENROLLMENT_STATUS.inProgress,
      },
      ...(isFinal ? { [C.certifiedDate]: { date: signedAt } } : {}),
    });

    return {
      cleared: true,
      certified: isFinal,
      retakeSessionItemId: null,
      retakeDate: null,
      retakeCalendarLink: null,
      shiftedSessions: 0,
    };
  }

  // --- Not cleared: repeat this module and push everything downstream ------
  const cadence = program.cadenceDays;
  const retakeDate = addDays(payload.meetingDate, cadence);
  const groups = PROGRAM_GROUPS[program.programId];
  const sessionDef = program.sessions.find(
    (s) => s.sessionNumber === record.sessionNumber
  )!;

  const retakeSessionItemId = await createSessionItem({
    token: user.token,
    groupId: groups.session,
    program,
    session: sessionDef,
    date: retakeDate,
    attempt: record.attempt + 1,
    enrollmentItemId: stub.enrollmentItemId,
    traineeName: detail.enrollment.trainee,
    traineeEmail: detail.enrollment.traineeEmail ?? '',
    managerId: user.id,
    managerEmail: detail.enrollment.managerEmail ?? user.email,
    meetingTime: time,
    appBaseUrl,
  });

  const downstream = detail.sessions.filter(
    (s) =>
      s.sessionNumber > record.sessionNumber &&
      !s.locked &&
      s.meetingDate !== null
  );

  for (const s of downstream) {
    const shifted = addDays(s.meetingDate!, cadence);
    const shiftedUtc = wallClockToUtc(shifted, time, CALENDAR.timeZone);
    await updateColumnValues(user.token, SESSION_BOARD.id, s.itemId, {
      [S.meeting]: { date: shiftedUtc.date, time: shiftedUtc.time },
    });
  }

  await updateColumnValues(user.token, ENROLLMENT_BOARD.id, stub.enrollmentItemId, {
    [C.status]: { label: ENROLLMENT_STATUS.inProgress },
  });

  return {
    cleared: false,
    certified: false,
    retakeSessionItemId,
    retakeDate,
    retakeCalendarLink: googleCalendarLink({
      title: sessionTitle(
        detail.enrollment.trainee,
        sessionDef,
        record.attempt + 1
      ),
      description: sessionDescription(
        sessionDef,
        program,
        formUrlFor(appBaseUrl, retakeSessionItemId)
      ),
      date: retakeDate,
      time,
      durationMinutes: program.meetingDurationMinutes,
      timeZone: CALENDAR.timeZone,
      guestEmail: detail.enrollment.traineeEmail ?? undefined,
    }),
    shiftedSessions: downstream.length,
  };
}

export function assertManagerOwns(
  detail: EnrollmentDetail,
  user: SessionUser
): void {
  if (!detail.enrollment.managerIds.includes(user.id)) {
    const err = new Error('You are not the manager on this enrollment') as Error & {
      status?: number;
    };
    err.status = 403;
    throw err;
  }
}
