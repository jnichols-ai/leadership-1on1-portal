/** Shared domain types. */

export type PromptType =
  | 'probe'
  | 'coachable_moment'
  | 'share_your_experience'
  | 'your_role';

export interface Prompt {
  type: PromptType;
  text: string;
}

export interface Block {
  id: string;
  title: string;
  context: string | null;
  whatToLookFor: string;
  prompts: Prompt[];
}

export interface ProgramSession {
  sessionNumber: number;
  code: string;
  sourceFile: string;
  moduleLabel: string;
  title: string;
  level: string;
  prepMinutes: number;
  purpose: string;
  coreConcept: string;
  supervisorTip: string | null;
  isFinalSession?: boolean;
  blocks: Block[];
  gateLabel: string;
  successCriteria: string[];
  nextStep: string;
}

export interface Program {
  programId: string;
  programName: string;
  sourceAuthor: string;
  description: string;
  sessionCount: number;
  cadenceDays: number;
  startOffsetDays: number;
  meetingDurationMinutes: number;
  awardsCertification: boolean;
  certificationName: string;
  mondayGroupTitle: string;
  ratingScale: { value: number; label: string }[];
  sessions: ProgramSession[];
}

/** The authenticated manager, derived from the monday OAuth token. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  token: string;
}

/** A candidate trainee read from the Employee Directory. */
export interface DirectoryEmployee {
  itemId: string;
  name: string;
  displayName: string;
  workEmail: string | null;
  personalEmail: string | null;
  office: string | null;
  jobPosition: string | null;
  hireDate: string | null;
}

export interface EnrollmentSummary {
  itemId: string;
  name: string;
  trainee: string;
  traineeEmail: string | null;
  managerEmail: string | null;
  office: string | null;
  program: string;
  status: string;
  progress: number;
  startDate: string | null;
  certifiedDate: string | null;
  /** Wall-clock HH:mm in the calendar's timezone. */
  meetingTime: string | null;
}

export interface SessionRecord {
  itemId: string;
  name: string;
  enrollmentItemId: string;
  sessionNumber: number;
  module: string;
  /** Rendered in the monday account's timezone. */
  meetingDate: string | null;
  meetingTime: string | null;
  attempt: number;
  blockRatings: (number | null)[];
  blockNotes: string[];
  criteria: boolean[];
  outcome: string;
  followUp: string;
  signedBy: string | null;
  signedAt: string | null;
  /** Derived: a signed record is immutable. */
  locked: boolean;
}

export interface SubmitSessionPayload {
  blockRatings: number[];
  blockNotes: string[];
  criteria: boolean[];
  followUp: string;
  meetingDate: string;
}

/** A prefilled Google Calendar link, used as the manual scheduling backup. */
export interface CalendarLink {
  sessionNumber: number;
  title: string;
  date: string;
  url: string;
}
