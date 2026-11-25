/*
  Assessment contracts: assignments, submissions, quizzes, questions,
  attempts, answers and grades.

  Shape decisions:
  - Question payloads are split by audience. `QuestionDTO` is what a student
    sees while attempting (no answer key, ever); `QuestionAuthoringDTO` is the
    teacher view and is the only type carrying correctness. Sending the
    authoring shape to an attempt endpoint is a leak, so the types differ.
  - An attempt snapshots its delivered question and option order (master PRD
    §5.10); scoring must read the snapshot, not the live quiz.
  - Grades have DRAFT and PUBLISHED. Publishing releases the result, notifies
    the student and writes an audit entry, so it is a separate mutation.
*/
import type { AuditStamp, Id, IsoDateTime } from './common'

export type AssignmentStatus = 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'CLOSED'
/** PENALISE is not a policy until a penalty exists — see latePenaltyPercent. */
export type LatePolicy = 'BLOCK' | 'ALLOW' | 'MARK_LATE'
export type SubmissionKind = 'TEXT' | 'FILE' | 'TEXT_AND_FILE'

export type AssignmentDTO = AuditStamp & {
  id: Id
  courseId: Id
  sectionId: Id | null
  title: string
  instructions: string
  status: AssignmentStatus
  opensAt: IsoDateTime
  dueAt: IsoDateTime
  latePolicy: LatePolicy
  /** Percentage removed from a late score; 0 unless the teacher sets it. */
  latePenaltyPercent: number
  attemptsAllowed: number
  /** Empty means no client-side restriction; the server allowlists too. */
  allowedFileTypes: string[]
  maxFileBytes: number
  maxScore: number
  /** Whether the viewer may still submit right now, per server rules. */
  isAcceptingSubmissions: boolean
}

export type SubmissionFileDTO = {
  id: Id
  filename: string
  sizeBytes: number
  mediaAssetId: Id
}

export type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'GRADED' | 'RETURNED'

export type SubmissionDTO = AuditStamp & {
  id: Id
  assignmentId: Id
  studentUserId: Id
  /** 1-based; every attempt is retained. */
  attemptNumber: number
  status: SubmissionStatus
  text: string | null
  files: SubmissionFileDTO[]
  submittedAt: IsoDateTime
  /** Server-computed from dueAt and policy, shown as a badge. */
  isLate: boolean
}

/** One final submission. The idempotency key is generated once per attempt. */
export type SubmitAssignmentDTO = {
  assignmentId: Id
  text: string | null
  fileAssetIds: Id[]
  idempotencyKey: string
}

export type GradeStatus = 'DRAFT' | 'PUBLISHED'

export type GradeDTO = AuditStamp & {
  id: Id
  submissionId: Id
  assignmentId: Id
  studentUserId: Id
  score: number
  maxScore: number
  feedback: string
  status: GradeStatus
  gradedByUserId: Id
  publishedAt: IsoDateTime | null
  /** Audit trail for changes, per master PRD §5.9 and §10.3. */
  revisions: Array<{
    at: IsoDateTime
    actorUserId: Id
    previousScore: number | null
    newScore: number
    reason: string | null
  }>
}

/* ------------------------------- quizzes ------------------------------- */

export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'NUMERICAL'
  | 'IMAGE_CHOICE'
  /** Marked by the teacher, never auto-scored. */
  | 'SHORT_ANSWER'

export type QuizResultRelease = 'IMMEDIATE' | 'AFTER_CLOSE' | 'MANUAL'
export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED'

export type NegativeMarkingDTO = {
  enabled: boolean
  /** Points deducted per incorrect answer; never exceeds the question's points. */
  penaltyPoints: number
}

export type QuizDTO = AuditStamp & {
  id: Id
  courseId: Id
  title: string
  instructions: string
  status: QuizStatus
  opensAt: IsoDateTime
  closesAt: IsoDateTime
  /** Cosmetic on the client; the server owns the deadline. */
  durationMinutes: number
  attemptsAllowed: number
  passScorePercent: number
  negativeMarking: NegativeMarkingDTO
  resultRelease: QuizResultRelease
  randomizeQuestions: boolean
  randomizeOptions: boolean
  questionCount: number
  maxScore: number
}

