/*
  The seeded assignments and submissions the marking queue starts with.

  Students do not have accounts yet (that is the student-portal phase), so a
  submission stores the student id and name it was handed in under. When real
  student auth lands, `student_user_id` is already the join key and the display
  name can move to the users table without changing these contracts.

  The rows are deliberately varied: open and closed windows, every late policy,
  pending work, a saved draft mark and released marks. That is what makes the
  queue, the filters and the draft-versus-published distinction testable rather
  than decorative.

  Seeding has its own marker so an existing catalogue database picks these rows
  up on the next start without re-running the course and subject seeds.
*/
import { insertAll } from './sql'

const SEED_VERSION = '2'

const at = (s: string) => new Date(s).toISOString()

type SeedAssignment = {
  id: string
  courseId: string
  title: string
  instructions: string
  opensAt: string
  dueAt: string
  latePolicy: 'BLOCK' | 'ALLOW' | 'MARK_LATE'
  attemptsAllowed: number
  maxScore: number
  allowFileUpload: boolean
  /** PUBLISHED assignments carry publishedAt; the window decides the rest. */
  publishedAt: string | null
}

const ASSIGNMENTS: SeedAssignment[] = [
  {
    id: 'a-01',
    courseId: 'crs-ppl',
    title: 'Navigation log: Bristol–Exeter',
    instructions:
      'Plan the VFR flight from Bristol (EGGD) to Exeter (EGTE). Submit a completed navigation log with headings, ground speeds, fuel and a diversion to Dunkeswell. Show your working for the wind triangle.',
    opensAt: at('2026-11-18T09:00:00Z'),
    dueAt: at('2026-11-27T17:00:00Z'),
    latePolicy: 'MARK_LATE',
    attemptsAllowed: 2,
    maxScore: 100,
    allowFileUpload: true,
    publishedAt: at('2026-11-10T10:00:00Z'),
  },
  {
    id: 'a-02',
    courseId: 'crs-ppl',
    title: 'Met briefing write-up',
    instructions:
      'Using the 06:00 charts and the TAFs for your base, write a 300-word briefing for a local training flight. Cover cloud base, visibility, wind and whether you would sign the flight out.',
    opensAt: at('2026-11-20T09:00:00Z'),
    dueAt: at('2026-12-02T17:00:00Z'),
    latePolicy: 'ALLOW',
    attemptsAllowed: 1,
    maxScore: 50,
    allowFileUpload: false,
    publishedAt: at('2026-11-12T09:00:00Z'),
  },
  {
    id: 'a-03',
    courseId: 'crs-ppl',
    title: 'Air law progress test 6',
    instructions:
      'Answer all twenty questions on rules of the air and airspace classification. Closed book, one attempt, and the window opens on 2 December.',
    opensAt: at('2026-12-02T17:00:00Z'),
    dueAt: at('2026-12-09T17:00:00Z'),
    latePolicy: 'BLOCK',
    attemptsAllowed: 1,
    maxScore: 40,
    allowFileUpload: false,
    publishedAt: at('2026-11-14T09:00:00Z'),
  },
  {
    id: 'a-04',
    courseId: 'crs-cpl',
    title: 'Performance and mass & balance',
    instructions:
      'Work the take-off and landing performance charts for the supplied loading case, then complete the mass and balance sheet. State the limiting factor and the margin you would brief to the captain.',
    opensAt: at('2026-11-20T09:00:00Z'),
    dueAt: at('2026-11-29T12:00:00Z'),
    latePolicy: 'MARK_LATE',
    attemptsAllowed: 2,
    maxScore: 100,
    allowFileUpload: true,
    publishedAt: at('2026-11-11T08:00:00Z'),
  },
  {
    id: 'a-05',
    courseId: 'crs-cpl',
    title: 'Flight planning case study',
    instructions:
      'Plan a commercial sector of your choice over 400 nm. Submit the operational flight plan, fuel policy calculation and a one-page threat-and-error summary for the route.',
    opensAt: at('2026-11-25T09:00:00Z'),
    dueAt: at('2026-12-06T12:00:00Z'),
    latePolicy: 'MARK_LATE',
    attemptsAllowed: 1,
    maxScore: 100,
    allowFileUpload: true,
    publishedAt: at('2026-11-18T09:00:00Z'),
  },
  {
    id: 'a-06',
    courseId: 'crs-cpl',
    title: 'Human performance essay',
    instructions:
      'Write 800 words on fatigue risk management in a two-crew operation. Use one occurrence you have studied and say what the crew could have done differently.',
    opensAt: at('2026-11-06T09:00:00Z'),
    dueAt: at('2026-11-20T12:00:00Z'),
    latePolicy: 'ALLOW',
    attemptsAllowed: 1,
    maxScore: 60,
    allowFileUpload: false,
    publishedAt: at('2026-10-30T09:00:00Z'),
  },
  {
    id: 'a-07',
    courseId: 'crs-a320',
    title: 'Hydraulics systems report',
    instructions:
      'Describe the green, blue and yellow hydraulic systems and the immediate actions for a GREEN + BLUE low pressure on approach. Include the affected systems and the landing distance implication.',
    opensAt: at('2026-11-20T09:00:00Z'),
    dueAt: at('2026-11-30T09:00:00Z'),
    latePolicy: 'MARK_LATE',
    attemptsAllowed: 2,
    maxScore: 80,
    allowFileUpload: true,
    publishedAt: at('2026-11-12T08:00:00Z'),
  },
  {
    id: 'a-08',
    courseId: 'crs-a320',
    title: 'Performance chart set',
    instructions:
      'Complete the take-off and landing chart exercises for the four supplied cases. Not yet published: the chart pack is being updated for the winter runway conditions.',
    opensAt: at('2026-12-01T09:00:00Z'),
    dueAt: at('2026-12-08T09:00:00Z'),
    latePolicy: 'BLOCK',
    attemptsAllowed: 1,
    maxScore: 60,
    allowFileUpload: false,
    publishedAt: null,
  },
  {
    id: 'a-09',
    courseId: 'crs-ir',
    title: 'Approach briefing pack',
    instructions:
      'Prepare a briefing pack for an ILS approach to minima at a regional airport of your choice. Cover the plate, the missed approach, the weather minima and the go-around decision point.',
    opensAt: at('2026-11-22T09:00:00Z'),
    dueAt: at('2026-12-03T13:00:00Z'),
    latePolicy: 'MARK_LATE',
    attemptsAllowed: 2,
    maxScore: 50,
    allowFileUpload: true,
    publishedAt: at('2026-11-15T09:00:00Z'),
  },
  {
    id: 'a-10',
    courseId: 'crs-ir',
    title: 'Simulator debrief write-up',
    instructions:
      'Write up the last LOFT session: what was flown, the two most useful learning points and one procedure you will practise before the next session.',
    opensAt: at('2026-11-08T09:00:00Z'),
    dueAt: at('2026-11-22T13:00:00Z'),
    latePolicy: 'BLOCK',
    attemptsAllowed: 1,
    maxScore: 40,
    allowFileUpload: false,
    publishedAt: at('2026-10-31T09:00:00Z'),
  },
]

