/*
  The catalogue the studio starts from, and the first-run seed that writes it
  into D1.

  These are the same rows the old fixtures held: two teachers, five training
  courses, the curriculum for four of them, and five aviation subjects whose
  syllabus lessons link to real lectures in those curricula. Ids are fixed so a
  re-seed is harmless and so the syllabus links resolve to the same lectures on
  every machine.

  Topics, lessons and lecture titles in the subjects are SAMPLE content for
  exercising the workflow. They are not an official syllabus, examination
  standard or regulatory reference.
*/
import type { CourseStatus } from '../contracts/catalog'
import type { TeacherIdentityDTO } from '../contracts/teaching'
import { seedAssessment } from './assessment-seed'
import { insertAll } from './sql'
import { seedStudents } from './student-seed'

/** Bump only when the seed rows themselves change shape. */
const SEED_VERSION = '1'

export const SEED_TIME = '2026-09-12T10:00:00.000Z'

/* --------------------------------- people -------------------------------- */

export const SEED_TEACHERS: TeacherIdentityDTO[] = [
  {
    teacherId: 'TCH-2011-004',
    name: 'Capt. Naveen Rao',
    email: 'naveen.rao@fadec.example',
    department: 'Flight training',
    headline: 'Chief flying instructor',
    avatarUrl: '/images/faculty-1.webp',
  },
  {
    teacherId: 'TCH-2015-011',
    name: 'Capt. Tomas Rehn',
    email: 'tomas.rehn@fadec.example',
    department: 'Simulator',
    headline: 'Head of simulator training',
    avatarUrl: '/images/faculty-2.webp',
  },
]

/* -------------------------------- courses -------------------------------- */

export type SeedCourse = {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  level: string
  status: CourseStatus
  instructorId: string
  thumbnailUrl: string
  assignmentCount: number
  completionPercent: number
  position: number
  updatedAt: string
  publishedAt: string | null
}

const at = (s: string) => new Date(s).toISOString()

export const SEED_COURSES: SeedCourse[] = [
  {
    id: 'crs-ppl',
    slug: 'ppl-private-pilot-licence',
    title: 'Private Pilot Licence (PPL)',
    summary: 'Nine ground subjects, 45 flight hours and a skills test — the licence that starts most flying careers.',
    category: 'Licence',
    level: 'INTRODUCTORY',
    status: 'PUBLISHED',
    instructorId: 'TCH-2011-004',
    thumbnailUrl: '/images/prog-computing.webp',
    assignmentCount: 3,
    completionPercent: 62,
    position: 0,
    updatedAt: at('2026-11-23T09:10:00Z'),
    publishedAt: at('2026-08-14T10:00:00Z'),
  },
  {
    id: 'crs-cpl',
    slug: 'cpl-commercial-pilot-licence',
    title: 'Commercial Pilot Licence (CPL)',
    summary: 'The professional licence: fourteen ground subjects, 200 flight hours and a commercial skills test.',
    category: 'Licence',
    level: 'ADVANCED',
    status: 'PUBLISHED',
    instructorId: 'TCH-2011-004',
    thumbnailUrl: '/images/prog-health.webp',
    assignmentCount: 3,
    completionPercent: 48,
    position: 1,
    updatedAt: at('2026-11-24T08:40:00Z'),
    publishedAt: at('2026-06-02T09:30:00Z'),
  },
  {
    id: 'crs-ir',
    slug: 'instrument-rating',
    title: 'Instrument Rating (IR)',
    summary: 'Fifty hours of instrument time, procedure trainers and an IR skills test on a multi-engine type.',
    category: 'Rating',
    level: 'ADVANCED',
    status: 'DRAFT',
    instructorId: 'TCH-2011-004',
    thumbnailUrl: '/images/prog-business.webp',
    assignmentCount: 2,
    completionPercent: 0,
    position: 2,
    updatedAt: at('2026-11-21T15:25:00Z'),
    publishedAt: null,
  },
  {
    id: 'crs-a320',
    slug: 'a320-type-rating-ground-school',
    title: 'A320 Type Rating Ground School',
    summary: 'Systems, SOPs and performance for the A320 family, taught by line training captains.',
    category: 'Rating',
    level: 'ADVANCED',
    status: 'PUBLISHED',
    instructorId: 'TCH-2011-004',
    thumbnailUrl: '/images/prog-a320.webp',
    assignmentCount: 2,
    completionPercent: 71,
    position: 3,
    updatedAt: at('2026-11-22T12:05:00Z'),
    publishedAt: at('2026-09-01T08:00:00Z'),
  },
  {
    id: 'crs-mcc',
    slug: 'mcc-joc',
    title: 'MCC / JOC — Multi-Crew Cooperation',
    summary: 'Two-crew procedures, threat management and a full LOFT scenario in the fixed-base simulator.',
    category: 'Rating',
    level: 'ADVANCED',
    status: 'PUBLISHED',
    instructorId: 'TCH-2015-011',
    thumbnailUrl: '/images/prog-psych.webp',
    assignmentCount: 1,
    completionPercent: 66,
    position: 4,
    updatedAt: at('2026-11-19T10:00:00Z'),
    publishedAt: at('2026-10-05T09:00:00Z'),
  },
]

