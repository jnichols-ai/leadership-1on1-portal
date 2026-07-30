import {
  MONDAY_API_URL,
  MONDAY_API_VERSION,
  EMPLOYEE_DIRECTORY,
  ENROLLMENT_BOARD,
  SESSION_BOARD,
  RATING_LABELS,
} from './config';
import type {
  DirectoryEmployee,
  EnrollmentSummary,
  SessionRecord,
} from './types';

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

/** Minimal monday GraphQL client. */
export async function mondayQuery<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      'API-Version': MONDAY_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`monday API HTTP ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors?.length) {
    throw new Error(
      `monday API error: ${body.errors.map((e) => e.message).join('; ')}`
    );
  }
  if (!body.data) throw new Error('monday API returned no data');
  return body.data;
}

// ---------------------------------------------------------------------------
// Column value helpers
// ---------------------------------------------------------------------------

/**
 * `linked_item_ids` is only present on BoardRelationValue columns. It must be
 * read via the typed fragment: monday returns `value` and `text` as null for
 * connect-boards columns from API version 2025-04 onward, so parsing `value`
 * is not safe.
 */
type RawColumn = {
  id: string;
  text: string | null;
  value: string | null;
  linked_item_ids?: string[] | null;
};

/** GraphQL selection set for column values, including board relations. */
const COLUMN_VALUE_FIELDS = `
  id
  text
  value
  ... on BoardRelationValue { linked_item_ids }
`;

function columnMap(columns: RawColumn[]): Map<string, RawColumn> {
  return new Map(columns.map((c) => [c.id, c]));
}

function text(cols: Map<string, RawColumn>, id: string): string | null {
  const v = cols.get(id)?.text;
  return v && v.length > 0 ? v : null;
}

function num(cols: Map<string, RawColumn>, id: string): number | null {
  const v = text(cols, id);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(cols: Map<string, RawColumn>, id: string): boolean {
  const raw = cols.get(id)?.value;
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.checked === 'true' || parsed?.checked === true;
  } catch {
    return false;
  }
}

function ratingIndex(
  cols: Map<string, RawColumn>,
  id: string,
  labels: readonly string[]
): number | null {
  const v = text(cols, id);
  if (v === null) return null;
  const idx = labels.indexOf(v);
  return idx >= 0 ? idx : null;
}

function peopleIds(cols: Map<string, RawColumn>, id: string): string[] {
  const raw = cols.get(id)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as {
      personsAndTeams?: { id: number | string }[];
    };
    return (parsed.personsAndTeams ?? []).map((p) => String(p.id));
  } catch {
    return [];
  }
}

/**
 * The Meeting column's `text` renders as "YYYY-MM-DD HH:mm" in the account's
 * timezone. Splits it back into date and time parts for display.
 */
function dateTimeParts(
  cols: Map<string, RawColumn>,
  id: string
): { date: string | null; time: string | null } {
  const v = text(cols, id);
  if (!v) return { date: null, time: null };
  const [d, t] = v.split(' ');
  return { date: d ?? null, time: t ?? null };
}

// ---------------------------------------------------------------------------
// Employee Directory — READ ONLY
// ---------------------------------------------------------------------------

/**
 * Normalizes "Lastname, Firstname" (legacy bulk import) to "Firstname Lastname".
 * The directory contains both conventions.
 */
export function normalizeName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.includes(',')) return trimmed;
  const [last, rest] = trimmed.split(',', 2);
  return `${rest.trim()} ${last.trim()}`.trim();
}

const DIRECTORY_QUERY = `
  query DirectReports($boardId: ID!, $columnIds: [String!]) {
    boards(ids: [$boardId]) {
      items_page(limit: 500) {
        items {
          id
          name
          column_values(ids: $columnIds) { ${COLUMN_VALUE_FIELDS} }
        }
      }
    }
  }
