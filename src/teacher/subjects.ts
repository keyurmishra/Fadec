/*
  Academic subjects and their syllabus.

  The subject layer sits above the existing course curriculum:

    Subject → topic (unit) → lesson → course lecture(s)

  A lecture is never copied. The link table points at a lecture that already
  lives in one of the teacher's courses, so editing notes, resources,
  availability or publish state in the lecture builder is reflected in the
  subject syllabus and on every screen at once. That is also why a subject can
  belong to several training courses without duplicating a single record.

  Ownership is decided by course association: a subject is visible to a teacher
  only when at least one of its courses is theirs. A subject, topic or lesson
  outside that set answers exactly like a missing one, which is the project's
  established 404 policy for cross-teacher access.

  Like the other fixtures these rows live for the life of the Worker isolate.
  Restarting the dev server resets them. Phase 3 replaces this module with D1
  tables shaped like the types below.
*/
import type {
  SubjectCourseDTO,
  SubjectDetailDTO,
  SubjectLectureRefDTO,
  SubjectLessonDTO,
  SubjectStatus,
  SubjectSummaryDTO,
  SubjectTopicDTO,
  SubjectValidationDTO,
  StudentSubjectDetailDTO,
  StudentSubjectLectureDTO,
  StudentSubjectSummaryDTO,
} from '../contracts/teaching'
import { courseForTeacher, coursesForTeacher, publicCourse } from './fixtures'
import { addChapter, addLesson, addSection, outlineFor } from './curriculum'
import { lectureDetail, publishedLecture } from './lectures'

const seedTime = '2026-09-12T10:00:00.000Z'

type SubjectRow = {
  id: string
  name: string
  description: string
  status: SubjectStatus
  /** Training courses this subject is taught within. Many-to-many by design. */
  courseIds: string[]
  createdAt: string
  updatedAt: string
}

type TopicRow = { id: string; subjectId: string; title: string; description: string; position: number; createdAt: string; updatedAt: string }

type SyllabusLessonRow = { id: string; topicId: string; title: string; description: string; position: number; createdAt: string; updatedAt: string }

/** One lecture delivering one syllabus lesson. No lecture fields are stored here. */
type LectureLinkRow = { id: string; lessonId: string; courseId: string; lectureId: string; position: number }

type Seed = {
  id: string
  name: string
  description: string
  status: SubjectStatus
  updatedAt: string
  courseIds: string[]
  topics: Array<{
    title: string
    description: string
    /** `lectureId` points at an existing course lecture from the curriculum seeds. */
    lessons: Array<{ title: string; description: string; courseId?: string; lectureId?: string }>
  }>
}