type SeedSubmission = {
  id: string
  assignmentId: string
  studentUserId: string
  studentName: string
  submittedAt: string
  isLate?: boolean
  answerText: string
  fileName?: string | null
  /** A mark without a publication time is a saved draft. */
  score?: number | null
  feedback?: string
  publishedAt?: string | null
}

const SUBMISSIONS: SeedSubmission[] = [
  {
    id: 'sub-001',
    assignmentId: 'a-01',
    studentUserId: 'u-001',
    studentName: 'Priya Nair',
    submittedAt: at('2026-11-24T09:12:00Z'),
    answerText:
      'Navigation log attached. Track 232°M, wind 280/15, heading 226°M at 105 kt groundspeed. Fuel: 42 L trip plus 12 L reserve and 8 L diversion to Dunkeswell. The wind triangle is drawn on page 2.',
    fileName: 'bristol-exeter-navlog.pdf',
    score: 78,
    feedback: 'Accurate log and a sound diversion. Watch the reserve figure — it should be 45 minutes at cruise, not 30.',
    publishedAt: at('2026-11-25T08:00:00Z'),
  },
  {
    id: 'sub-002',
    assignmentId: 'a-01',
    studentUserId: 'u-002',
    studentName: 'Theo Bennett',
    submittedAt: at('2026-11-24T11:40:00Z'),
    answerText:
      'Log submitted. I planned 226°M and 108 kt groundspeed, with a fuel figure of 52 L total. I was not sure how to show the diversion, so I wrote it separately.',
  },
  {
    id: 'sub-003',
    assignmentId: 'a-01',
    studentUserId: 'u-003',
    studentName: 'Maya Okafor',
    submittedAt: at('2026-11-23T18:05:00Z'),
    answerText:
      'Complete log with wind triangle, fuel plan and a diversion to Dunkeswell. I also included a timing check at each waypoint and a note on the Bristol zone transit.',
    fileName: 'maya-eggd-egte.pdf',
    score: 84,
    feedback: 'Very tidy. The zone transit note is exactly what I want to see before a cross-country.',
  },
  {
    id: 'sub-004',
    assignmentId: 'a-01',
    studentUserId: 'u-004',
    studentName: 'Lucas Ferreira',
    submittedAt: at('2026-11-28T08:15:00Z'),
    isLate: true,
    answerText:
      'Sorry this is late — I could not get the wind data until Friday. Log attached, headings 228°M with 104 kt groundspeed. I have not done the diversion.',
    fileName: 'navlog-lucas.pdf',
  },
  {
    id: 'sub-005',
    assignmentId: 'a-01',
    studentUserId: 'u-005',
    studentName: 'Hana Sato',
    submittedAt: at('2026-11-22T16:30:00Z'),
    answerText:
      'Nav log and wind triangle attached. Track 232°M, heading 227°M, groundspeed 106 kt, total fuel 56 L including a 45-minute reserve. Diversion to Dunkeswell planned at 4,000 ft.',
    fileName: 'hana-nav-log.pdf',
    score: 92,
    feedback: 'Exemplary. This is the standard I would sign off for a first solo cross-country.',
    publishedAt: at('2026-11-25T08:00:00Z'),
  },
  {
    id: 'sub-006',
    assignmentId: 'a-01',
    studentUserId: 'u-006',
    studentName: 'Daniel Kim',
    submittedAt: at('2026-11-26T21:10:00Z'),
    answerText:
      'I have attached the log. My heading was 230°M and I used 50 L of fuel. I could not work out the diversion leg.',
    fileName: 'daniel-navlog.xlsx',
  },
  {
    id: 'sub-007',
    assignmentId: 'a-02',
    studentUserId: 'u-001',
    studentName: 'Priya Nair',
    submittedAt: at('2026-11-25T07:20:00Z'),
    answerText:
      'Briefing for a local at Bristol: FEW020, 8 km visibility, wind 250/12, QNH 1018. I would sign it out with a caution for the shower activity moving in from the west after 14:00.',
  },
  {
    id: 'sub-008',
    assignmentId: 'a-02',
    studentUserId: 'u-007',
    studentName: 'Amelia Wright',
    submittedAt: at('2026-11-25T09:45:00Z'),
    answerText:
      'Met briefing: cloud base 2,500 ft scattered, visibility greater than 10 km, surface wind 240 at 10 kt. No significant weather within the local area. I would sign the flight out.',
  },
  {
    id: 'sub-009',
    assignmentId: 'a-04',
    studentUserId: 'u-009',
    studentName: 'Sofia Rossi',
    submittedAt: at('2026-11-23T20:05:00Z'),
    answerText:
      'Take-off distance 1,480 m at 28°C, landing distance 1,320 m. Mass and balance within limits with a 240 kg margin. The limiting factor is the take-off run on the wet runway.',
    fileName: 'cpl-perf-sofia.pdf',
  },
  {
    id: 'sub-010',
    assignmentId: 'a-04',
    studentUserId: 'u-010',
    studentName: 'Jonas Weber',
    submittedAt: at('2026-11-24T10:30:00Z'),
    answerText:
      'Performance case complete. TODA limited, take-off distance 1,520 m. Landing distance 1,360 m. CG at 28% MAC, inside the envelope but close to the aft limit.',
    fileName: 'jonas-performance.xlsx',
    score: 65,
    feedback: 'Numbers are close but the aft CG point needs the trim setting stated. Recheck the wet-runway factor.',
  },
  {
    id: 'sub-011',
    assignmentId: 'a-04',
    studentUserId: 'u-011',
    studentName: 'Aisha Bello',
    submittedAt: at('2026-11-22T14:15:00Z'),
    answerText:
      'Charts worked for the hot-day case: take-off 1,510 m, landing 1,340 m. Mass and balance inside limits with 180 kg to spare. Limiting factor is obstacle clearance on the departure.',
    fileName: 'aisha-mb.pdf',
    score: 74,
    feedback: 'Good reasoning on the obstacle. State the assumed flap setting next time.',
    publishedAt: at('2026-11-25T09:00:00Z'),
  },
  {
    id: 'sub-012',
    assignmentId: 'a-04',
    studentUserId: 'u-012',
    studentName: 'Ravi Menon',
    submittedAt: at('2026-11-30T08:40:00Z'),
    isLate: true,
    answerText:
      'Apologies for the delay. I have done the take-off case only (1,560 m) and started the mass and balance but did not finish the landing chart.',
    fileName: 'ravi-perf-partial.pdf',
  },
  {
    id: 'sub-013',
    assignmentId: 'a-04',
    studentUserId: 'u-013',
    studentName: 'Elena Petrova',
    submittedAt: at('2026-11-25T06:55:00Z'),
    answerText:
      'Full chart set attached. Take-off 1,440 m, landing 1,300 m, mass and balance comfortably inside limits. I would brief the wet-runway penalty and the 200 kg margin to the captain.',
    fileName: 'elena-perf.pdf',
  },
  {
    id: 'sub-014',
    assignmentId: 'a-05',
    studentUserId: 'u-014',
    studentName: 'Tom Hughes',
    submittedAt: at('2026-11-26T12:05:00Z'),
    answerText:
      'Sector LGAV to LIRF, 620 nm. OFP attached with fuel policy (trip, contingency, alternate, final reserve) and a threat-and-error summary covering the Adriatic weather and the Rome arrival slot.',
    fileName: 'tom-ofp-lgav-lirf.pdf',
  },
  {
    id: 'sub-015',
    assignmentId: 'a-06',
    studentUserId: 'u-009',
    studentName: 'Sofia Rossi',
    submittedAt: at('2026-11-19T18:40:00Z'),
    answerText:
      'Fatigue essay: I used the 2019 report on cumulative duty and argued that the crew should have declared themselves unfit at the second consecutive early start rather than relying on caffeine.',
    score: 54,
    feedback: 'Sound argument, but the essay needs a clearer structure and one more source.',
    publishedAt: at('2026-11-21T09:00:00Z'),
  },
  {
    id: 'sub-016',
    assignmentId: 'a-06',
    studentUserId: 'u-010',
    studentName: 'Jonas Weber',
    submittedAt: at('2026-11-19T21:10:00Z'),
    answerText:
      'My essay covers fatigue risk management, the two-crew cross-check and the occurrence where a crew accepted a fourth sector. I concluded that the operator scheduling pressure was the root cause.',
    score: 48,
    feedback: 'The occurrence analysis is good; the recommendations are too general to act on.',
    publishedAt: at('2026-11-21T09:00:00Z'),
  },
  {
    id: 'sub-017',
    assignmentId: 'a-06',
    studentUserId: 'u-011',
    studentName: 'Aisha Bello',
    submittedAt: at('2026-11-20T07:55:00Z'),
    answerText:
      'Essay submitted on fatigue and decision making. I focused on the difference between legal duty limits and actual alertness, with a short case study from a regional operator.',
    score: 57,
    feedback: 'Well written. The case study is the strongest part — lead with it next time.',
    publishedAt: at('2026-11-21T09:00:00Z'),
  },
  {
    id: 'sub-018',
    assignmentId: 'a-06',
    studentUserId: 'u-014',
    studentName: 'Tom Hughes',
    submittedAt: at('2026-11-21T08:15:00Z'),
    isLate: true,
    answerText:
      'Late submission — my essay on fatigue in two-crew operations, covering the occurrence and what the crew could have done before the third sector.',
    score: 51,
    feedback: 'Accepted as late under the policy. The analysis is competent; proofread for tense consistency.',
    publishedAt: at('2026-11-22T09:00:00Z'),
  },
  {
    id: 'sub-019',
    assignmentId: 'a-06',
    studentUserId: 'u-015',
    studentName: 'Nia Campbell',
    submittedAt: at('2026-11-20T09:02:00Z'),
    answerText:
      'Essay on fatigue risk management with a focus on startle and workload during a night approach. I argued for a formal fatigue report after the second consecutive late finish.',
    score: 62,
    feedback: 'Excellent, and the fatigue-report recommendation is the right call.',
    publishedAt: at('2026-11-21T09:00:00Z'),
  },
  {
    id: 'sub-020',
    assignmentId: 'a-07',
    studentUserId: 'u-021',
    studentName: 'Wei Chen',
    submittedAt: at('2026-11-24T07:30:00Z'),
    answerText:
      'Report covers the three hydraulic systems and the GREEN + BLUE low pressure case. Affected systems: landing gear, normal braking, flaps, slats and half the spoilers. Landing distance increases with flap 3 only.',
    fileName: 'a320-hydraulics-wei.pdf',
  },
  {
    id: 'sub-021',
    assignmentId: 'a-07',
    studentUserId: 'u-022',
    studentName: 'Fatima Zahra',
    submittedAt: at('2026-11-25T15:20:00Z'),
    answerText:
      'Hydraulics report: green system powers gear, normal brakes and spoilers; blue powers slats, flaps and the emergency generator. With GREEN + BLUE lost, expect alternate law and a longer landing roll.',
    fileName: 'hydraulics-fatima.pdf',
  },
  {
    id: 'sub-022',
    assignmentId: 'a-07',
    studentUserId: 'u-023',
    studentName: 'Oliver Grant',
    submittedAt: at('2026-11-23T11:10:00Z'),
    answerText:
      'Report on the hydraulic systems and the abnormal drill. I listed the ECAM actions and the effect on landing distance, but I am not confident about which spoilers are lost.',
    score: 70,
    feedback: 'Close. Revisit the spoiler pairing — one pair per system, so losing two systems leaves you with half the spoilers.',
  },
  {
    id: 'sub-023',
    assignmentId: 'a-09',
    studentUserId: 'u-016',
    studentName: 'Marcus Lee',
    submittedAt: at('2026-11-24T13:10:00Z'),
    answerText:
      'Briefing pack for the ILS to runway 27 at Southampton: plate, minima, missed approach to the hold, and the go-around decision at 500 ft if not stabilised.',
    fileName: 'ils-brief-marcus.pdf',
  },
  {
    id: 'sub-024',
    assignmentId: 'a-09',
    studentUserId: 'u-017',
    studentName: 'Clara Dubois',
    submittedAt: at('2026-11-25T10:40:00Z'),
    answerText:
      'Approach brief attached for an ILS at Exeter. I included the weather minima, the missed approach, and a note on the circling case if the tailwind exceeds limits.',
    fileName: 'clara-ils-brief.pdf',
  },
  {
    id: 'sub-025',
    assignmentId: 'a-10',
    studentUserId: 'u-016',
    studentName: 'Marcus Lee',
    submittedAt: at('2026-11-21T17:30:00Z'),
    answerText:
      'LOFT debrief: two approaches and one go-around. Learning points were the late gear selection and the slow ECAM reading. I will practise the abnormal checklist flow before Thursday.',
    score: 38,
    feedback: 'Good honest debrief. The gear item is the one to fix first.',
    publishedAt: at('2026-11-23T09:00:00Z'),
  },
  {
    id: 'sub-026',
    assignmentId: 'a-10',
    studentUserId: 'u-017',
    studentName: 'Clara Dubois',
    submittedAt: at('2026-11-21T19:05:00Z'),
    answerText:
      'Simulator debrief covering the two approaches and the missed approach. Main learning point was workload management during the single-engine case.',
    score: 35,
    feedback: 'Reasonable. Say what you would do differently, not only what happened.',
    publishedAt: at('2026-11-23T09:00:00Z'),
  },
  {
    id: 'sub-027',
    assignmentId: 'a-10',
    studentUserId: 'u-018',
    studentName: 'Yusuf Demir',
    submittedAt: at('2026-11-22T08:10:00Z'),
    isLate: true,
    answerText:
      'Late debrief. I flew the ILS and the RNAV, and the go-around came from a late descent. I will rehearse the approach briefing before the next session.',
    score: 31,
    feedback: 'Accepted late. Focus on the briefing discipline — it is what prevents the late descent.',
    publishedAt: at('2026-11-23T09:00:00Z'),
  },
  {
    id: 'sub-028',
    assignmentId: 'a-10',
    studentUserId: 'u-019',
    studentName: 'Grace Mwangi',
    submittedAt: at('2026-11-20T16:45:00Z'),
    answerText:
      'Debrief write-up for the LOFT session: both approaches flown to minima, one go-around from traffic. Learning points were the radio call sequence and the after-landing flow.',
    score: 39,
    feedback: 'Very complete. The radio sequence note is worth sharing with the group.',
    publishedAt: at('2026-11-23T09:00:00Z'),
  },
  {
    id: 'sub-029',
    assignmentId: 'a-10',
    studentUserId: 'u-020',
    studentName: 'Ivan Volkov',
    submittedAt: at('2026-11-22T12:20:00Z'),
    answerText:
      'Simulator debrief. I struggled with the partial panel work and did not complete the second approach. I will book extra practice.',
    score: 28,
    feedback: 'Thank you for being direct. Book the practice and we will run partial panel again next week.',
    publishedAt: at('2026-11-23T09:00:00Z'),
  },
]