`;

/**
 * Active employees whose Manager column contains the given monday user.
 *
 * The Manager column stores monday user IDs and the authenticated user's ID
 * comes straight from OAuth, so this is an exact match rather than a name
 * comparison — which sidesteps the directory's inconsistent name formatting.
 */
export async function getDirectReports(
  token: string,
  managerUserId: string
): Promise<DirectoryEmployee[]> {
  const cols = Object.values(EMPLOYEE_DIRECTORY.columns);
  const data = await mondayQuery<{
    boards: {
      items_page: {
        items: { id: string; name: string; column_values: RawColumn[] }[];
      };
    }[];
  }>(token, DIRECTORY_QUERY, {
    boardId: EMPLOYEE_DIRECTORY.id,
    columnIds: cols,
  });

  const items = data.boards[0]?.items_page.items ?? [];

  return items
    .filter((item) => {
      const map = columnMap(item.column_values);
      if (text(map, EMPLOYEE_DIRECTORY.columns.status) !== 'Active') return false;
      return peopleIds(map, EMPLOYEE_DIRECTORY.columns.manager).includes(
        String(managerUserId)
      );
    })
    .map((item) => {
      const map = columnMap(item.column_values);
      return {
        itemId: item.id,
        name: item.name,
        displayName: normalizeName(item.name),
        workEmail: text(map, EMPLOYEE_DIRECTORY.columns.workEmail),
        personalEmail: text(map, EMPLOYEE_DIRECTORY.columns.personalEmail),
        office: text(map, EMPLOYEE_DIRECTORY.columns.office),
        jobPosition: text(map, EMPLOYEE_DIRECTORY.columns.jobPosition),
        hireDate: text(map, EMPLOYEE_DIRECTORY.columns.hireDate),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Looks up the authenticated manager's own directory record (for their office). */
export async function getOwnDirectoryRecord(
  token: string,
  userId: string
): Promise<DirectoryEmployee | null> {
  const cols = Object.values(EMPLOYEE_DIRECTORY.columns);
  const data = await mondayQuery<{
    boards: {
      items_page: {
        items: { id: string; name: string; column_values: RawColumn[] }[];
      };
    }[];
  }>(token, DIRECTORY_QUERY, {
    boardId: EMPLOYEE_DIRECTORY.id,
    columnIds: cols,
  });

  const items = data.boards[0]?.items_page.items ?? [];
  const match = items.find((item) =>
    peopleIds(
      columnMap(item.column_values),
      EMPLOYEE_DIRECTORY.columns.mondayProfile
    ).includes(String(userId))
  );
  if (!match) return null;

  const map = columnMap(match.column_values);
  return {
    itemId: match.id,
    name: match.name,
    displayName: normalizeName(match.name),
    workEmail: text(map, EMPLOYEE_DIRECTORY.columns.workEmail),
    personalEmail: text(map, EMPLOYEE_DIRECTORY.columns.personalEmail),
    office: text(map, EMPLOYEE_DIRECTORY.columns.office),
    jobPosition: text(map, EMPLOYEE_DIRECTORY.columns.jobPosition),
    hireDate: text(map, EMPLOYEE_DIRECTORY.columns.hireDate),
  };
}

// ---------------------------------------------------------------------------
// Generic writes
// ---------------------------------------------------------------------------

export async function createItem(
  token: string,
  boardId: string,
  groupId: string,
  itemName: string,
  columnValues: Record<string, unknown>
): Promise<string> {
  const data = await mondayQuery<{ create_item: { id: string } }>(
    token,
    `mutation Create($boardId: ID!, $groupId: String!, $itemName: String!, $values: JSON!) {
       create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $values, create_labels_if_missing: false) { id }
     }`,
    { boardId, groupId, itemName, values: JSON.stringify(columnValues) }
  );
  return data.create_item.id;
}

export async function updateColumnValues(
  token: string,
  boardId: string,
  itemId: string,
  columnValues: Record<string, unknown>
): Promise<void> {
  await mondayQuery(
    token,
    `mutation Update($boardId: ID!, $itemId: ID!, $values: JSON!) {
       change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $values, create_labels_if_missing: false) { id }
     }`,
    { boardId, itemId, values: JSON.stringify(columnValues) }
  );
}

// ---------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------

const ENROLLMENTS_QUERY = `
  query Enrollments($boardId: ID!) {
    boards(ids: [$boardId]) {
      items_page(limit: 500) {
        items { id name column_values { ${COLUMN_VALUE_FIELDS} } }
      }
    }
  }
