/*
  Student accounts and their course enrolments.

  Submissions have always carried `student_user_id` and `student_name` as plain
  strings, because student accounts did not exist when they were seeded. The ids
  below are the same ones those rows already use (u-001 … u-024), so every
  existing submission now resolves to a real account, and to an enrolment in the
  course it was handed in for. Nothing has to be backfilled and no name has to be
  rewritten.

  These enrolments are the count now: `courses` no longer stores a total, so the
  hand-in progress the teacher sees is derived from these rows — 8 on PPL, 7 on
  CPL, 5 on IR, 4 on A320 and 6 on MCC. The accounts with no submissions yet (Sam
  Whitfield, Isabel Moreno and the six MCC students) are the reason a course can
  show "6 of 8" rather than "6 of 6".

  Like the other seeds this runs once, behind its own marker, and every insert is
  OR IGNORE so an interrupted run is safe to retry.
*/
import { insertAll } from './sql'

const SEED_VERSION = '2'
const ENROLLED_AT = '2026-09-01T09:00:00Z'

type SeedStudent = {
  id: string
  name: string
  cohort: string
  courseId: string
}

const STUDENTS: SeedStudent[] = [
  { id: 'u-001', name: 'Priya Nair', cohort: 'PPL 2026-A', courseId: 'crs-ppl' },
  { id: 'u-002', name: 'Theo Bennett', cohort: 'PPL 2026-A', courseId: 'crs-ppl' },
  { id: 'u-003', name: 'Maya Okafor', cohort: 'PPL 2026-A', courseId: 'crs-ppl' },
  { id: 'u-004', name: 'Lucas Ferreira', cohort: 'PPL 2026-A', courseId: 'crs-ppl' },
  { id: 'u-005', name: 'Hana Sato', cohort: 'PPL 2026-A', courseId: 'crs-ppl' },
  { id: 'u-006', name: 'Daniel Kim', cohort: 'PPL 2026-A', courseId: 'crs-ppl' },
  { id: 'u-007', name: 'Amelia Wright', cohort: 'PPL 2026-A', courseId: 'crs-ppl' },
  { id: 'u-008', name: 'Sam Whitfield', cohort: 'PPL 2026-A', courseId: 'crs-ppl' },
  { id: 'u-009', name: 'Sofia Rossi', cohort: 'CPL 2026-A', courseId: 'crs-cpl' },
  { id: 'u-010', name: 'Jonas Weber', cohort: 'CPL 2026-A', courseId: 'crs-cpl' },
  { id: 'u-011', name: 'Aisha Bello', cohort: 'CPL 2026-A', courseId: 'crs-cpl' },
  { id: 'u-012', name: 'Ravi Menon', cohort: 'CPL 2026-A', courseId: 'crs-cpl' },
  { id: 'u-013', name: 'Elena Petrova', cohort: 'CPL 2026-A', courseId: 'crs-cpl' },
  { id: 'u-014', name: 'Tom Hughes', cohort: 'CPL 2026-A', courseId: 'crs-cpl' },
  { id: 'u-015', name: 'Nia Campbell', cohort: 'CPL 2026-A', courseId: 'crs-cpl' },
  { id: 'u-016', name: 'Marcus Lee', cohort: 'IR 2026-A', courseId: 'crs-ir' },
  { id: 'u-017', name: 'Clara Dubois', cohort: 'IR 2026-A', courseId: 'crs-ir' },
  { id: 'u-018', name: 'Yusuf Demir', cohort: 'IR 2026-A', courseId: 'crs-ir' },
  { id: 'u-019', name: 'Grace Mwangi', cohort: 'IR 2026-A', courseId: 'crs-ir' },
  { id: 'u-020', name: 'Ivan Volkov', cohort: 'IR 2026-A', courseId: 'crs-ir' },
  { id: 'u-021', name: 'Wei Chen', cohort: 'A320 2026', courseId: 'crs-a320' },
  { id: 'u-022', name: 'Fatima Zahra', cohort: 'A320 2026', courseId: 'crs-a320' },
  { id: 'u-023', name: 'Oliver Grant', cohort: 'A320 2026', courseId: 'crs-a320' },
  { id: 'u-024', name: 'Isabel Moreno', cohort: 'A320 2026', courseId: 'crs-a320' },
  { id: 'u-025', name: 'Nadia Haddad', cohort: 'MCC 2026', courseId: 'crs-mcc' },
  { id: 'u-026', name: 'Peter Lindqvist', cohort: 'MCC 2026', courseId: 'crs-mcc' },
  { id: 'u-027', name: 'Arjun Kapoor', cohort: 'MCC 2026', courseId: 'crs-mcc' },
  { id: 'u-028', name: 'Sara Mendes', cohort: 'MCC 2026', courseId: 'crs-mcc' },
  { id: 'u-029', name: 'Kofi Mensah', cohort: 'MCC 2026', courseId: 'crs-mcc' },
  { id: 'u-030', name: 'Lily Zhang', cohort: 'MCC 2026', courseId: 'crs-mcc' },
]

/** `Priya Nair` → `priya.nair@fadec.example`. The names are unique, so the mails are too. */
const emailFor = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@fadec.example`

export async function seedStudents(db: D1Database): Promise<void> {
  const marker = await db.prepare("SELECT value FROM meta WHERE key = 'student_seed_version'").first<{ value: string }>()
  if (marker?.value === SEED_VERSION) return

  await insertAll(
    db,
    `INSERT OR IGNORE INTO students (id, name, email, cohort, created_at) VALUES (?, ?, ?, ?, ?)`,
    STUDENTS.map((s) => [s.id, s.name, emailFor(s.name), s.cohort, ENROLLED_AT]),
  )

  await insertAll(
    db,
    `INSERT OR IGNORE INTO course_enrolments (course_id, student_id, enrolled_at, status) VALUES (?, ?, ?, 'ACTIVE')`,
    STUDENTS.map((s) => [s.courseId, s.id, ENROLLED_AT]),
  )

  await db
    .prepare(`INSERT INTO meta (key, value) VALUES ('student_seed_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(SEED_VERSION)
    .run()
}
