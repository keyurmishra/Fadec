# Brightpath Academy: online school template

A dark, playful site for an online school that runs live, cohort-based
degrees, diplomas and certificates. Glossy 3D shapes drift over a dot-grid
blackboard, the headline carries hand-drawn marks, and a floating pill nav
sits at the bottom of the screen.

Screens:

| Route | What it is |
| --- | --- |
| `/` | Hero, intake stats, how a cohort works, featured programmes, a sample timetable, student voices, admissions steps, upcoming events |
| `/programmes` | Programme finder: search (titles and modules), award, school, study mode, shortlist, sort; filters live in the URL |
| `/programmes/:slug` | Programme detail: overview, outcomes, curriculum by year, intakes with seats left, fees calculator (plan and scholarship), entry requirements, programme lead |
| `/admissions` | Steps, upcoming deadlines table, requirements, fees and funding (`#fees`), FAQ |
| `/apply` | Five-step application with a draft saved as you type, per-step validation, review and submit |
| `/dashboard` | Student hub: device sign-in (or the demo student), week timetable with week navigation, grades with weighted averages, deadline checklist, applications and RSVPs |
| `/events` | Open days, tasters and Q&As grouped by month, type filters, RSVP modal, my RSVPs |
| `/styleguide` | The design system, rendered by the real components |
| anything else | 404 |

## Run it

```sh
bun install
bun run dev        # Vite + the Worker in workerd
bun run build      # dist/client (assets) + dist/e_learning/index.js (Worker)
bun run typecheck
```

## Edit it

- `src/content.ts` holds every string, programme, intake, fee, event and the
  demo student's timetable and grades. Start there.
- `src/lib/images.ts` maps every image key to a file in `public/images/`.
  They are generated placeholders (fictional people, rendered shapes): replace
  a file with the same name, or point a key at your own photography. The
  shapes are rendered on black and drawn with `mix-blend-mode: screen`, so a
  replacement shape should also sit on pure black.
- `src/styles.css` holds the tokens (colours, radii, shadows, keyframes).
  Text-bearing accent colours use the lighter `*-ink` tokens, which pass
  WCAG AA on the dark surfaces; the saturated accents are for fills.
- `src/components/` is the design system; `src/pages/` are the screens.
  `/styleguide` shows every component in every state.
- `src/shared/validation.ts` is shared by the forms and the Worker, so both
  apply the same rules.
- `src/lib/store.tsx` keeps applications, the application draft, RSVPs, the
  shortlist, ticked deadlines and the student session in `localStorage`
  (`brightpath:v1`).

## Worker routes

`src/worker/index.ts` validates every form and returns a reference. Nothing is
stored server-side yet: connect the routes to your admissions system, email
provider or a D1 table.

| Route | Body | Returns |
| --- | --- | --- |
| `GET /api/health` | | `{ ok: true }` |
| `GET /api/programmes`, `GET /api/events` | | summaries |
| `POST /api/applications` | the application draft | 201 `{ ref }`, 422 with `fieldErrors` |
| `POST /api/rsvp` | `{ event, name, email }` | 201 `{ ref }`, 422 (also when full) |
| `POST /api/signin` | `{ email, studentId }` | 200, 422 |
| `POST /api/subscribe` | `{ email }` | 200, 422 |

Bad JSON returns 400 and unknown `/api/*` routes a JSON 404.

The student hub sign-in is a device-only demo. For real accounts, add Sign in
with Freebuff and a database.

## Teaching data in D1

The teaching studio keeps its courses, curricula, lectures, resources and
subjects in D1, through the `DB` binding declared in `wrangler.jsonc`. Nothing
is held in module memory, so a Worker restart no longer discards edits.

- `src/teacher/db.ts` creates the tables on the first request an isolate serves.
- `src/teacher/seeds.ts` writes the starter catalogue once, guarded by a
  `meta.seed_version` marker. Ids are fixed, so a retry cannot duplicate rows and
  a row a teacher deletes is not resurrected on the next restart.
- `src/teacher/sql.ts` holds the query helpers; `courses.ts`, `curriculum.ts`,
  `lectures.ts` and `subjects.ts` are the D1-backed stores.

Local development persists the database under `.wrangler/state/v3/d1`. To start
from a clean catalogue, stop the dev server, delete that directory and restart.

Before deploying, create the real database and paste its id into
`wrangler.jsonc`:

```sh
npx wrangler d1 create fadec-teacher
```

## Sessions

The student portal and the teaching studio both sign their session cookies
with HMAC-SHA256 (`src/worker/session-cookie.ts`), each with its own secret:

| Secret | Used by |
| --- | --- |
| `STUDENT_SESSION_SECRET` | `/api/student/*` |
| `TEACHER_SESSION_SECRET` | `/api/teacher/*` |

For local development, copy `.dev.vars.example` to `.dev.vars` (if you
already have a `.dev.vars`, add `TEACHER_SESSION_SECRET` to it). Before
deploying, set each one as a Worker secret:

```sh
npx wrangler secret put STUDENT_SESSION_SECRET
npx wrangler secret put TEACHER_SESSION_SECRET
```

A deployment missing a secret answers that portal's sign-in with 503 rather
than signing with a guessable key. Changing a secret signs everyone out of that
portal.

## Deploy with Freebuff Sites

`deploy.json` already points at the build output. After `bun run build`,
deploy it with the `sites_deploy` tool from this directory.