/*
  The five subjects are the catalogue the brief fixes. The topic and lesson
  structure below is SAMPLE content for testing the workflow: it reuses lecture
  titles that already exist in the course curricula, and every description is
  written as a sample. It is not an official syllabus, examination standard or
  regulatory reference.
*/
const SEED_SUBJECTS: Seed[] = [
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

const subjects: SubjectRow[] = []
const topics: TopicRow[] = []
const syllabusLessons: SyllabusLessonRow[] = []
const lectureLinks: LectureLinkRow[] = []

SEED_SUBJECTS.forEach((seed, si) => {
  subjects.push({
    id: seed.id,
    name: seed.name,
    description: seed.description,
    status: seed.status,
    courseIds: [...seed.courseIds],
    createdAt: seedTime,
    updatedAt: new Date(seed.updatedAt).toISOString(),
  })
  seed.topics.forEach((topic, ti) => {
    const topicId = `top-${seed.id}-${ti + 1}`
    topics.push({
      id: topicId,
      subjectId: seed.id,
      title: topic.title,
      description: topic.description,
      position: ti,
      createdAt: seedTime,
      updatedAt: seedTime,
    })
    topic.lessons.forEach((lesson, li) => {
      const lessonId = `sls-${seed.id}-${ti + 1}-${li + 1}`
      syllabusLessons.push({
        id: lessonId,
        topicId,
        title: lesson.title,
        description: lesson.description,
        position: li,
        createdAt: seedTime,
        updatedAt: seedTime,
      })
      if (lesson.courseId && lesson.lectureId) {
        lectureLinks.push({
          id: `lnk-${si + 1}-${ti + 1}-${li + 1}`,
          lessonId,
          courseId: lesson.courseId,
          lectureId: lesson.lectureId,
          position: 0,
        })
      }
    })
  })
})

/* ------------------------------ ownership ------------------------------- */

const ownedCourseIds = (teacherId: string) => new Set(coursesForTeacher(teacherId).map((c) => c.id))

const visibleTo = (teacherId: string, subject: SubjectRow) => {
  const ids = ownedCourseIds(teacherId)
  return subject.courseIds.some((id) => ids.has(id))
}

function subjectForTeacher(teacherId: string, subjectId: string): SubjectRow | null {
  const row = subjects.find((s) => s.id === subjectId)
  return row && visibleTo(teacherId, row) ? row : null
}

function topicForTeacher(teacherId: string, topicId: string): TopicRow | null {
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return null
  return subjectForTeacher(teacherId, topic.subjectId) ? topic : null
}

function syllabusLessonForTeacher(teacherId: string, lessonId: string): SyllabusLessonRow | null {
  const lesson = syllabusLessons.find((l) => l.id === lessonId)
  if (!lesson) return null
  const topic = topics.find((t) => t.id === lesson.topicId)
  if (!topic) return null
  return subjectForTeacher(teacherId, topic.subjectId) ? lesson : null
}

function touchSubject(subjectId: string) {
  const row = subjects.find((s) => s.id === subjectId)
  if (row) row.updatedAt = new Date().toISOString()
}

/* -------------------------------- reading -------------------------------- */

function lectureRefs(teacherId: string, syllabusLessonId: string): SubjectLectureRefDTO[] {
  return lectureLinks
    .filter((link) => link.lessonId === syllabusLessonId)
    .sort((a, b) => a.position - b.position)
    .flatMap((link) => {
      const detail = lectureDetail(teacherId, link.lectureId)
      if (!detail) return []
      return [
        {
          id: detail.id,
          courseId: detail.courseId,
          courseTitle: detail.courseTitle,
          title: detail.title,
          kind: detail.kind,
          status: detail.status,
          mediaStatus: detail.mediaStatus,
          estimatedMinutes: detail.estimatedMinutes,
          resourceCount: detail.resourceCount,
          updatedAt: detail.updatedAt,
        },
      ]
    })
}

function courseRefs(teacherId: string, subject: SubjectRow): SubjectCourseDTO[] {
  return subject.courseIds.flatMap((id) => {
    const course = courseForTeacher(teacherId, id)
    return course ? [{ id: course.id, title: course.title, status: course.status }] : []
  })
}

function validationFor(subject: SubjectRow, topicDTOs: SubjectTopicDTO[], courses: SubjectCourseDTO[]): SubjectValidationDTO {
  const lessons = topicDTOs.flatMap((t) => t.lessons)
  const requirements: SubjectValidationDTO['requirements'] = [
    { key: 'name', label: 'Subject name', satisfied: subject.name.trim().length >= 2, detail: subject.name.trim().length >= 2 ? undefined : 'Give the subject a name.' },
    {
      key: 'description',
      label: 'Subject description',
      satisfied: subject.description.trim().length >= 30,
      detail: subject.description.trim().length >= 30 ? undefined : 'Write at least 30 characters about what the subject covers.',
    },
    {
      key: 'course',
      label: 'Taught within a training course',
      satisfied: courses.length > 0,
      detail: courses.length ? undefined : 'Associate the subject with at least one of your courses.',
    },
    {
      key: 'topic',
      label: 'At least one topic',
      satisfied: topicDTOs.length > 0,
      detail: topicDTOs.length ? undefined : 'Add a topic, then add lessons to it.',
    },
    {
      key: 'lesson',
      label: 'At least one lesson',
      satisfied: lessons.length > 0,
      detail: lessons.length ? undefined : 'Add a lesson to a topic.',
    },
  ]
  return { canPublish: requirements.every((r) => r.satisfied), requirements }
}

function build(teacherId: string, subject: SubjectRow): SubjectDetailDTO {
  const topicDTOs: SubjectTopicDTO[] = topics
    .filter((t) => t.subjectId === subject.id)
    .sort((a, b) => a.position - b.position)
    .map((topic) => ({
      id: topic.id,
      subjectId: topic.subjectId,
      title: topic.title,
      description: topic.description,
      position: topic.position,
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
      lessons: syllabusLessons
        .filter((l) => l.topicId === topic.id)
        .sort((a, b) => a.position - b.position)
        .map<SubjectLessonDTO>((lesson) => ({
          id: lesson.id,
          topicId: lesson.topicId,
          title: lesson.title,
          description: lesson.description,
          position: lesson.position,
          createdAt: lesson.createdAt,
          updatedAt: lesson.updatedAt,
          lectures: lectureRefs(teacherId, lesson.id),
        })),
    }))

  const allLectures = topicDTOs.flatMap((t) => t.lessons.flatMap((l) => l.lectures))
  const published = allLectures.filter((l) => l.status === 'PUBLISHED')
  const courses = courseRefs(teacherId, subject)
  const lastLectureUpdatedAt = allLectures.reduce<string | null>((latest, l) => (!latest || l.updatedAt > latest ? l.updatedAt : latest), null)

  return {
    id: subject.id,
    name: subject.name,
    description: subject.description,
    status: subject.status,
    topicCount: topicDTOs.length,
    lessonCount: topicDTOs.reduce((n, t) => n + t.lessons.length, 0),
    lectureCount: allLectures.length,
    publishedLectureCount: published.length,
    draftLectureCount: allLectures.length - published.length,
    courses,
    lastLectureUpdatedAt,
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
    topics: topicDTOs,
    publish: validationFor(subject, topicDTOs, courses),
  }
}

const summarize = (detail: SubjectDetailDTO): SubjectSummaryDTO => ({
  id: detail.id,
  name: detail.name,
  description: detail.description,
  status: detail.status,
  topicCount: detail.topicCount,
  lessonCount: detail.lessonCount,
  lectureCount: detail.lectureCount,
  publishedLectureCount: detail.publishedLectureCount,
  draftLectureCount: detail.draftLectureCount,
  courses: detail.courses,
  lastLectureUpdatedAt: detail.lastLectureUpdatedAt,
  createdAt: detail.createdAt,
  updatedAt: detail.updatedAt,
})

export function subjectsForTeacher(teacherId: string): SubjectSummaryDTO[] {
  return subjects
    .filter((s) => visibleTo(teacherId, s))
    .map((s) => summarize(build(teacherId, s)))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function subjectDetail(teacherId: string, subjectId: string): SubjectDetailDTO | null {
  const row = subjectForTeacher(teacherId, subjectId)
  return row ? build(teacherId, row) : null
}

/* ------------------------------- subjects -------------------------------- */

export type SubjectPatch = { name?: string; description?: string; courseIds?: string[] }

export function createSubject(teacherId: string, input: { name: string; description: string; courseIds: string[] }): SubjectDetailDTO | null {
  const ids = ownedCourseIds(teacherId)
  if (!input.courseIds.length || input.courseIds.some((id) => !ids.has(id))) return null
  const now = new Date().toISOString()
  const row: SubjectRow = {
    id: `sub-${Date.now().toString(36)}`,
    name: input.name,
    description: input.description,
    status: 'DRAFT',
    courseIds: [...new Set(input.courseIds)],
    createdAt: now,
    updatedAt: now,
  }
  subjects.push(row)
  return build(teacherId, row)
}

export function updateSubject(teacherId: string, subjectId: string, patch: SubjectPatch): SubjectDetailDTO | null {
  const row = subjectForTeacher(teacherId, subjectId)
  if (!row) return null
  if (patch.name !== undefined) row.name = patch.name
  if (patch.description !== undefined) row.description = patch.description
  if (patch.courseIds !== undefined) {
    const ids = ownedCourseIds(teacherId)
    if (!patch.courseIds.length || patch.courseIds.some((id) => !ids.has(id))) return null
    row.courseIds = [...new Set(patch.courseIds)]
  }
  row.updatedAt = new Date().toISOString()
  return build(teacherId, row)
}

export function setSubjectStatus(teacherId: string, subjectId: string, status: SubjectStatus): SubjectDetailDTO | null {
  const row = subjectForTeacher(teacherId, subjectId)
  if (!row) return null
  row.status = status
  row.updatedAt = new Date().toISOString()
  return build(teacherId, row)
}

/* --------------------------------- topics -------------------------------- */

export function addTopic(teacherId: string, subjectId: string, input: { title: string; description: string }): SubjectDetailDTO | null {
  const subject = subjectForTeacher(teacherId, subjectId)
  if (!subject) return null
  const now = new Date().toISOString()
  topics.push({
    id: `top-${subjectId}-${Date.now().toString(36)}`,
    subjectId,
    title: input.title,
    description: input.description,
    position: topics.filter((t) => t.subjectId === subjectId).length,
    createdAt: now,
    updatedAt: now,
  })
  touchSubject(subjectId)
  return build(teacherId, subject)
}

export function updateTopic(teacherId: string, topicId: string, patch: { title?: string; description?: string }): SubjectDetailDTO | null {
  const topic = topicForTeacher(teacherId, topicId)
  if (!topic) return null
  if (patch.title !== undefined) topic.title = patch.title
  if (patch.description !== undefined) topic.description = patch.description
  topic.updatedAt = new Date().toISOString()
  touchSubject(topic.subjectId)
  const subject = subjectForTeacher(teacherId, topic.subjectId)
  return subject ? build(teacherId, subject) : null
}

export function deleteTopic(teacherId: string, topicId: string): SubjectDetailDTO | null {
  const topic = topicForTeacher(teacherId, topicId)
  if (!topic) return null
  const lessonIds = new Set(syllabusLessons.filter((l) => l.topicId === topicId).map((l) => l.id))
  for (let i = lectureLinks.length - 1; i >= 0; i--) if (lessonIds.has(lectureLinks[i].lessonId)) lectureLinks.splice(i, 1)
  for (let i = syllabusLessons.length - 1; i >= 0; i--) if (syllabusLessons[i].topicId === topicId) syllabusLessons.splice(i, 1)
  topics.splice(topics.indexOf(topic), 1)
  resequence(topics.filter((t) => t.subjectId === topic.subjectId))
  touchSubject(topic.subjectId)
  const subject = subjectForTeacher(teacherId, topic.subjectId)
  return subject ? build(teacherId, subject) : null
}

/* -------------------------------- lessons -------------------------------- */

export function addSyllabusLesson(teacherId: string, topicId: string, input: { title: string; description: string }): SubjectDetailDTO | null {
  const topic = topicForTeacher(teacherId, topicId)
  if (!topic) return null
  const now = new Date().toISOString()
  syllabusLessons.push({
    id: `sls-${topicId}-${Date.now().toString(36)}`,
    topicId,
    title: input.title,
    description: input.description,
    position: syllabusLessons.filter((l) => l.topicId === topicId).length,
    createdAt: now,
    updatedAt: now,
  })
  touchSubject(topic.subjectId)
  const subject = subjectForTeacher(teacherId, topic.subjectId)
  return subject ? build(teacherId, subject) : null
}

export function updateSyllabusLesson(
  teacherId: string,
  lessonId: string,
  patch: { title?: string; description?: string },
): SubjectDetailDTO | null {
  const lesson = syllabusLessonForTeacher(teacherId, lessonId)
  if (!lesson) return null
  if (patch.title !== undefined) lesson.title = patch.title
  if (patch.description !== undefined) lesson.description = patch.description
  lesson.updatedAt = new Date().toISOString()
  const topic = topics.find((t) => t.id === lesson.topicId)
  if (!topic) return null
  touchSubject(topic.subjectId)
  const subject = subjectForTeacher(teacherId, topic.subjectId)
  return subject ? build(teacherId, subject) : null
}

export function deleteSyllabusLesson(teacherId: string, lessonId: string): SubjectDetailDTO | null {
  const lesson = syllabusLessonForTeacher(teacherId, lessonId)
  if (!lesson) return null
  for (let i = lectureLinks.length - 1; i >= 0; i--) if (lectureLinks[i].lessonId === lessonId) lectureLinks.splice(i, 1)
  syllabusLessons.splice(syllabusLessons.indexOf(lesson), 1)
  resequence(syllabusLessons.filter((l) => l.topicId === lesson.topicId))
  const topic = topics.find((t) => t.id === lesson.topicId)
  if (!topic) return null
  touchSubject(topic.subjectId)
  const subject = subjectForTeacher(teacherId, topic.subjectId)
  return subject ? build(teacherId, subject) : null
}

/* -------------------------------- ordering ------------------------------- */

const resequence = <T extends { position: number }>(rows: T[]) => {
  rows.sort((a, b) => a.position - b.position).forEach((r, i) => (r.position = i))
}

function swap<T extends { id: string; position: number }>(rows: T[], id: string, delta: number) {
  const i = rows.findIndex((r) => r.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= rows.length) return false
  ;[rows[i].position, rows[j].position] = [rows[j].position, rows[i].position]
  return true
}

export type SubjectMoveResult = { moved: boolean; detail: SubjectDetailDTO }

export function moveSubjectItem(
  teacherId: string,
  subjectId: string,
  kind: 'TOPIC' | 'LESSON',
  id: string,
  direction: 'UP' | 'DOWN',
): SubjectMoveResult | null {
  const subject = subjectForTeacher(teacherId, subjectId)
  if (!subject) return null
  const detail = () => build(teacherId, subject)
  const delta = direction === 'UP' ? -1 : 1

  if (kind === 'TOPIC') {
    const moved = swap(
      topics.filter((t) => t.subjectId === subjectId).sort((a, b) => a.position - b.position),
      id,
      delta,
    )
    if (moved) touchSubject(subjectId)
    return { moved, detail: detail() }
  }

  const lesson = syllabusLessons.find((l) => l.id === id)
  if (!lesson) return { moved: false, detail: detail() }
  const moved = swap(
    syllabusLessons.filter((l) => l.topicId === lesson.topicId).sort((a, b) => a.position - b.position),
    id,
    delta,
  )
  if (moved) touchSubject(subjectId)
  return { moved, detail: detail() }
}

/* ------------------------------ lectures ------------------------------- */

export type LectureAttachResult =
  | { status: 'OK'; detail: SubjectDetailDTO }
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT' }

/**
 * Link an existing lecture to a syllabus lesson. A lecture can deliver only one
 * syllabus lesson: attaching it twice would let two subjects edit one row.
 */
export function attachExistingLecture(teacherId: string, lessonId: string, lectureId: string): LectureAttachResult {
  const lesson = syllabusLessonForTeacher(teacherId, lessonId)
  if (!lesson) return { status: 'NOT_FOUND' }
  const lecture = lectureDetail(teacherId, lectureId)
  if (!lecture) return { status: 'NOT_FOUND' }
  if (lectureLinks.some((l) => l.lectureId === lectureId)) return { status: 'CONFLICT' }

  const topic = topics.find((t) => t.id === lesson.topicId)
  if (!topic) return { status: 'NOT_FOUND' }
  lectureLinks.push({
    id: `lnk-${Date.now().toString(36)}`,
    lessonId,
    courseId: lecture.courseId,
    lectureId,
    position: lectureLinks.filter((l) => l.lessonId === lessonId).length,
  })
  touchSubject(topic.subjectId)
  const subject = subjectForTeacher(teacherId, topic.subjectId)
  return subject ? { status: 'OK', detail: build(teacherId, subject) } : { status: 'NOT_FOUND' }
}

/**
 * The chapter a new lecture is placed in: a chapter named after the topic
 * inside a section named after the subject, created on first use. The course
 * builder sees exactly the same placement, which is the point — a subject
 * lecture is a course lecture, not a parallel record.
 */
function ensureChapter(courseId: string, subjectName: string, topicTitle: string) {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  const outline = outlineFor(courseId)

  const section = outline.find((s) => same(s.title, subjectName))
  if (!section) {
    const sectionId = addSection(courseId, subjectName)
    return addChapter(courseId, sectionId, topicTitle)
  }

  const chapter = section.chapters.find((c) => same(c.title, topicTitle))
  if (chapter) return chapter.id
  return addChapter(courseId, section.id, topicTitle)
}

export type LectureCreateResult =
  | { status: 'OK'; detail: SubjectDetailDTO; lectureId: string }
  | { status: 'NOT_FOUND' }

export function createLectureForLesson(
  teacherId: string,
  lessonId: string,
  input: { courseId: string; kind: 'VIDEO' | 'TEXT'; estimatedMinutes: number },
): LectureCreateResult {
  const lesson = syllabusLessonForTeacher(teacherId, lessonId)
  if (!lesson) return { status: 'NOT_FOUND' }
  const course = courseForTeacher(teacherId, input.courseId)
  if (!course) return { status: 'NOT_FOUND' }

  const topic = topics.find((t) => t.id === lesson.topicId)
  if (!topic) return { status: 'NOT_FOUND' }
  const subject = subjectForTeacher(teacherId, topic.subjectId)
  if (!subject) return { status: 'NOT_FOUND' }

  const chapterId = ensureChapter(course.id, subject.name, topic.title)
  if (!chapterId) return { status: 'NOT_FOUND' }

  const lectureId = addLesson(course.id, chapterId, {
    title: lesson.title,
    kind: input.kind,
    estimatedMinutes: input.estimatedMinutes,
  })
  if (!lectureId) return { status: 'NOT_FOUND' }

  lectureLinks.push({
    id: `lnk-${Date.now().toString(36)}`,
    lessonId,
    courseId: course.id,
    lectureId,
    position: lectureLinks.filter((l) => l.lessonId === lessonId).length,
  })
  touchSubject(subject.id)
  return { status: 'OK', detail: build(teacherId, subject), lectureId }
}

/** Unlink a lecture. The lecture itself stays in the course curriculum. */
export function detachLecture(teacherId: string, lessonId: string, lectureId: string): LectureAttachResult {
  const lesson = syllabusLessonForTeacher(teacherId, lessonId)
  if (!lesson) return { status: 'NOT_FOUND' }
  const index = lectureLinks.findIndex((l) => l.lessonId === lessonId && l.lectureId === lectureId)
  if (index < 0) return { status: 'NOT_FOUND' }
  lectureLinks.splice(index, 1)
  resequence(lectureLinks.filter((l) => l.lessonId === lessonId))
  const topic = topics.find((t) => t.id === lesson.topicId)
  if (!topic) return { status: 'NOT_FOUND' }
  touchSubject(topic.subjectId)
  const subject = subjectForTeacher(teacherId, topic.subjectId)
  return subject ? { status: 'OK', detail: build(teacherId, subject) } : { status: 'NOT_FOUND' }
}

/* --------------------------- student catalogue --------------------------- */

const studentLecture = (lectureId: string): StudentSubjectLectureDTO | null => {
  const lecture = publishedLecture(lectureId)
  if (!lecture) return null
  return {
    id: lecture.id,
    courseId: lecture.courseId,
    courseTitle: lecture.courseTitle,
    title: lecture.title,
    kind: lecture.kind,
    estimatedMinutes: lecture.estimatedMinutes,
    resources: lecture.resources,
  }
}

/**
 * Published subjects only, and inside them only lessons that have at least one
 * published lecture. Draft topics, lessons and lectures never reach this shape.
 */
export function publishedSubjectDetail(subjectId: string): StudentSubjectDetailDTO | null {
  const subject = subjects.find((s) => s.id === subjectId)
  if (!subject || subject.status !== 'PUBLISHED') return null

  const courses = subject.courseIds.flatMap((id) => {
    const course = publicCourse(id)
    return course && course.status === 'PUBLISHED' ? [{ id: course.id, title: course.title }] : []
  })

  const topicDTOs = topics
    .filter((t) => t.subjectId === subject.id)
    .sort((a, b) => a.position - b.position)
    .flatMap((topic) => {
      const lessons = syllabusLessons
        .filter((l) => l.topicId === topic.id)
        .sort((a, b) => a.position - b.position)
        .flatMap((lesson) => {
          const lectures = lectureLinks
            .filter((link) => link.lessonId === lesson.id)
            .sort((a, b) => a.position - b.position)
            .flatMap((link) => {
              const lecture = studentLecture(link.lectureId)
              return lecture ? [lecture] : []
            })
          return lectures.length ? [{ id: lesson.id, title: lesson.title, description: lesson.description, lectures }] : []
        })
      if (!lessons.length) return []
      return [{ id: topic.id, title: topic.title, description: topic.description, lessons }]
    })

  return {
    id: subject.id,
    name: subject.name,
    description: subject.description,
    topicCount: topicDTOs.length,
    lessonCount: topicDTOs.reduce((n, t) => n + t.lessons.length, 0),
    lectureCount: topicDTOs.reduce((n, t) => n + t.lessons.reduce((m, l) => m + l.lectures.length, 0), 0),
    courses,
    topics: topicDTOs,
  }
}

export function publishedSubjects(): StudentSubjectSummaryDTO[] {
  return subjects
    .filter((s) => s.status === 'PUBLISHED')
    .flatMap((s) => {
      const detail = publishedSubjectDetail(s.id)
      if (!detail) return []
      return [
        {
          id: detail.id,
          name: detail.name,
          description: detail.description,
          topicCount: detail.topicCount,
          lessonCount: detail.lessonCount,
          lectureCount: detail.lectureCount,
          courses: detail.courses,
        },
      ]
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
