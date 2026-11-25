/*
  D1 schema and first-run bootstrap for the teaching studio.

  The studio used to keep its courses, curricula, lectures and subjects in
  module-level arrays, which meant a Worker restart threw every edit away. They
  now live in D1: one table per concept, joined to the course they belong to so
  a teacher's scope is always a join away.

  `ensureDatabase` is idempotent and cheap after the first call in an isolate:
  it runs CREATE IF NOT EXISTS, then seeds the catalogue only when the seed
  marker is absent. Because seeds use fixed ids and INSERT OR IGNORE, two
  isolates racing on their first request cannot duplicate rows, and a row a
  teacher later deletes is not resurrected by the next restart.
*/
import { seedDatabase } from './seeds'

/** The D1 binding every teaching handler reads through. */
export type { Db } from './sql'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  headline TEXT NOT NULL,
  avatar_url TEXT
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  cohort TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,
  level TEXT NOT NULL,
  status TEXT NOT NULL,
  instructor_id TEXT NOT NULL REFERENCES teachers(id),
  thumbnail_url TEXT,
  assignment_count INTEGER NOT NULL DEFAULT 0,
  completion_percent INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS courses_by_teacher ON courses(instructor_id, position);

/* A student exists independently of a course, and the enrolment is what scopes
   them to one. The composite key stops a double enrolment and makes the pair the
   unit every student query joins on. No semicolons in this block: SCHEMA is split
   on them before it is prepared. */
CREATE TABLE IF NOT EXISTS course_enrolments (
  course_id TEXT NOT NULL REFERENCES courses(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  enrolled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (course_id, student_id)
);
CREATE INDEX IF NOT EXISTS enrolments_by_student ON course_enrolments(student_id);

CREATE TABLE IF NOT EXISTS curriculum_sections (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sections_by_course ON curriculum_sections(course_id, position);

CREATE TABLE IF NOT EXISTS curriculum_chapters (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  section_id TEXT NOT NULL REFERENCES curriculum_sections(id),
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chapters_by_section ON curriculum_chapters(section_id, position);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  section_id TEXT NOT NULL REFERENCES curriculum_sections(id),
  chapter_id TEXT REFERENCES curriculum_chapters(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  position INTEGER NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  status TEXT NOT NULL,
  media_status TEXT NOT NULL,
  is_preview INTEGER NOT NULL DEFAULT 0,
  body TEXT,
  available_from TEXT,
  available_until TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lessons_by_course ON lessons(course_id, status);
CREATE INDEX IF NOT EXISTS lessons_by_section ON lessons(section_id, position);
CREATE INDEX IF NOT EXISTS lessons_by_chapter ON lessons(chapter_id, position);

CREATE TABLE IF NOT EXISTS lesson_resources (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  external_url TEXT,
  size_bytes INTEGER,
  position INTEGER NOT NULL,
  added_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS resources_by_lesson ON lesson_resources(lesson_id, position);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  opens_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  late_policy TEXT NOT NULL,
  attempts_allowed INTEGER NOT NULL DEFAULT 1,
  max_score INTEGER NOT NULL DEFAULT 100,
  allow_file_upload INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assignments_by_course ON assignments(course_id, due_at);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id),
  student_user_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  submitted_at TEXT NOT NULL,
  is_late INTEGER NOT NULL DEFAULT 0,
  answer_text TEXT,
  file_name TEXT,
  score INTEGER,
  feedback TEXT NOT NULL DEFAULT '',
  graded_by TEXT,
  graded_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS submissions_by_assignment ON assignment_submissions(assignment_id, submitted_at);
CREATE INDEX IF NOT EXISTS submissions_by_student ON assignment_submissions(student_user_id);

CREATE TABLE IF NOT EXISTS submission_revisions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES assignment_submissions(id),
  actor_id TEXT NOT NULL,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_score INTEGER,
  new_score INTEGER,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS revisions_by_submission ON submission_revisions(submission_id, at);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subject_courses (
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (subject_id, course_id)
);

CREATE TABLE IF NOT EXISTS subject_topics (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS topics_by_subject ON subject_topics(subject_id, position);

CREATE TABLE IF NOT EXISTS subject_lessons (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES subject_topics(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS syllabus_by_topic ON subject_lessons(topic_id, position);

CREATE TABLE IF NOT EXISTS subject_lesson_lectures (
  id TEXT PRIMARY KEY,
  subject_lesson_id TEXT NOT NULL REFERENCES subject_lessons(id),
  course_id TEXT NOT NULL,
  lecture_id TEXT NOT NULL REFERENCES lessons(id),
  position INTEGER NOT NULL,
  UNIQUE (lecture_id)
);
CREATE INDEX IF NOT EXISTS links_by_lesson ON subject_lesson_lectures(subject_lesson_id, position);
`

/**
 * D1's `exec` runs one statement per line, so multi-line DDL cannot go through
 * it. Splitting on `;` and sending prepared statements keeps each CREATE whole.
 * Every statement is IF NOT EXISTS, so running this again is a no-op.
 */
const SCHEMA_STATEMENTS = SCHEMA.split(';')
  .map((statement) => statement.trim())
  .filter(Boolean)

let ready: Promise<void> | null = null

/**
 * Create the tables and seed the catalogue once per isolate. A failed attempt
 * clears the promise so the next request retries instead of caching the error.
 */
export function ensureDatabase(db: D1Database): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await db.batch(SCHEMA_STATEMENTS.map((statement) => db.prepare(statement)))
      await seedDatabase(db)
    })().catch((error: unknown) => {
      ready = null
      throw error
    })
  }
  return ready
}