/* ------------------------------- curriculum ------------------------------ */

type ChapterSeed = { title: string; lessons: string[] }
type ModuleSeed = { title: string; chapters: ChapterSeed[] }

export const CURRICULUM_SPECS: Record<string, { modules: ModuleSeed[]; drafts: number }> = {
  'crs-ppl': {
    drafts: 1,
    modules: [
      {
        title: 'Ground school',
        chapters: [
          { title: 'Air law', lessons: ['Rules of the air', 'Licences and documents', 'Airspace classes', 'Aircraft and passenger safety'] },
          { title: 'Meteorology', lessons: ['The atmosphere and pressure', 'Clouds and icing', 'Reading a METAR and TAF'] },
        ],
      },
      {
        title: 'Flight phase',
        chapters: [
          { title: 'Circuits', lessons: ['Effects of controls', 'The circuit pattern', 'First solo briefing'] },
          { title: 'Navigation', lessons: ['Dead reckoning', 'Planning a cross-country', 'In-flight diversion', 'Radio navigation basics'] },
        ],
      },
    ],
  },
  'crs-cpl': {
    drafts: 2,
    modules: [
      {
        title: 'Air law and operations',
        chapters: [
          { title: 'Air law', lessons: ['International conventions', 'Licensing and ratings', 'Operational procedures'] },
          { title: 'Operations', lessons: ['Fuel and alternates', 'Crew duty limits'] },
        ],
      },
      {
        title: 'Aircraft and performance',
        chapters: [
          { title: 'Systems', lessons: ['Powerplant', 'Hydraulics', 'Electrical'] },
          { title: 'Performance', lessons: ['Take-off performance', 'Landing performance', 'Mass and balance'] },
        ],
      },
      {
        title: 'Flight planning',
        chapters: [
          { title: 'Planning', lessons: ['Route planning', 'Fuel planning', 'Flight plan filing'] },
          { title: 'Instruments', lessons: ['Gyroscopic instruments', 'Radio navigation aids'] },
        ],
      },
      {
        title: 'Instrument and human performance',
        chapters: [
          { title: 'Instrument flight', lessons: ['Basic instrument flight', 'Holding patterns', 'Approach basics'] },
          { title: 'Human performance', lessons: ['Fatigue', 'Decision making', 'Threat and error'] },
        ],
      },
    ],
  },
  'crs-ir': {
    drafts: 9,
    modules: [
      {
        title: 'Instrument procedures',
        chapters: [
          { title: 'Approaches', lessons: ['ILS to minima', 'RNAV approaches', 'Missed approach'] },
          { title: 'Holding', lessons: ['Holding entries', 'Timing and wind'] },
        ],
      },
      {
        title: 'Simulator and skills test',
        chapters: [
          { title: 'Simulator', lessons: ['Simulator familiarisation', 'Partial panel'] },
          { title: 'Skills test', lessons: ['Skills test brief', 'Debrief and review'] },
        ],
      },
    ],
  },
  'crs-a320': {
    drafts: 0,
    modules: [
      {
        title: 'General and airframe',
        chapters: [
          { title: 'Airframe', lessons: ['A320 family overview', 'Doors and exits'] },
          { title: 'Flight controls', lessons: ['Fly-by-wire basics', 'Flight control laws'] },
        ],
      },
      {
        title: 'Systems',
        chapters: [
          { title: 'Hydraulics', lessons: ['Green, blue and yellow', 'Abnormal hydraulics'] },
          { title: 'Powerplant', lessons: ['CFM engines', 'Fuel system'] },
          { title: 'Automation', lessons: ['FMGS overview', 'Autopilot modes'] },
        ],
      },
      {
        title: 'Operations',
        chapters: [
          { title: 'Performance', lessons: ['Take-off performance', 'Landing performance'] },
          { title: 'SOPs', lessons: ['Normal procedures', 'Abnormal and emergency'] },
          { title: 'Assessment', lessons: ['Ground assessment brief', 'Assessment debrief'] },
        ],
      },
    ],
  },
}