/** Option as shown to a student: no correctness flag. */
export type QuestionOptionDTO = {
  id: Id
  text: string
  imageAssetId: Id | null
}

/** Question as shown during an attempt. */
type QuestionBase = {
  id: Id
  position: number
  prompt: string
  imageAssetId: Id | null
  points: number
}

export type QuestionDTO =
  | (QuestionBase & { type: 'SINGLE_CHOICE'; options: QuestionOptionDTO[] })
  | (QuestionBase & { type: 'MULTIPLE_CHOICE'; options: QuestionOptionDTO[] })
  | (QuestionBase & { type: 'TRUE_FALSE'; options: QuestionOptionDTO[] })
  | (QuestionBase & { type: 'IMAGE_CHOICE'; options: QuestionOptionDTO[] })
  | (QuestionBase & { type: 'NUMERICAL'; unit: string | null })

/** Teacher view: the only shape that carries the answer key. */
export type QuestionAuthoringDTO =
  | (QuestionBase & { type: 'SINGLE_CHOICE'; options: QuestionOptionDTO[]; correctOptionId: Id })
  | (QuestionBase & { type: 'MULTIPLE_CHOICE'; options: QuestionOptionDTO[]; correctOptionIds: Id[] })
  | (QuestionBase & { type: 'TRUE_FALSE'; options: QuestionOptionDTO[]; correctOptionId: Id })
  | (QuestionBase & { type: 'IMAGE_CHOICE'; options: QuestionOptionDTO[]; correctOptionId: Id })
  | (QuestionBase & { type: 'NUMERICAL'; unit: string | null; correctValue: number; tolerance: number })
  | (QuestionBase & { type: 'SHORT_ANSWER'; minWords: number; maxWords: number; modelAnswer: string })

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'EXPIRED' | 'GRADED'

/** The delivered, frozen version of a quiz for one student. */
export type AttemptSnapshotDTO = {
  questionOrder: Id[]
  /** Per question, the option order the student was shown. */
  optionOrder: Record<Id, Id[]>
}

export type AttemptDTO = {
  id: Id
  quizId: Id
  studentUserId: Id
  attemptNumber: number
  status: AttemptStatus
  startedAt: IsoDateTime
  /** Server-computed deadline; the client timer is informational only. */
  expiresAt: IsoDateTime
  submittedAt: IsoDateTime | null
  score: number | null
  maxScore: number
  passed: boolean | null
  snapshot: AttemptSnapshotDTO
  questions: QuestionDTO[]
  answers: AnswerDTO[]
}

export type AnswerValue =
  | { kind: 'OPTION'; optionIds: Id[] }
  | { kind: 'BOOLEAN'; value: boolean }
  | { kind: 'NUMERICAL'; value: number }
  | { kind: 'TEXT'; value: string }

export type AnswerDTO = {
  attemptId: Id
  questionId: Id
  value: AnswerValue
  savedAt: IsoDateTime
}

/** Autosave is per answer; the indicator reflects this result. */
export type SaveAnswerResultDTO = {
  questionId: Id
  savedAt: IsoDateTime
}

/** Final submit. One idempotency key per attempt, persisted across retries. */
export type SubmitAttemptDTO = {
  attemptId: Id
  idempotencyKey: string
}

/** Manual mark for one short-answer response. */
export type AnswerGradeDTO = {
  attemptId: Id
  questionId: Id
  awardedPoints: number
  comment: string
  gradedByUserId: Id
  gradedAt: IsoDateTime
}

export type AttemptResultDTO = {
  attempt: AttemptDTO
  /** Null while the result-release policy holds it back. */
  score: number | null
  passed: boolean | null
  releasedAt: IsoDateTime | null
  /** Returned when the server clock decided the attempt was over. */
  timedOut: boolean
}
