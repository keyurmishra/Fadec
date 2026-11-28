# FADEC — project memory

Aviation training management platform for **one academy**. Three surfaces today: public marketing site, teaching studio, student portal. An academy admin workspace is planned.

## Source of truth
- **Product direction:** `docs/product/FADEC_MASTER_PRD.md` (initial draft; open decisions in its §9).
- **What was built before M0:** `docs/product/FADEC_CURRENT_IMPLEMENTATION_PRD.docx` / `.pdf` (written against commit `37713b9`; it predates quizzes, the signed teacher session, tests and CI).
- **Current code:** the repository and its git history. When a document disagrees with the code, the code wins and the disagreement gets reported.
- **Architecture rules:** this file. Earlier PRDs describing Next.js/NestJS/Prisma/Postgres are superseded. Do not propose Prisma, NestJS modules, or a Postgres migration unless explicitly asked to re-evaluate the stack.

## Product direction (decided by the product owner)
- **Single academy.** No multi-tenancy, no tenant columns, no multi-academy registration or marketplace.
- **Roles for the initial release: Admin, Instructor (teacher) and Student.** No parent/guardian accounts. Further staff roles (admissions, academic coordinator) only if the academy's real workflow needs them. `SUPPORT` and `SUPER_ADMIN` exist in `src/contracts/auth.ts` but are not in scope.
- **Accounts are admin-controlled.** No public self-registration. Students and instructors sign in with email and password; secure password hashing, password reset and proper session management belong to the authentication milestone.
- **Public site and online applications stay in scope.** Applications must be persisted (not discarded) and reviewed by the admin with statuses Pending, Under Review, Accepted, Rejected. An account is created after an application is accepted.
- **Payments are on hold** until the product owner decides separately. Do not build or integrate payments.
- **No assumed regulatory compliance.** Do not claim DGCA, FAA or EASA compliance, and do not invent an official syllabus. The five seeded subjects (Meteorology, General Navigation, Radio Navigation, Instrument Navigation, Air Regulation) are workflow samples, not a syllabus.
- **Environments:** separate local, staging and production, each with its own isolated D1 database and explicit control over seed data.
- **Third-party integrations** (media storage, notifications, payments) are evaluated and approved before implementation.

## Stack (fixed — do not suggest alternatives without being asked)
Vite 8 · React 19 · React Router 8 · Tailwind CSS 4 · Motion · Lucide · Hono 4 on Cloudflare Workers · D1 (SQLite) · TypeScript 5.9 · Bun · Vitest · GitHub Actions

## Commands
```
bun install
cp .dev.vars.example .dev.vars   # local session secrets, never committed
bun run dev        # Vite + Worker in workerd
bun run build      # dist/client + dist/fadec/index.js Worker
bun run typecheck  # tsc --noEmit
bun run test       # Vitest against an in-memory D1
```
CI (`.github/workflows/ci.yml`) runs typecheck, build and test on pushes to `main` and on pull requests.

## Architectural decisions already fixed in code — do not relitigate
1. **Contracts first.** `src/contracts/` holds DTOs (auth, catalog, learning, teaching, assessment, quizzes, media, common), shared by Worker and React app. Any new field goes here first.
2. **D1 is the only server state.** No module-memory maps. `src/teacher/db.ts` creates tables on first request per isolate. `SCHEMA` is split on `;` — no semicolons in comments. Migrations are idempotent `ALTER`/`CREATE INDEX`. (There is no `wrangler d1 migrations` history yet.)
3. **Seeds run once behind a version marker** (`meta.seed_version`, etc.), ids fixed, every insert `OR IGNORE`. Today they run in every environment.
4. **Foreign resources answer 404, never 403.** A course/assignment/submission belonging to someone else must be indistinguishable from one that doesn't exist. Never trust a client-supplied student/teacher id.
5. **The server derives what the UI would otherwise guess** — assignment window, lateness, marking status, publish checklists, counts. Never compare against the browser clock client-side.
6. **Draft state stays server-side** — never filtered out with CSS/client logic.
7. **Placeholders are honest** — a not-yet-built screen says so and names its phase; never mock data to look finished. Figures that are not measured are shown as not tracked, not estimated.
8. **One editorial design system** — warm off-white `#f6f3ec`, navy ink `#0f2137`, amber accent `#b0761c`, Newsreader display + sans body, 2–3px radii. No gradients/glass/emoji/stock icons.
9. **Build method: vertical slices.** contract → D1 schema/seed → Worker route → screen → tests → verification against real storage. Never ship against mock data.
10. **One error shape.** Every API failure answers `{ error, fieldErrors? }` via `src/worker/errors.ts`; causes of 500s are logged, never returned.

## Identity model (current code)
- Both portals use HMAC-SHA256 signed cookies (`fadec_student`, `fadec_teacher`) built on `src/worker/session-cookie.ts`, with separate secrets `STUDENT_SESSION_SECRET` and `TEACHER_SESSION_SECRET`. HttpOnly, SameSite=Lax, 12h TTL. Each fails closed (503) if its secret is missing.
- **Sign-in is still demo-only:** email plus a teacher ID or student number, no password. Teacher accounts come from a seed list in code, not D1. No rate limiting, no server-side session store or revocation, no password reset. Not production authentication.
- The contracts let a user hold several roles; the session carries `activeWorkspace`, not one fixed role. Don't invent identity flows that contradict this or the admin-controlled account model above.

## Current state (verify against code before trusting this list — it drifts)
| Surface | State |
|---|---|
| Public marketing site | Built, static content (`src/content.ts`) |
| Public API (applications, RSVP, subscribe, signin) | Validates, returns a reference, **stores nothing** |
| Teaching studio: curriculum/subjects/lectures/assignments/marking/quizzes | Built on D1, tested |
| Teaching studio: live classes/attendance/students/announcements/analytics/settings | Honest placeholders only |
| Teaching studio: create/edit/delete courses; delete subjects, assignments, quizzes | Not built; enrolment exists only in the seed |
| Student portal: assignments (text hand-in, returned marks), quizzes | Built on D1, tested |
| Student portal: lecture playback, file uploads, progress, timetable | Not built |
| Admin workspace | Not built |
| Media storage | None; lecture resources are links only |
| Legacy `/dashboard` | localStorage demo, separate from the real `/learn` portal |
| Deployment | Config written, nothing deployed; `database_id` is a placeholder |

## Open hardening items (before any real user)
1. Real authentication: admin-created accounts, email + password with secure hashing, password reset, revocable sessions, rate-limited sign-in.
2. Unify identity — retire or repoint `/dashboard`'s localStorage sign-in. Two "student" identities exist today.
3. Persist `POST /api/applications` (with admin review statuses) and `/api/rsvp` to D1.
4. Rate-limit sign-in and public form endpoints.
5. Provision isolated local/staging/production D1 databases, keep demo seed data out of production, set both session secrets with `wrangler secret put`.

## Working rules
- Work milestone by milestone, one feature branch per milestone. Never push to `main`.
- No merge and no deployment without the product owner's explicit approval.
- Keep documentation changes separate from implementation milestones.

## When starting any task
1. State which milestone, hardening item or PRD section you're working from.
2. Follow the vertical-slice method (decision 9) — don't build a screen before its route and schema exist.
3. Add or update Vitest coverage, then verify with a real request against real storage before calling it done (see `submission_revisions` / published-mark handling as the reference example of done-right).
4. Never invent an identity/role flow that contradicts the product direction above.