`;

function toEnrollment(item: {
  id: string;
  name: string;
  column_values: RawColumn[];
}): EnrollmentSummary & { managerIds: string[] } {
  const map = columnMap(item.column_values);
  const C = ENROLLMENT_BOARD.columns;
  return {
    itemId: item.id,
    name: item.name,
    trainee: text(map, C.trainee) ?? item.name,
    traineeEmail: text(map, C.traineeEmail),
    managerEmail: text(map, C.managerEmail),
    office: text(map, C.office),
    program: text(map, C.program) ?? '',
    status: text(map, C.status) ?? 'Not Started',
    progress: num(map, C.progress) ?? 0,
    startDate: text(map, C.startDate),
    certifiedDate: text(map, C.certifiedDate),
    meetingTime: text(map, C.meetingTime),
    managerIds: peopleIds(map, C.manager),
  };
}

export async function listEnrollments(
  token: string,
  managerUserId: string | null
): Promise<(EnrollmentSummary & { managerIds: string[] })[]> {
  const data = await mondayQuery<{
    boards: {
      items_page: {
        items: { id: string; name: string; column_values: RawColumn[] }[];
      };
    }[];
  }>(token, ENROLLMENTS_QUERY, { boardId: ENROLLMENT_BOARD.id });

  return (data.boards[0]?.items_page.items ?? [])
    .map(toEnrollment)
    .filter(
      (e) => managerUserId === null || e.managerIds.includes(String(managerUserId))
    );
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function toSessionRecord(item: {
  id: string;
  name: string;
  column_values: RawColumn[];
}): SessionRecord {
  const sm = columnMap(item.column_values);
  const S = SESSION_BOARD.columns;
  const signedAt = text(sm, S.signedAt);
  const meeting = dateTimeParts(sm, S.meeting);

  return {
    itemId: item.id,
    name: item.name,
    // Read the relation from linked_item_ids, not `value` — monday returns null
    // for `value` on connect-boards columns in current API versions.
    enrollmentItemId: String(sm.get(S.enrollment)?.linked_item_ids?.[0] ?? ''),
    sessionNumber: num(sm, S.sessionNumber) ?? 0,
    module: text(sm, S.module) ?? item.name,
    meetingDate: meeting.date,
    meetingTime: meeting.time,
    attempt: num(sm, S.attempt) ?? 1,
    blockRatings: S.blockRating.map((id) => ratingIndex(sm, id, RATING_LABELS)),
    blockNotes: S.blockNotes.map((id) => text(sm, id) ?? ''),
    criteria: S.criterion.map((id) => bool(sm, id)),
    outcome: text(sm, S.outcome) ?? 'Pending',
    followUp: text(sm, S.followUp) ?? '',
    signedBy: text(sm, S.signedBy),
    signedAt,
    locked: signedAt !== null,
  };
}

const SESSION_BY_ID_QUERY = `
  query SessionById($itemId: ID!) {
    items(ids: [$itemId]) { id name column_values { ${COLUMN_VALUE_FIELDS} } }
  }
`;

export async function getSessionRecord(
  token: string,
  sessionItemId: string
): Promise<SessionRecord> {
  const data = await mondayQuery<{
    items: { id: string; name: string; column_values: RawColumn[] }[];
  }>(token, SESSION_BY_ID_QUERY, { itemId: sessionItemId });

  const item = data.items[0];
  if (!item) throw new Error(`Session ${sessionItemId} not found`);
  return toSessionRecord(item);
}

const ENROLLMENT_WITH_SESSIONS_QUERY = `
  query EnrollmentDetail($itemId: ID!, $sessionBoardId: ID!) {
    items(ids: [$itemId]) { id name column_values { ${COLUMN_VALUE_FIELDS} } }
    boards(ids: [$sessionBoardId]) {
      items_page(limit: 500) {
        items { id name column_values { ${COLUMN_VALUE_FIELDS} } }
      }
    }
  }
`;

export interface EnrollmentDetail {
  enrollment: EnrollmentSummary & { managerIds: string[] };
  sessions: SessionRecord[];
}

export async function getEnrollmentDetail(
  token: string,
  enrollmentItemId: string
): Promise<EnrollmentDetail> {
  const data = await mondayQuery<{
    items: { id: string; name: string; column_values: RawColumn[] }[];
    boards: {
      items_page: {
        items: { id: string; name: string; column_values: RawColumn[] }[];
      };
    }[];
  }>(token, ENROLLMENT_WITH_SESSIONS_QUERY, {
    itemId: enrollmentItemId,
    sessionBoardId: SESSION_BOARD.id,
  });

  const item = data.items[0];
  if (!item) throw new Error(`Enrollment ${enrollmentItemId} not found`);

  const sessions = (data.boards[0]?.items_page.items ?? [])
    .map(toSessionRecord)
    .filter((s) => s.enrollmentItemId === String(enrollmentItemId))
    .sort((a, b) =>
      a.sessionNumber === b.sessionNumber
        ? a.attempt - b.attempt
        : a.sessionNumber - b.sessionNumber
    );

  return { enrollment: toEnrollment(item), sessions };
}