/*
  The history a seeded mark would have left behind: a draft save, then a return.
  Without these rows a returned grade would open on an empty history panel, which
  is not what a real returned mark looks like.
*/
type SeedRevision = {
  id: string
  submissionId: string
  at: string
  action: 'DRAFT_SAVED' | 'PUBLISHED'
  previousScore: number | null
  newScore: number | null
}

const REVISIONS: SeedRevision[] = SUBMISSIONS.flatMap((s) => {
  if (s.score === undefined || s.score === null) return []
  const rows: SeedRevision[] = [
    { id: `rev-seed-${s.id}-1`, submissionId: s.id, at: s.submittedAt, action: 'DRAFT_SAVED', previousScore: null, newScore: s.score },
  ]
  if (s.publishedAt) {
    rows.push({ id: `rev-seed-${s.id}-2`, submissionId: s.id, at: s.publishedAt, action: 'PUBLISHED', previousScore: s.score, newScore: s.score })
  }
  return rows
})

/**
 * Seed assignments once. The marker is written after the rows, and every insert
 * is OR IGNORE, so an interrupted seed is safe to retry.
 */
export async function seedAssessment(db: D1Database): Promise<void> {
  const marker = await db.prepare("SELECT value FROM meta WHERE key = 'assessment_seed_version'").first<{ value: string }>()
  if (marker?.value === SEED_VERSION) return

  await insertAll(
    db,
    `INSERT OR IGNORE INTO assignments (id, course_id, title, instructions, opens_at, due_at, late_policy, attempts_allowed, max_score, allow_file_upload, status, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ASSIGNMENTS.map((a) => [
      a.id,
      a.courseId,
      a.title,
      a.instructions,
      a.opensAt,
      a.dueAt,
      a.latePolicy,
      a.attemptsAllowed,
      a.maxScore,
      a.allowFileUpload ? 1 : 0,
      a.publishedAt ? 'OPEN' : 'DRAFT',
      a.publishedAt,
      a.publishedAt ?? a.opensAt,
      a.publishedAt ?? a.opensAt,
    ]),
  )

  await insertAll(
    db,
    `INSERT OR IGNORE INTO assignment_submissions (id, assignment_id, student_user_id, student_name, attempt_number, submitted_at, is_late, answer_text, file_name, score, feedback, graded_by, graded_at, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    SUBMISSIONS.map((s) => {
      const graded = s.score !== undefined && s.score !== null
      return [
        s.id,
        s.assignmentId,
        s.studentUserId,
        s.studentName,
        s.submittedAt,
        s.isLate ? 1 : 0,
        s.answerText,
        s.fileName ?? null,
        graded ? s.score : null,
        s.feedback ?? '',
        graded ? 'TCH-2011-004' : null,
        graded ? s.submittedAt : null,
        s.publishedAt ?? null,
        s.submittedAt,
        s.publishedAt ?? s.submittedAt,
      ]
    }),
  )

  await insertAll(
    db,
    `INSERT OR IGNORE INTO submission_revisions (id, submission_id, actor_id, at, action, previous_score, new_score, reason)
     VALUES (?, ?, 'TCH-2011-004', ?, ?, ?, ?, NULL)`,
    REVISIONS.map((r) => [r.id, r.submissionId, r.at, r.action, r.previousScore, r.newScore]),
  )

  await db
    .prepare(`INSERT INTO meta (key, value) VALUES ('assessment_seed_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(SEED_VERSION)
    .run()
}
