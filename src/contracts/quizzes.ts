/*
  Quizzes as the studio and the portal actually speak them.

  assessment.ts holds the long-range quiz contract (numerical and image
  questions, negative marking, manual release). This file is the slice that is
  built: four question types, a server-owned deadline, autosave per answer, and
  a release rule that decides when a student may see a score.

  The same split as assessment.ts applies: `QuizQuestionAuthoringDTO` carries
  the answer key and only ever goes to the teacher; `StudentQuizQuestionDTO`
  is what an attempt delivers and never has a key, so sending the wrong one is
  a type error rather than a leak.
*/
import type { Id, IsoDateTime } from './common'

export type QuizQuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER'

/** IMMEDIATE: on submit. AFTER_CLOSE: once the quiz window has ended. */
export type QuizReleasePolicy = 'IMMEDIATE' | 'AFTER_CLOSE'

/** Derived like an assignment's: publication plus the window, with a manual close winning. */
export type QuizStatusView = 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'CLOSED'

export type QuizOptionDTO = { id: Id; text: string }

/** Teacher view of a question: the only shape with the answer key. */
export type QuizQuestionAuthoringDTO = {
  id: Id
  position: number
  type: QuizQuestionType
  prompt: string
  points: number
  /** Empty for SHORT_ANSWER. TRUE_FALSE always has the two fixed options. */
  options: QuizOptionDTO[]
  /** One id for SINGLE_CHOICE and TRUE_FALSE, one or more for MULTIPLE_CHOICE, none for SHORT_ANSWER. */
  correctOptionIds: Id[]
  /** Guidance for whoever marks a short answer. Never sent to a student. */
  modelAnswer: string
}

/** What the teacher sends to add or replace a question. */
export type QuizQuestionInput = {
  type: QuizQuestionType
  prompt: string
  points: number
  options: Array<{ id?: Id; text: string }>
  /** Indexes into `options`, so a new option can be marked correct before it has an id. */
  correctIndexes: number[]
  modelAnswer: string
}

export type QuizValidationDTO = {
  canPublish: boolean
  requirements: Array<{ key: string; label: string; satisfied: boolean; detail?: string }>
}

export type TeacherQuizSummaryDTO = {
  id: Id
  courseId: Id
  courseTitle: string
  title: string
  status: QuizStatusView
  opensAt: IsoDateTime
  closesAt: IsoDateTime
  durationMinutes: number
  attemptsAllowed: number
  passPercent: number
  releasePolicy: QuizReleasePolicy
  questionCount: number
  maxScore: number
  /** Handed-in attempts, including ones the server submitted at the deadline. */
  attemptCount: number
  /** Distinct students who have handed in at least once. */
  studentCount: number
  enrolledCount: number
  /** Attempts with a short answer still unmarked. */
  toMarkCount: number
  /** Mean percentage over fully-marked attempts, or null when there are none. */
  averagePercent: number | null
  updatedAt: IsoDateTime
}

/** Where one attempt stands for the teacher. */
export type QuizAttemptMarkingStatus = 'IN_PROGRESS' | 'TO_MARK' | 'MARKED'

export type TeacherQuizAttemptSummaryDTO = {
  id: Id
  quizId: Id
  studentId: Id
  studentName: string
  attemptNumber: number
  status: QuizAttemptMarkingStatus
  startedAt: IsoDateTime
  submittedAt: IsoDateTime | null
  /** True when the server closed it at the deadline rather than the student. */
  autoSubmitted: boolean
  /** Points so far: objective questions plus any short answers already marked. */
  score: number | null
  maxScore: number
  passed: boolean | null
}

export type TeacherQuizDetailDTO = TeacherQuizSummaryDTO & {
  instructions: string
  shuffleQuestions: boolean
  createdAt: IsoDateTime
  publishedAt: IsoDateTime | null
  /** Questions can change only while the quiz is a draft. */
  editable: boolean
  questions: QuizQuestionAuthoringDTO[]
  publish: QuizValidationDTO
  attempts: TeacherQuizAttemptSummaryDTO[]
}

/** One answer in an attempt, as the teacher reviews it. */
export type TeacherQuizAnswerDTO = {
  question: QuizQuestionAuthoringDTO
  /** Option ids for choice questions; null when the student left it blank. */
  selectedOptionIds: Id[] | null
  text: string | null
  /** Null on a short answer that has not been marked yet. */
  awardedPoints: number | null
  isCorrect: boolean | null
  comment: string
}

export type TeacherQuizAttemptDetailDTO = TeacherQuizAttemptSummaryDTO & {
  quizTitle: string
  courseTitle: string
  passPercent: number
  /** In the order the student saw them. */
  answers: TeacherQuizAnswerDTO[]
}

/* -------------------------------- student -------------------------------- */

export type StudentQuizStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED'

export type StudentQuizSummaryDTO = {
  id: Id
  courseId: Id
  courseTitle: string
  title: string
  status: StudentQuizStatus
  opensAt: IsoDateTime
  closesAt: IsoDateTime
  durationMinutes: number
  attemptsAllowed: number
  passPercent: number
  releasePolicy: QuizReleasePolicy
  questionCount: number
  maxScore: number
  /** Attempts handed in so far. */
  attemptsUsed: number
  /** True while an attempt is open and its deadline has not passed. */
  hasOpenAttempt: boolean
}

/** A question as delivered: no key, no model answer. */
export type StudentQuizQuestionDTO = {
  id: Id
  type: QuizQuestionType
  prompt: string
  points: number
  options: QuizOptionDTO[]
}

export type StudentQuizAnswerValue = { optionIds: Id[] } | { text: string }

/** Per question, only once the result is released. */
export type StudentQuizQuestionResultDTO = {
  questionId: Id
  awardedPoints: number
  isCorrect: boolean | null
  correctOptionIds: Id[]
  comment: string
}

export type StudentQuizResultDTO = {
  score: number
  maxScore: number
  percent: number
  passed: boolean
  questions: StudentQuizQuestionResultDTO[]
}

export type StudentQuizAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED'

export type StudentQuizAttemptDTO = {
  id: Id
  quizId: Id
  attemptNumber: number
  status: StudentQuizAttemptStatus
  startedAt: IsoDateTime
  /** The server's deadline. The countdown on screen reads this and nothing else. */
  expiresAt: IsoDateTime
  submittedAt: IsoDateTime | null
  autoSubmitted: boolean
  /** In the order this attempt delivered them. */
  questions: StudentQuizQuestionDTO[]
  answers: Record<Id, StudentQuizAnswerValue>
  /** Why there is no result yet, when there is none. */
  resultPending: 'MARKING' | 'AFTER_CLOSE' | null
  result: StudentQuizResultDTO | null
}

export type StudentQuizDetailDTO = StudentQuizSummaryDTO & {
  instructions: string
  /** Newest first. */
  attempts: StudentQuizAttemptDTO[]
}

export type StudentQuizSaveAnswerResultDTO = { questionId: Id; savedAt: IsoDateTime }