/* -------------------------------- subjects ------------------------------- */

type SubjectSeed = {
  id: string
  name: string
  description: string
  status: 'DRAFT' | 'PUBLISHED'
  updatedAt: string
  courseIds: string[]
  topics: Array<{
    title: string
    description: string
    lessons: Array<{ title: string; description: string; courseId?: string; lectureId?: string }>
  }>
}

export const SEED_SUBJECTS: SubjectSeed[] = [
  {
    id: 'sub-met',
    name: 'Meteorology',
    description: 'The atmosphere, cloud and icing, and the weather reports a pilot reads before and during flight.',
    status: 'PUBLISHED',
    updatedAt: '2026-11-24T09:20:00Z',
    courseIds: ['crs-ppl', 'crs-cpl'],
    topics: [
      {
        title: 'Atmosphere and pressure',
        description: 'Sample unit — pressure, density and how both change with altitude.',
        lessons: [
          { title: 'The atmosphere and pressure', description: 'Sample lesson — edit or replace it.', courseId: 'crs-ppl', lectureId: 'les-crs-ppl-1-2-1' },
          { title: 'Clouds and icing', description: 'Sample lesson — edit or replace it.', courseId: 'crs-ppl', lectureId: 'les-crs-ppl-1-2-2' },
        ],
      },
      {
        title: 'Weather reports',
        description: 'Sample unit — decoding the reports issued before a flight.',
        lessons: [{ title: 'Reading a METAR and TAF', description: 'Sample lesson — edit or replace it.', courseId: 'crs-ppl', lectureId: 'les-crs-ppl-1-2-3' }],
      },
    ],
  },
  {
    id: 'sub-gnav',
    name: 'General Navigation',
    description: 'Dead reckoning, chart work and the planning decisions behind a cross-country flight.',
    status: 'PUBLISHED',
    updatedAt: '2026-11-22T14:05:00Z',
    courseIds: ['crs-ppl', 'crs-cpl'],
    topics: [
      {
        title: 'Dead reckoning',
        description: 'Sample unit — heading, time and distance without radio aids.',
        lessons: [{ title: 'Dead reckoning', description: 'Sample lesson — edit or replace it.', courseId: 'crs-ppl', lectureId: 'les-crs-ppl-2-2-1' }],
      },
      {
        title: 'Cross-country planning',
        description: 'Sample unit — building and amending a navigation log.',
        lessons: [
          { title: 'Planning a cross-country', description: 'Sample lesson — edit or replace it.', courseId: 'crs-ppl', lectureId: 'les-crs-ppl-2-2-2' },
          { title: 'In-flight diversion', description: 'Sample lesson — edit or replace it.', courseId: 'crs-ppl', lectureId: 'les-crs-ppl-2-2-3' },
        ],
      },
    ],
  },
  {
    id: 'sub-rnav',
    name: 'Radio Navigation',
    description: 'Ground-based and satellite radio aids, and how their indications are used in flight.',
    status: 'DRAFT',
    updatedAt: '2026-11-20T11:40:00Z',
    courseIds: ['crs-ppl', 'crs-cpl'],
    topics: [
      {
        title: 'Radio aids in the air',
        description: 'Sample unit — what each aid measures and how it is displayed.',
        lessons: [
          { title: 'Radio navigation basics', description: 'Sample lesson — edit or replace it.', courseId: 'crs-ppl', lectureId: 'les-crs-ppl-2-2-4' },
          { title: 'Radio navigation aids', description: 'Sample lesson — edit or replace it.', courseId: 'crs-cpl', lectureId: 'les-crs-cpl-3-2-2' },
        ],
      },
    ],
  },
  {
    id: 'sub-inav',
    name: 'Instrument Navigation',
    description: 'Instrument approaches, holding patterns and the procedures flown without visual reference.',
    status: 'DRAFT',
    updatedAt: '2026-11-18T16:30:00Z',
    courseIds: ['crs-ir', 'crs-cpl'],
    topics: [
      {
        title: 'Approaches',
        description: 'Sample unit — briefing and flying an approach to minima.',
        lessons: [
          { title: 'ILS to minima', description: 'Sample lesson — edit or replace it.', courseId: 'crs-ir', lectureId: 'les-crs-ir-1-1-1' },
          { title: 'RNAV approaches', description: 'Sample lesson — edit or replace it.', courseId: 'crs-ir', lectureId: 'les-crs-ir-1-1-2' },
        ],
      },
      {
        title: 'Holding',
        description: 'Sample unit — entries, timing and wind correction.',
        lessons: [{ title: 'Holding entries', description: 'Sample lesson — edit or replace it.', courseId: 'crs-ir', lectureId: 'les-crs-ir-1-2-1' }],
      },
    ],
  },
  {
    id: 'sub-airlaw',
    name: 'Air Regulation',
    description: 'Rules of the air, licensing and the regulatory framework that governs a flight.',
    status: 'PUBLISHED',
    updatedAt: '2026-11-23T08:15:00Z',
    courseIds: ['crs-ppl', 'crs-cpl'],
    topics: [
      {
        title: 'Rules of the air',
        description: 'Sample unit — right of way, clearances and documents carried on board.',
        lessons: [
          { title: 'Rules of the air', description: 'Sample lesson — edit or replace it.', courseId: 'crs-ppl', lectureId: 'les-crs-ppl-1-1-1' },
          { title: 'Licences and documents', description: 'Sample lesson — edit or replace it.', courseId: 'crs-ppl', lectureId: 'les-crs-ppl-1-1-2' },
        ],
      },
      {
        title: 'International framework',
        description: 'Sample unit — how conventions, annexes and national rules relate.',
        lessons: [{ title: 'International conventions', description: 'Sample lesson — edit or replace it.', courseId: 'crs-cpl', lectureId: 'les-crs-cpl-1-1-1' }],
      },
    ],
  },
]

