/**
 * Live monday.com identifiers.
 *
 * Column IDs in monday are immutable once created, so hardcoding them here is
 * safe and avoids a schema lookup on every request.
 *
 * NOTE ON CALENDAR: this app does NOT talk to the Google Calendar API. Frontline
 * has no Google Cloud project available.
 *
 * monday's Google Calendar *integration* is also unusable here: it is per-board
 * and writes only to the connecting user's primary calendar, so every manager's
 * 1:1s would land on one person's calendar. Scheduling is therefore split:
 *
 *   1. Each manager one-time syncs the Meeting column to their own Google
 *      Calendar ("items assigned to me", driven by the Manager people column).
 *      Gives them their own sessions, auto-updating on reschedule, no invites.
 *   2. The portal emits prefilled Add-to-Calendar links with the trainee as a
 *      guest, which is what actually invites the trainee.
 *
 * So the columns that matter to scheduling are: Meeting (date + time, UTC) and
 * Manager (drives "assigned to me").
 */

export const MONDAY_API_URL = 'https://api.monday.com/v2';
export const MONDAY_API_VERSION = '2024-10';

export const WORKSPACES = {
  service: '12317457',
  humanResources: '12329168',
} as const;

export const FOLDERS = {
  leadershipDevelopment: '21024474',
} as const;

/** Board holding one item per enrollment (manager + trainee pair). */
export const ENROLLMENT_BOARD = {
  id: '18424322234',
  url: 'https://frontlinepest-squad.monday.com/boards/18424322234',
  columns: {
    trainee: 'text_mm5q84zx',
    traineeEmail: 'email_mm5q8npe',
    manager: 'multiple_person_mm5qzjca',
    /** Confirmed by the manager at enrollment; reused for retakes. */
    managerEmail: 'email_mm5qkqt',
    office: 'text_mm5qdbcy',
    jobPosition: 'text_mm5qsnaj',
    hireDate: 'date_mm5qpse6',
    directoryItemId: 'text_mm5q5v41',
    program: 'text_mm5q41b9',
    status: 'color_mm5qzes6',
    progress: 'numeric_mm5q65a',
    startDate: 'date_mm5qr7f0',
    certifiedDate: 'date_mm5qpgba',
    meetingTime: 'text_mm5qcngy',
    sessions: 'board_relation_mm5qwcsk',
  },
} as const;

export const ENROLLMENT_STATUS = {
  notStarted: 'Not Started',
  inProgress: 'In Progress',
  certified: 'Certified',
  stalled: 'Stalled',
  withdrawn: 'Withdrawn',
} as const;

/**
 * Board holding one item per session.
 *
 * Deliberately a top-level board rather than subitems: monday's Google Calendar
 * integration is attached per-board via the Integrate button, and subitem boards
 * do not expose one.
 */
export const SESSION_BOARD = {
  id: '18424337663',
  url: 'https://frontlinepest-squad.monday.com/boards/18424337663',
  columns: {
    enrollment: 'board_relation_mm5qq26h',
    trainee: 'text_mm5qjg0w',
    traineeEmail: 'email_mm5q7prk',
    /** Drives the per-manager "items assigned to me" calendar sync. */
    manager: 'multiple_person_mm5q2fjn',
    /**
     * Zapier maps this to the Google Calendar attendee list. A people column
     * only exposes names through Zapier, so the email is stored explicitly.
     */
    managerEmail: 'email_mm5q9a73',
    /** Written back by Zapier so the reschedule Zap can update, not duplicate. */
    googleEventId: 'text_mm5qkwq8',
    program: 'text_mm5qzsyv',
    sessionNumber: 'numeric_mm5qm29',
    module: 'text_mm5qcawf',
    meeting: 'date_mm5qwaaj',
    eventDescription: 'long_text_mm5qk5a9',
    formLink: 'link_mm5qyqc8',
    blockRating: ['color_mm5q62g7', 'color_mm5q5n89', 'color_mm5q3skt'] as const,
    blockNotes: [
      'long_text_mm5qze8b',
      'long_text_mm5qy1gf',
      'long_text_mm5qtcr8',
    ] as const,
    /**
     * Sign-off criteria columns. A program uses the first N, where N is the
     * number of successCriteria its guides define (3 for 5 Levels, 4 for
     * 7 Habits). Unused columns are simply never written.
     */
    criterion: [
      'boolean_mm5q6tdj',
      'boolean_mm5qcvwb',
      'boolean_mm5qpx3j',
      'boolean_mm6jz74a',
    ] as const,
    outcome: 'color_mm5qne5f',
    followUp: 'long_text_mm5qg56g',
    signedBy: 'text_mm5qfcw7',
    signedAt: 'date_mm5q2m48',
    attempt: 'numeric_mm5qrhwj',
  },
} as const;

export const RATING_LABELS = [
  'Not demonstrated',
  'Emerging',
  'Demonstrated',
] as const;

export const OUTCOME = {
  pending: 'Pending',
  cleared: 'Cleared',
  notCleared: 'Not yet cleared',
} as const;

/** HR Employee Directory. READ ONLY — never write here. */
export const EMPLOYEE_DIRECTORY = {
  id: '18003250999',
  columns: {
    status: 'status',
    mondayProfile: 'multiple_person_mkx8z9sm',
    hireDate: 'date_1',
    manager: 'people',
    office: 'color_mkvyytff',
    department: 'dropdown_mkw2qnw8',
    team: 'dropdown_mkw272ag',
    jobPosition: 'color_mkw1131k',
    workEmail: 'email_mkwje773',
    personalEmail: 'email',
  },
  activeLabelId: 1,
} as const;

/**
 * The shared calendar the monday integration should be pointed at.
 * Informational only — the app never calls the Google API.
 */
export const CALENDAR = {
  id: 'c_a8f55acc59deb7181eb64e377973b87815c4572259d7d85a27d2f33b00a081a9@group.calendar.google.com',
  name: 'Frontline Leaders',
  timeZone: 'America/New_York',
} as const;

/** The maximum number of sign-off criteria the session board can store. */
export const MAX_CRITERIA = SESSION_BOARD.columns.criterion.length;

/**
 * monday group IDs per program. The two boards were seeded at different times,
 * so a program's group id is NOT the same on both — always look it up per
 * board rather than reusing one id.
 *
 * Add a row when a new book is onboarded.
 */
export const PROGRAM_GROUPS: Record<
  string,
  { enrollment: string; session: string }
> = {
  '5-levels-of-leadership': { enrollment: 'topics', session: 'topics' },
  '7-habits-of-highly-effective-people': {
    enrollment: 'group_mm6j38bv',
    session: 'group_mm6jwaj5',
  },
  'ideal-frontline-team-player': {
    enrollment: 'group_mm6jzh2',
    session: 'group_mm6jv486',
  },
};

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function adminUserIds(): string[] {
  return (process.env.ADMIN_MONDAY_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
