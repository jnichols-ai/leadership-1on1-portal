/**
 * Date and time helpers.
 *
 * Assumption: manager and trainee share a timezone, so the portal collects one
 * wall-clock time and treats it as local to the calendar's zone.
 *
 * IMPORTANT: monday stores date-column times in UTC and renders them in the
 * account's timezone. Writing "09:00" naively produces a 5:00am meeting in
 * summer. Everything written to the Meeting column must go through
 * wallClockToUtc().
 */

export type IsoDate = string;

export function toIsoDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function parseIsoDate(s: IsoDate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** "Starting the following week", relative to `from`. */
export function firstSessionDate(from: Date, startOffsetDays: number): IsoDate {
  return addDays(toIsoDate(from), startOffsetDays);
}

export function buildSchedule(
  startDate: IsoDate,
  sessionCount: number,
  cadenceDays: number
): IsoDate[] {
  return Array.from({ length: sessionCount }, (_, i) =>
    addDays(startDate, i * cadenceDays)
  );
}

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Returns the offset in minutes between `timeZone` and UTC at a given instant.
 * Positive means ahead of UTC.
 */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  // Intl renders hour 24 for midnight in some environments.
  const hour = get('hour') % 24;

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second')
  );

  return (asUtc - instant.getTime()) / 60000;
}

/**
 * Converts a wall-clock date + HH:mm in `timeZone` into the UTC date and time
 * monday expects.
 *
 * Handles DST by resolving the offset twice: once with a naive guess, then
 * again at the corrected instant, which fixes dates near a transition.
 */
export function wallClockToUtc(
  date: IsoDate,
  time: string,
  timeZone: string
): { date: IsoDate; time: string } {
  const [hh, mm] = time.split(':').map(Number);
  // Date.UTC takes a 0-indexed month — parseIsoDate already handles that.
  const naive = new Date(
    parseIsoDate(date).getTime() + (hh * 60 + mm) * 60000
  );

  let offset = zoneOffsetMinutes(naive, timeZone);
  let actual = new Date(naive.getTime() - offset * 60000);

  const secondOffset = zoneOffsetMinutes(actual, timeZone);
  if (secondOffset !== offset) {
    offset = secondOffset;
    actual = new Date(naive.getTime() - offset * 60000);
  }

  return {
    date: actual.toISOString().slice(0, 10),
    time: actual.toISOString().slice(11, 19),
  };
}

/** Formats a wall-clock time for display, e.g. "9:00 AM". */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Office → IANA timezone. Used to warn when a manager and trainee are in
 * different zones, which breaks the single-timezone assumption above.
 */
const OFFICE_TIMEZONES: Record<string, string> = {
  Bowie: 'America/New_York',
  Baltimore: 'America/New_York',
  Dover: 'America/New_York',
  Manassas: 'America/New_York',
  Martinsburg: 'America/New_York',
  Waldorf: 'America/New_York',
  Bridgeville: 'America/New_York',
  Crozet: 'America/New_York',
  Richmond: 'America/New_York',
  Nashville: 'America/Chicago',
  Utah: 'America/Denver',
};

export function officeTimezone(office: string | null): string | null {
  if (!office) return null;
  return OFFICE_TIMEZONES[office] ?? null;
}

export function crossTimezoneWarning(
  managerOffice: string | null,
  traineeOffice: string | null
): string | null {
  const a = officeTimezone(managerOffice);
  const b = officeTimezone(traineeOffice);
  if (!a || !b || a === b) return null;
  return `${managerOffice} (${a}) and ${traineeOffice} (${b}) are in different timezones. The time you pick is saved in ${a}, so it lands at a different local time for the trainee.`;
}

/**
 * Builds a prefilled Google Calendar "add event" URL.
 *
 * Backup path: if monday's integration cannot add the trainee as an attendee,
 * the portal surfaces these links so the manager can add the meetings (and
 * invite the trainee) in two clicks each.
 */
export function googleCalendarLink(params: {
  title: string;
  description: string;
  date: IsoDate;
  time: string;
  durationMinutes: number;
  timeZone: string;
  guestEmail?: string;
}): string {
  const compact = (d: IsoDate, t: string) =>
    `${d.replace(/-/g, '')}T${t.replace(/:/g, '')}00`;

  const end = addMinutes(params.time, params.durationMinutes);

  const qs = new URLSearchParams({
    action: 'TEMPLATE',
    text: params.title,
    details: params.description,
    dates: `${compact(params.date, params.time)}/${compact(params.date, end)}`,
    ctz: params.timeZone,
  });

  if (params.guestEmail) qs.set('add', params.guestEmail);

  return `https://calendar.google.com/calendar/render?${qs.toString()}`;
}
