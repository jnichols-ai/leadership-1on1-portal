# Leadership 1:1 Portal

Supervisor-led 1:1 leadership certification for Frontline Pest. A manager starts
a certification, six weekly sessions are created, and each week the manager works
through the discussion guide and signs off. All records live in monday.com.

- **Stack:** Next.js 14 (App Router) · TypeScript · Vercel
- **Data:** monday.com
- **Auth:** monday OAuth
- **Scheduling:** monday.com's Google Calendar integration — **no Google Cloud
  project, no service account, no Google API calls from this app**

---

## How it works

1. Manager signs in with monday OAuth.
2. The portal reads the HR **Employee Directory** and shows only that manager's
   Active direct reports.
3. Manager confirms the trainee's email, picks a weekly time, and submits.
4. The portal creates one enrollment item plus six session items in monday.
5. monday's Google Calendar integration turns those session items into calendar
   events.
6. Each week the manager opens the session form, records notes and an assessment
   per discussion block, checks the three success criteria, and signs off.
   Signing locks the record.
7. **Cleared** → next session unlocks. **Not cleared** → the same module is
   rescheduled a week later as a new attempt and every remaining session shifts
   out by a week.

### Why scheduling works this way

The original design called the Google Calendar API with a service account.
Frontline has no Google Cloud Console access, and every path to that API requires
a Cloud project. So the app instead writes the columns monday's own Google
Calendar integration reads, and that integration — authorized once inside
monday's UI — creates the events.

Consequence: **sessions are items on their own board, not subitems.** monday's
Integrate button is per-board and subitem boards do not have one.

As a backup, the portal also generates prefilled "Add to Google Calendar" links
after enrollment, so a manager can add the meetings and invite the trainee
manually if the integration cannot reach non-monday users.

---

## Setup

### 1. monday OAuth app

monday → **Developers → Build App → OAuth**.

- Redirect URI: `<APP_BASE_URL>/api/auth/callback`
- Scopes: `me:read boards:read boards:write`

### 2. Environment

Copy `.env.example` to `.env.local` and fill it in. Generate the session secret
with `openssl rand -base64 32`.

### 3. monday Google Calendar integration

Open the **Leadership 1:1 Sessions** board → **Integrate** → Google Calendar →
add a "create an event when an item is created" style recipe and map:

| Google field | monday column |
|---|---|
| Title | Item name |
| Start / End time | **Meeting** |
| Attendees | **Trainee Email**, **Manager**, or **Attendees** — whichever the recipe accepts |
| Description | **Event Description** |

Three candidate attendee columns exist on purpose, because monday's docs do not
specify which type the Attendees field accepts and only ~5% of the employee
directory are monday users.

### 4. Run / deploy

```bash
npm install
npm run dev
```

Deploy to Vercel, set the same env vars, point `APP_BASE_URL` at the production
URL, and update the monday OAuth redirect URI to match.

---

## monday structure

Service workspace (`12317457`) → **Leadership Development** folder.

| Board | ID | Purpose |
|---|---|---|
| Leadership Development 1:1s | `18424322234` | One item per enrollment |
| Leadership 1:1 Sessions | `18424337663` | One item per session; calendar integration attaches here |

Linked by board-relation columns in both directions. Groups separate programs —
note that a program's group ID is **not** the same on both boards, because the
two boards were seeded at different times. `PROGRAM_GROUPS` in `lib/config.ts`
stores one id per board per program; never reuse one for the other board.

| Program | Enrollment board group | Session board group |
|---|---|---|
| How Successful People Lead | `topics` | `topics` |
| 7 Habits of Highly Effective People | `group_mm6j38bv` | `group_mm6jwaj5` |
| The Ideal Frontline Team Player | `group_mm6jzh2` | `group_mm6jv486` |

The **Employee Directory** (`18003250999`, HR workspace) is **read-only** — the
app never writes to it.

### Timezone handling

monday stores date-column times in **UTC** and renders them in the account's
timezone. Every write to the Meeting column goes through `wallClockToUtc()` in
`lib/scheduling.ts`, which resolves the IANA offset twice to stay correct across
DST boundaries. Writing a raw wall-clock string would shift every meeting by
4–5 hours.

### Data quality note

~25% of directory records have a work email and ~5% have Monday Profile set. The
app works around this: manager identity comes from OAuth, and the trainee's email
is confirmed by the manager at enrollment and stored on the enrollment record.

---

## Programs

| Program | Sessions | Criteria per session | Source |
|---|---|---|---|
| How Successful People Lead | 6 | 3 | John C. Maxwell |
| The 7 Habits of Highly Effective People | 9 | 4 | Stephen R. Covey |
| The Ideal Frontline Team Player | 4 | 4 | Patrick Lencioni |

The manager picks the program at enrollment; the tracks are entirely separate
enrollments and never mix.

Note: How Successful People Lead keeps the internal id `5-levels-of-leadership`
(and its file name). The id is saved on every enrollment in monday, so it must
not change; only the display names did.

7 Habits and Ideal Team Player sessions also carry a `sourceMaterial` block — the SKOOL lesson the
trainee prepared from (preparation, case study, application activity, key
takeaways) plus the reference article where one exists. It renders as a
collapsed "What the trainee prepared" panel above the discussion blocks, so the
manager never has to leave the portal to look something up. The field is
optional; How Successful People Lead omits it. Only 7 Habits has reference articles, and only for
lessons 4-8 — `reference` is `null` everywhere else, by design.

## Adding another book

1. Add `programs/<your-book>.json` matching the shape of an existing program.
   Each session needs exactly **3 blocks** (three Block Rating / Block Notes
   column pairs exist on the board) and a **consistent number of success
   criteria**, at most `MAX_CRITERIA`. `lib/programs.ts` validates both at
   startup. Programs may differ from each other in criterion count.
2. Import it in `lib/programs.ts` and add it to `REGISTRY`.
3. Create a group on **both** boards and add both ids to `PROGRAM_GROUPS` in
   `lib/config.ts` — they will not match.

No schema changes, no UI changes. monday columns are deliberately generic
(`Criterion 1..4`, `Block 1/2/3 Notes`); the human-readable label comes from the
JSON at render time.

If a new book needs more criteria than the board has checkbox columns, add a
`Criterion N` checkbox column in monday and append its id to
`SESSION_BOARD.columns.criterion`. Everything downstream (form, validation,
write path) sizes itself off that array and the program's own criterion count.

---

## Security notes

- The calendar's **secret iCal address must never be committed**. It is a
  read-only feed granting full read access to anyone holding it. The app does not
  use it at all.
- Session cookies are HTTP-only, `SameSite=Lax`, signed, 8-hour expiry.
- Every write re-verifies server-side that the caller is the manager on that
  enrollment. Client-supplied employee data is never trusted — the trainee is
  re-resolved from the directory on submit.
- Signed sessions are immutable; the API rejects edits to a locked record.
- **Open item:** both boards are `permissions: everyone` inside an open
  workspace, so all 41 account members can read every trainee's assessment.
  Consider restricting to owners.

---

## Assumptions

- Manager and trainee share a timezone. `crossTimezoneWarning()` exists to flag
  mismatched pairings but is not wired into the enrollment UI.
- The trainee never logs in. Their coursework happens in Skool; this portal is
  the supervisor's guide and sign-off only.
