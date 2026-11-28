# FADEC

FADEC is a pilot-training academy platform in active development. It has
three surfaces in one Vite app served by one Cloudflare Worker:

| Surface | Routes | State |
| --- | --- | --- |
| Public marketing site | `/`, `/programmes`, `/admissions`, `/apply`, `/events`, `/subjects`, `/styleguide` | Built. Content is static (`src/content.ts`); forms validate on the server but **nothing is stored** |
| Teaching studio | `/teach/*` | Courses' curricula, subjects, lectures, assignments, marking and quizzes run on D1. Live classes, attendance, students, announcements, analytics and settings are placeholder screens |
| Student portal | `/learn/*` | Assignments (text hand-in, returned marks) and quizzes run on D1. No lecture viewing, file upload or progress yet |

It is a **prototype**: sign-in is demo-only, there is one academy (no
tenancy), no media storage, and nothing is deployed. See
[Known limitations](#known-limitations) before showing it to anyone outside
the team.

Product context lives in `docs/product/`: the Master PRD
(`FADEC_MASTER_PRD.md`, the target product) and the Current Implementation
PRD (`FADEC_CURRENT_IMPLEMENTATION_PRD.docx`, with a `.pdf` reading copy,
which records what was built before M0). The working rules for contributors
are in `CLAUDE.md`.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, React Router 8 (declarative routes), Tailwind CSS 4, Motion, Lucide icons |
| Build | Vite 8 with `@cloudflare/vite-plugin` (runs the Worker in workerd during `dev`) |
| API | Hono 4 on Cloudflare Workers (`src/worker/index.ts`) |
| Database | Cloudflare D1 (SQLite), one binding: `DB` |
| Language / tooling | TypeScript 5.9 (strict), Bun, Vitest, GitHub Actions |

## Layout

```
src/
  contracts/      DTOs shared by the Worker and the React app (write new fields here first)
  worker/         Hono app, signed session cookies, error helpers
  teacher/        D1 schema (db.ts), seeds, and the stores that hold the business logic:
                  courses, curriculum, lectures, subjects, assignments, quizzes,
                  student-assignments, student-quizzes, dashboard
  shared/         validation shared by the public forms and the Worker
  lib/            browser API clients and the localStorage store
  components/     design system used by every surface
  pages/          public marketing site (+ the legacy demo /dashboard)
  teacher/pages/  teaching studio screens
  learn/pages/    student portal screens
test/             Vitest suites that call the Worker against an in-memory D1
docs/product/     Master PRD and Current Implementation PRD (.docx + .pdf)
```

Requests under `/api/*` reach Hono; every other path is served from the built
assets as a single-page app.

## Setup

Requirements: [Bun](https://bun.sh) 1.4+ and Node 22 (Wrangler and Vitest run on Node).

```sh
bun install
cp .dev.vars.example .dev.vars   # local session secrets, never committed
bun run dev                      # Vite + the Worker in workerd, http://localhost:5331
```

| Command | What it does |
| --- | --- |
| `bun run dev` | Dev server with the Worker and a local D1 |
| `bun run build` | `dist/client` (assets) and `dist/fadec/index.js` (Worker) |
| `bun run typecheck` | `tsc --noEmit` over `src`, `test` and the configs |
| `bun run test` | Vitest, once |
| `bun run test:watch` | Vitest in watch mode |

### Environment variables

| Name | Used by | Where it is set |
| --- | --- | --- |
| `STUDENT_SESSION_SECRET` | HMAC key for the `fadec_student` cookie (`/api/student/*`) | `.dev.vars` locally; `wrangler secret put` in production |
| `TEACHER_SESSION_SECRET` | HMAC key for the `fadec_teacher` cookie (`/api/teacher/*`) | `.dev.vars` locally; `wrangler secret put` in production |

Use a different long random value for each. A deployment missing one answers
that portal's sign-in with **503** instead of signing with a guessable key.
Changing a secret signs everyone out of that portal. Secrets never go in
`wrangler.jsonc` or the repository.

The only binding is the D1 database `DB` declared in `wrangler.jsonc`.

### Demo accounts

The seed creates these (credentials are public, so a deployed copy must not
keep them):

| Role | Email | ID |
| --- | --- | --- |
| Teacher | `naveen.rao@fadec.example` | `TCH-2011-004` |
| Teacher | `tomas.rehn@fadec.example` | `TCH-2015-011` (MCC course only) |
| Student | `priya.nair@fadec.example` | `PPL-26-00001` (has a returned mark) |
| Student | `maya.okafor@fadec.example` | `PPL-26-00003` (draft mark the portal must withhold) |

## Data (D1)

- `src/teacher/db.ts` holds the schema (21 tables) and creates it on the first
  `/api` request each Worker isolate serves, then applies a short list of
  idempotent `ALTER` / `CREATE INDEX` migrations. There is no
  `wrangler d1 migrations` history yet.
- Seeds (`seeds.ts`, `assessment-seed.ts`, `student-seed.ts`) run once per
  database behind version markers in the `meta` table, with fixed ids and
  `INSERT OR IGNORE`, so a retry is harmless and a row a teacher deletes is not
  resurrected. They run in **every** environment today.
- Local data persists under `.wrangler/state/v3/d1`. Delete that directory (with
  the dev server stopped) to start from a clean seed.
- The five sample subjects (Meteorology, General Navigation, Radio Navigation,
  Instrument Navigation, Air Regulation) are seed rows for exercising the
  workflow, not an official syllabus.

## API

All responses are JSON. Student responses are `cache-control: no-store`.

| Prefix | Routes | Auth |
| --- | --- | --- |
| `/api/health`, `/api/programmes`, `/api/events`, `/api/subjects[/:id]` | read-only | none |
| `/api/applications`, `/api/rsvp`, `/api/subscribe`, `/api/signin` | validate and return a reference; **store nothing** | none |
| `/api/teacher/*` | session, dashboard, courses and curriculum, lectures and resources, subjects and syllabus, assignments, submissions and marking, quizzes, questions and quiz marking | signed `fadec_teacher` cookie |
| `/api/student/*` | session, assignments and attempts, quizzes and quiz attempts | signed `fadec_student` cookie |

### Errors

Every failure answers `{ "error": "<sentence>", "fieldErrors"?: { … } }`
(see `src/worker/errors.ts`). Some routes add detail beside these keys, such as
a publish checklist.

| Status | Meaning |
| --- | --- |
| 400 | The body is not a JSON object |
| 401 | No valid session for this workspace |
| 404 | Missing **or someone else's**. The two are never told apart |
| 409 | Conflicts with the resource's state (already submitted, locked, closed) |
| 422 | A field is wrong; `fieldErrors` names it |
| 500 | Unexpected failure. The cause is logged in the Worker, never returned |
| 503 | Storage or a required secret is unavailable |

## Tests and CI

```sh
bun run test
```

The suites in `test/` call the Hono app directly with a D1 binding from
Wrangler's platform proxy (Miniflare, in memory, nothing written to
`.wrangler/`), so they run the real SQL and the real seed. They cover the
public routes, both signed sessions (including forged and cross-portal
cookies), ownership scoping, curriculum, assignments and marking, the student
hand-in, quizzes end to end (authoring, scoring, marking, deadlines, release
rules), error handling and the studio's figures.

`.github/workflows/ci.yml` runs typecheck, build and tests on pushes to `main`
and on pull requests.

## Deployment

Nothing is deployed. Before a first deploy:

1. `npx wrangler d1 create fadec-teacher` and put the real id in
   `wrangler.jsonc` (the committed `database_id` is a placeholder).
2. `npx wrangler secret put STUDENT_SESSION_SECRET` and
   `npx wrangler secret put TEACHER_SESSION_SECRET`.
3. Decide what happens to the demo seed (see limitations), then
   `bun run build` and deploy. `deploy.json` describes the build output for
   Freebuff Sites.

## Known limitations

**Authentication is demo-only.** Both portals sign in with an email plus an ID
(teacher ID or student number), with no password. The session cookies are
HMAC-signed, so a client cannot forge or edit one, but knowing the two values
is enough to sign in as that person, and the demo values are public. There is
no rate limiting, no server-side session store (signing out clears the cookie
but cannot revoke a stolen one before its 12-hour expiry), no registration,
invites or password reset. Teacher accounts are read from the seed list in
code, not from D1. This is **not production authentication**.

Also:

- **Single academy.** No tenant column anywhere; no academy admin role or screens.
- **No media storage.** Lecture resources are links only; assignments take text
  only. Seeded video lectures show a `READY` video state and an asset id even
  though no video was ever uploaded; that is seed data the media pipeline will
  replace.
- **No learner progress.** Lecture watch statistics, course completion and
  "at-risk" students are reported as *not tracked yet* rather than estimated.
- **Teachers cannot create, edit or delete courses**, and subjects, assignments
  and quizzes cannot be deleted. Enrolment exists only in the seed.
- **Public forms store nothing.** Applications, RSVPs and newsletter sign-ups
  are validated and answered with a reference, then dropped.
- **Two student identities.** The legacy `/dashboard` hub is a localStorage demo
  with sample data (labelled as such), separate from the real `/learn` portal.
- **Placeholders.** Live classes, attendance, students, announcements, analytics
  and settings in the studio are honest "not built yet" screens.
- **Operations.** Schema bootstrap at request time, no migration history, seeds
  in every environment, no backups, alerting or security headers.