/* --------------------------------- seeding ------------------------------- */

/** The same stable hash the lecture fixtures used, so seeded resource rows match. */
const hash = (input: string) => {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

type SeedLesson = {
  id: string
  courseId: string
  sectionId: string
  chapterId: string
  chapterTitle: string
  title: string
  kind: 'VIDEO' | 'TEXT'
  position: number
  estimatedMinutes: number
  status: 'DRAFT' | 'PUBLISHED'
  mediaStatus: 'READY' | 'PROCESSING' | 'NONE'
  isPreview: boolean
}

/**
 * Seed the catalogue when this database has never been seeded. The marker is
 * written in the same batch as the rows, so an interrupted seed simply runs
 * again; each insert is INSERT OR IGNORE, so a partial retry is safe.
 */
/** Catalogue, then the people on it, then the assignments that hang off it. */
export async function seedDatabase(db: D1Database): Promise<void> {
  await seedCatalogue(db)
  await seedStudents(db)
  await seedAssessment(db)
}

async function seedCatalogue(db: D1Database): Promise<void> {
  const marker = await db.prepare("SELECT value FROM meta WHERE key = 'seed_version'").first<{ value: string }>()
  if (marker?.value === SEED_VERSION) return

  await insertAll(
    db,
    `INSERT OR IGNORE INTO teachers (id, name, email, department, headline, avatar_url) VALUES (?, ?, ?, ?, ?, ?)`,
    SEED_TEACHERS.map((t) => [t.teacherId, t.name, t.email, t.department, t.headline, t.avatarUrl]),
  )

  await insertAll(
    db,
    `INSERT OR IGNORE INTO courses (id, slug, title, summary, category, level, status, instructor_id, thumbnail_url, assignment_count, completion_percent, position, created_at, updated_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    SEED_COURSES.map((c) => [
      c.id,
      c.slug,
      c.title,
      c.summary,
      c.category,
      c.level,
      c.status,
      c.instructorId,
      c.thumbnailUrl,
      c.assignmentCount,
      c.completionPercent,
      c.position,
      SEED_TIME,
      c.updatedAt,
      c.publishedAt,
    ]),
  )

  const sections: unknown[][] = []
  const chapters: unknown[][] = []
  const lessons: SeedLesson[] = []

  for (const [courseId, spec] of Object.entries(CURRICULUM_SPECS)) {
    spec.modules.forEach((module, mi) => {
      const sectionId = `sec-${courseId}-${mi + 1}`
      sections.push([sectionId, courseId, module.title, mi, SEED_TIME, SEED_TIME])
      module.chapters.forEach((chapter, ci) => {
        const chapterId = `ch-${courseId}-${mi + 1}-${ci + 1}`
        chapters.push([chapterId, courseId, sectionId, chapter.title, ci, SEED_TIME, SEED_TIME])
        chapter.lessons.forEach((title, li) => {
          lessons.push({
            id: `les-${courseId}-${mi + 1}-${ci + 1}-${li + 1}`,
            courseId,
            sectionId,
            chapterId,
            chapterTitle: chapter.title,
            title,
            kind: 'VIDEO',
            position: li,
            estimatedMinutes: 35 + ((mi + ci + li) % 4) * 10,
            status: 'PUBLISHED',
            mediaStatus: 'READY',
            isPreview: mi === 0 && ci === 0 && li === 0,
          })
        })
      })
    })

    // The last N lectures of a course start as drafts; guard against zero,
    // because slice(-0) is slice(0) and would draft the whole course.
    if (spec.drafts > 0) {
      lessons
        .filter((l) => l.courseId === courseId)
        .slice(-spec.drafts)
        .forEach((lesson) => {
          lesson.status = 'DRAFT'
          lesson.mediaStatus = 'NONE'
        })
    }
  }

  await insertAll(
    db,
    `INSERT OR IGNORE INTO curriculum_sections (id, course_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    sections,
  )
  await insertAll(
    db,
    `INSERT OR IGNORE INTO curriculum_chapters (id, course_id, section_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    chapters,
  )

  const resources: unknown[][] = []
  for (const lesson of lessons) {
    if (lesson.status === 'PUBLISHED') {
      const h = hash(lesson.id)
      if (h % 3 === 0) {
        resources.push([`res-${lesson.id}-1`, lesson.id, `Slides — ${lesson.chapterTitle}`, 'SLIDES', null, 900_000 + (h % 1_600_000), 0, SEED_TIME])
      }
      if (h % 4 === 0) {
        resources.push([`res-${lesson.id}-2`, lesson.id, 'Reference reading', 'LINK', 'https://skybrary.aero/', null, 1, SEED_TIME])
      }
    }
  }

  await insertAll(
    db,
    `INSERT OR IGNORE INTO lessons (id, course_id, section_id, chapter_id, title, kind, position, estimated_minutes, status, media_status, is_preview, body, available_from, available_until, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
    lessons.map((l) => [
      l.id,
      l.courseId,
      l.sectionId,
      l.chapterId,
      l.title,
      l.kind,
      l.position,
      l.estimatedMinutes,
      l.status,
      l.mediaStatus,
      l.isPreview ? 1 : 0,
      l.status === 'PUBLISHED' ? SEED_TIME : null,
      SEED_TIME,
      SEED_TIME,
    ]),
  )

  await insertAll(
    db,
    `INSERT OR IGNORE INTO lesson_resources (id, lesson_id, title, kind, external_url, size_bytes, position, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    resources,
  )

  await insertAll(
    db,
    `INSERT OR IGNORE INTO subjects (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    SEED_SUBJECTS.map((s) => [s.id, s.name, s.description, s.status, SEED_TIME, at(s.updatedAt)]),
  )

  const subjectCourses: unknown[][] = []
  const topics: unknown[][] = []
  const syllabusLessons: unknown[][] = []
  const links: unknown[][] = []

  SEED_SUBJECTS.forEach((subject, si) => {
    subject.courseIds.forEach((courseId, ci) => subjectCourses.push([subject.id, courseId, ci]))
    subject.topics.forEach((topic, ti) => {
      const topicId = `top-${subject.id}-${ti + 1}`
      topics.push([topicId, subject.id, topic.title, topic.description, ti, SEED_TIME, SEED_TIME])
      topic.lessons.forEach((lesson, li) => {
        const lessonId = `sls-${subject.id}-${ti + 1}-${li + 1}`
        syllabusLessons.push([lessonId, topicId, lesson.title, lesson.description, li, SEED_TIME, SEED_TIME])
        if (lesson.courseId && lesson.lectureId) {
          links.push([`lnk-${si + 1}-${ti + 1}-${li + 1}`, lessonId, lesson.courseId, lesson.lectureId, 0])
        }
      })
    })
  })

  await insertAll(db, `INSERT OR IGNORE INTO subject_courses (subject_id, course_id, position) VALUES (?, ?, ?)`, subjectCourses)
  await insertAll(
    db,
    `INSERT OR IGNORE INTO subject_topics (id, subject_id, title, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    topics,
  )
  await insertAll(
    db,
    `INSERT OR IGNORE INTO subject_lessons (id, topic_id, title, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    syllabusLessons,
  )
  await insertAll(
    db,
    `INSERT OR IGNORE INTO subject_lesson_lectures (id, subject_lesson_id, course_id, lecture_id, position) VALUES (?, ?, ?, ?, ?)`,
    links,
  )

  await db
    .prepare(`INSERT INTO meta (key, value) VALUES ('seed_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(SEED_VERSION)
    .run()
}
