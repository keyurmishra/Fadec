/*
  Curriculum fixtures: modules (sections) → chapters → lectures.

  These rows are mutable for the life of the Worker isolate, so add / reorder /
  delete behave like a real write path (including the 404s for someone else's
  course) while D1 does not exist yet. Restarting the dev server resets them.

  Ordering lives in `position`, 0-based and unique per parent. Moving a row swaps
  positions with its neighbour rather than deleting and recreating anything.
*/
import type { PublishRequirementDTO, PublishValidationDTO } from '../contracts/catalog'
import type { TeacherLessonDTO, TeacherOutlineSection } from '../contracts/teaching'

type ChapterSeed = { title: string; lessons: string[] }
type ModuleSeed = { title: string; chapters: ChapterSeed[] }

const SPECS: Record<string, { modules: ModuleSeed[]; drafts: number }> = {
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

type SectionRow = { id: string; courseId: string; title: string; position: number }
type ChapterRow = { id: string; sectionId: string; title: string; position: number }
type LessonRow = {
  id: string
  sectionId: string
  chapterId: string | null
  title: string
  kind: 'VIDEO' | 'TEXT'
  position: number
  estimatedMinutes: number
  status: 'DRAFT' | 'PUBLISHED'
  mediaStatus: 'READY' | 'PROCESSING' | 'NONE'
  isPreview: boolean
}

const seedTime = '2026-09-12T10:00:00.000Z'

const sections: SectionRow[] = []
const chapters: ChapterRow[] = []
const lessons: LessonRow[] = []
const seeded = new Set<string>()

/** Build a course's curriculum once, on first access. */
function seed(courseId: string) {
  if (seeded.has(courseId)) return
  seeded.add(courseId)
  const spec = SPECS[courseId]
  if (!spec) return

  const all: LessonRow[] = []
  spec.modules.forEach((m, mi) => {
    const sectionId = `sec-${courseId}-${mi + 1}`
    sections.push({ id: sectionId, courseId, title: m.title, position: mi })
    m.chapters.forEach((c, ci) => {
      const chapterId = `ch-${courseId}-${mi + 1}-${ci + 1}`
      chapters.push({ id: chapterId, sectionId, title: c.title, position: ci })
      c.lessons.forEach((title, li) => {
        all.push({
          id: `les-${courseId}-${mi + 1}-${ci + 1}-${li + 1}`,
          sectionId,
          chapterId,
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

  // The last N lectures of a course are still drafts, which is what the
  // publish checklist and the "lectures in draft" count report. Guard against
  // zero: slice(-0) is slice(0), which would mark the whole course as draft.
  if (spec.drafts > 0) {
    all.slice(-spec.drafts).forEach((l) => {
      l.status = 'DRAFT'
      l.mediaStatus = 'NONE'
    })
  }
  lessons.push(...all)
}

const once = (courseId: string) => {
  seed(courseId)
  return sections.some((s) => s.courseId === courseId)
}

export function courseCounts(courseId: string) {
  once(courseId)
  const ids = new Set(sections.filter((s) => s.courseId === courseId).map((s) => s.id))
  const rows = lessons.filter((l) => ids.has(l.sectionId))
  return {
    sectionCount: sections.filter((s) => s.courseId === courseId).length,
    lectureCount: rows.length,
    draftLectureCount: rows.filter((l) => l.status === 'DRAFT').length,
  }
}

export function publishedLessonCount(courseId: string) {
  once(courseId)
  const ids = new Set(sections.filter((s) => s.courseId === courseId).map((s) => s.id))
  return lessons.filter((l) => ids.has(l.sectionId) && l.status === 'PUBLISHED').length
}

const toLessonDTO = (l: LessonRow): TeacherLessonDTO => ({
  id: l.id,
  sectionId: l.sectionId,
  chapterId: l.chapterId,
  title: l.title,
  kind: l.kind,
  position: l.position,
  isPreview: l.isPreview,
  isLocked: false,
  estimatedMinutes: l.estimatedMinutes,
  mediaAssetId: l.mediaStatus === 'READY' ? `asset-${l.id}` : null,
  body: l.kind === 'TEXT' ? '' : null,
  resources: [],
  status: l.status,
  mediaStatus: l.mediaStatus,
  createdAt: seedTime,
  updatedAt: seedTime,
})

export function outlineFor(courseId: string): TeacherOutlineSection[] {
  once(courseId)
  return sections
    .filter((s) => s.courseId === courseId)
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      id: s.id,
      courseId: s.courseId,
      title: s.title,
      position: s.position,
      createdAt: seedTime,
      updatedAt: seedTime,
      chapters: chapters
        .filter((c) => c.sectionId === s.id)
        .sort((a, b) => a.position - b.position)
        .map((c) => ({
          id: c.id,
          sectionId: s.id,
          title: c.title,
          position: c.position,
          createdAt: seedTime,
          updatedAt: seedTime,
          lessons: lessons
            .filter((l) => l.chapterId === c.id)
            .sort((a, b) => a.position - b.position)
            .map(toLessonDTO),
        })),
    }))
}

/* ------------------------------- mutations ------------------------------- */

const resequence = <T extends { position: number }>(rows: T[]) => {
  rows.sort((a, b) => a.position - b.position).forEach((r, i) => (r.position = i))
}

export function addSection(courseId: string, title: string) {
  once(courseId)
  const id = `sec-${courseId}-${Date.now()}`
  sections.push({ id, courseId, title, position: sections.filter((s) => s.courseId === courseId).length })
  return id
}

export function deleteSection(courseId: string, sectionId: string) {
  const section = sections.find((s) => s.id === sectionId && s.courseId === courseId)
  if (!section) return false
  const chapterIds = chapters.filter((c) => c.sectionId === sectionId).map((c) => c.id)
  for (let i = lessons.length - 1; i >= 0; i--) {
    if (lessons[i].sectionId === sectionId || (lessons[i].chapterId && chapterIds.includes(lessons[i].chapterId!))) lessons.splice(i, 1)
  }
  for (let i = chapters.length - 1; i >= 0; i--) if (chapters[i].sectionId === sectionId) chapters.splice(i, 1)
  sections.splice(sections.indexOf(section), 1)
  resequence(sections.filter((s) => s.courseId === courseId))
  return true
}

export function addChapter(courseId: string, sectionId: string, title: string) {
  const section = sections.find((s) => s.id === sectionId && s.courseId === courseId)
  if (!section) return null
  const id = `ch-${sectionId}-${Date.now()}`
  chapters.push({ id, sectionId, title, position: chapters.filter((c) => c.sectionId === sectionId).length })
  return id
}

export function deleteChapter(courseId: string, chapterId: string) {
  const sectionIds = new Set(sections.filter((s) => s.courseId === courseId).map((s) => s.id))
  const chapter = chapters.find((c) => c.id === chapterId && sectionIds.has(c.sectionId))
  if (!chapter) return false
  for (let i = lessons.length - 1; i >= 0; i--) if (lessons[i].chapterId === chapterId) lessons.splice(i, 1)
  chapters.splice(chapters.indexOf(chapter), 1)
  resequence(chapters.filter((c) => c.sectionId === chapter.sectionId))
  return true
}

export function addLesson(courseId: string, chapterId: string, input: { title: string; kind: 'VIDEO' | 'TEXT'; estimatedMinutes: number }) {
  if (!sections.some((s) => s.courseId === courseId)) return null
  const chapter = chapters.find((c) => c.id === chapterId)
  if (!chapter) return null
  const id = `les-${chapterId}-${Date.now()}`
  lessons.push({
    id,
    sectionId: chapter.sectionId,
    chapterId,
    title: input.title,
    kind: input.kind,
    position: lessons.filter((l) => l.chapterId === chapterId).length,
    estimatedMinutes: input.estimatedMinutes,
    status: 'DRAFT',
    mediaStatus: 'NONE',
    isPreview: false,
  })
  return id
}

/** A lecture that belongs to this course, or null when it does not. */
function ownLesson(courseId: string, lessonId: string) {
  once(courseId)
  const sectionIds = new Set(sections.filter((s) => s.courseId === courseId).map((s) => s.id))
  return lessons.find((l) => l.id === lessonId && sectionIds.has(l.sectionId)) ?? null
}

/** Update the fields a teacher edits on one lecture. Returns false when absent. */
export function updateLessonRow(courseId: string, lessonId: string, patch: Partial<Pick<LessonRow, 'title' | 'estimatedMinutes' | 'isPreview' | 'kind'>>) {
  const row = ownLesson(courseId, lessonId)
  if (!row) return false
  Object.assign(row, patch)
  return true
}

/** Publish or return a single lecture to draft. */
export function setLessonStatus(courseId: string, lessonId: string, status: 'DRAFT' | 'PUBLISHED') {
  const row = ownLesson(courseId, lessonId)
  if (!row) return false
  row.status = status
  return true
}

export function deleteLesson(courseId: string, lessonId: string) {
  const sectionIds = new Set(sections.filter((s) => s.courseId === courseId).map((s) => s.id))
  const index = lessons.findIndex((l) => l.id === lessonId && sectionIds.has(l.sectionId))
  if (index < 0) return false
  const [row] = lessons.splice(index, 1)
  if (row.chapterId) resequence(lessons.filter((l) => l.chapterId === row.chapterId))
  return true
}

/** Swap a row with its neighbour inside its parent. Returns false at the ends. */
export function move(courseId: string, kind: 'SECTION' | 'CHAPTER' | 'LESSON', id: string, direction: 'UP' | 'DOWN') {
  if (!sections.some((s) => s.courseId === courseId)) return false
  const delta = direction === 'UP' ? -1 : 1

  if (kind === 'SECTION') {
    const siblings = sections.filter((s) => s.courseId === courseId).sort((a, b) => a.position - b.position)
    const i = siblings.findIndex((s) => s.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= siblings.length) return false
    ;[siblings[i].position, siblings[j].position] = [siblings[j].position, siblings[i].position]
    return true
  }

  if (kind === 'CHAPTER') {
    const sectionIds = new Set(sections.filter((s) => s.courseId === courseId).map((s) => s.id))
    const chapter = chapters.find((c) => c.id === id && sectionIds.has(c.sectionId))
    if (!chapter) return false
    const siblings = chapters.filter((c) => c.sectionId === chapter.sectionId).sort((a, b) => a.position - b.position)
    const i = siblings.findIndex((c) => c.id === id)
    const j = i + delta
    if (j < 0 || j >= siblings.length) return false
    ;[siblings[i].position, siblings[j].position] = [siblings[j].position, siblings[i].position]
    return true
  }

  const sectionIds = new Set(sections.filter((s) => s.courseId === courseId).map((s) => s.id))
  const lesson = lessons.find((l) => l.id === id && sectionIds.has(l.sectionId))
  if (!lesson) return false
  const siblings = lessons.filter((l) => l.chapterId === lesson.chapterId && l.sectionId === lesson.sectionId).sort((a, b) => a.position - b.position)
  const i = siblings.findIndex((l) => l.id === id)
  const j = i + delta
  if (j < 0 || j >= siblings.length) return false
  ;[siblings[i].position, siblings[j].position] = [siblings[j].position, siblings[i].position]
  return true
}

/* --------------------------- publish checklist --------------------------- */

export function publishValidation(
  course: { title: string; summary: string; instructor: unknown; thumbnailUrl: string | null },
  courseId: string,
): PublishValidationDTO {
  const outline = outlineFor(courseId)
  const sectionIds = new Set(outline.map((s) => s.id))
  const rows = lessons.filter((l) => sectionIds.has(l.sectionId))
  const publishedRows = rows.filter((l) => l.status === 'PUBLISHED')
  const mediaReady = publishedRows.every((l) => l.mediaStatus === 'READY')

  const requirements: PublishRequirementDTO[] = [
    { key: 'title', label: 'Course title', satisfied: course.title.trim().length > 2 },
    { key: 'description', label: 'Course description', satisfied: course.summary.trim().length >= 40, detail: 'Write a summary of at least 40 characters.' },
    { key: 'instructor', label: 'Assigned instructor', satisfied: !!course.instructor },
    { key: 'thumbnail', label: 'Course thumbnail', satisfied: !!course.thumbnailUrl, detail: 'Add a thumbnail image.' },
    { key: 'section', label: 'At least one module', satisfied: outline.length > 0, detail: 'Add a module, then a chapter and a lecture.' },
    {
      key: 'accessibleLesson',
      label: 'At least one published lecture',
      satisfied: publishedRows.length > 0,
      detail: publishedRows.length ? undefined : 'Lectures added in the builder start as drafts.',
    },
    { key: 'mediaReady', label: 'Published lectures have ready media', satisfied: mediaReady, detail: mediaReady ? undefined : 'One or more published lectures wait on processing.' },
  ]

  return { canPublish: requirements.every((r) => r.satisfied), requirements }
}
