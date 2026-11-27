# FADEC — project memory

Pilot-training academy platform. Three surfaces: public marketing site, teaching studio, student portal.

**This file is the only architecture source of truth.** Earlier PRDs describing Next.js/NestJS/Prisma/Postgres are superseded — that stack was abandoned. Do not propose Prisma, NestJS modules, or a Postgres migration unless explicitly asked to re-evaluate the stack.

## Stack (fixed — do not suggest alternatives without being asked)
Vite 8 · React 19 · React Router 8 · Tailwind CSS 4 · Hono 4 on Cloudflare Workers · D1 (SQLite) · TypeScript 5.9 · Bun

## Commands
```
bun install
bun run dev        # Vite + Worker in workerd
bun run build      # dist/client + dist/fadec/index.js Worker
bun run typecheck  # tsc --noEmit
```

## Architectural decisions already fixed in code — do not relitigate
1. **Contracts first.** `src/contracts/` holds DTOs (auth, catalog, learning, teaching, assessment, media, common), shared by Worker and React app. Any new field goes here first.
2. **D1 is the only server state.** No module-memory maps. `src/teacher/db.ts` creates tables on first request per isolate. `SCHEMA` is split on `;` — no semicolons in comments. Migrations are idempotent `ALTER`/`CREATE INDEX`.
3. **Seeds run once behind a version marker** (`meta.seed_version`, etc.), ids fixed, every insert `OR IGNORE`.
4. **Foreign resources answer 404, never 403.** A course/assignment/submission belonging to someone else must be indistinguishable from one that doesn't exist. Never trust a client-supplied student/teacher id.
5. **The server derives what the UI would otherwise guess** — assignment window, lateness, marking status, publish checklists, counts. Never compare against the browser clock client-side.
6. **Draft state stays server-side** — never filtered out with CSS/client logic.
7. **Placeholders are honest** — a not-yet-built screen says so and names its phase; never mock data to look finished.
8. **One editorial design system** — warm off-white `#f6f3ec`, navy ink `#0f2137`, amber accent `#b0761c`, Newsreader display + sans body, 2–3px radii. No gradients/glass/emoji/stock icons.
9. **Build method: vertical slices.** contract → D1 schema/seed → Worker route → screen → verification (curl the real endpoint against real storage). Never ship against mock data.

## Identity model
- Teachers are invite-only (`TeacherInviteDTO`) — no self-serve teacher application (unlike the old PRD's flow).
- A user may hold several roles; session carries `activeWorkspace`, not one fixed role.
- Student session: signed HMAC-SHA256 cookie (`STUDENT_SESSION_SECRET`), HttpOnly, SameSite=Lax, 12h TTL. Fails closed if the secret is missing.
- **Teacher auth is currently a demo-only unsigned cookie — unsafe, P0 to fix (see below).**

## Current state (verify against code before trusting this list — it drifts)
| Surface | State |
|---|---|
| Public marketing site | Built, client-side demo data |
| Public API | Validates, returns a reference, **stores nothing** |
| Teaching studio: courses/curriculum/subjects/lectures/assignments/marking | Built on D1, working end to end |
| Teaching studio: quizzes/live/attendance/students/announcements/analytics/settings | Routes + guards + honest placeholders only |
| Student portal: assignments, hand-in, published marks | Built on D1, working end to end |
| Student portal: file uploads, lecture playback, progress, timetable | Not built |
| Teacher authentication | Demo-only, unsafe |
| Deployment | Config written, nothing deployed |

## P0 — do before any real user touches this (in order)
1. Replace the demo teacher cookie with a real signed session (HMAC or IdP) — same rigor as the student cookie.
2. Unify identity — retire `/dashboard`'s localStorage sign-in or point it at `/api/student/*`. Two "student" identities exist today.
3. Provision D1 for real, deploy, set `STUDENT_SESSION_SECRET` via `wrangler secret put`.
4. Make `POST /api/applications` and `/api/rsvp` persist to D1 (currently drop silently).
5. Rate-limit sign-in and form endpoints.

## When starting any task
1. State which P0/P1 item or PRD section you're working from.
2. Follow the vertical-slice method (section 9 above) — don't build a screen before its route and schema exist.
3. Verify with a real request against real storage before calling it done, matching this project's own existing verification style (see `submission_revisions` / published-mark handling as the reference example of done-right).
4. Never invent an identity/role flow that contradicts the "invite-only teacher" / "multi-role session" model above.
