/*
  Labels for the quiz screens, shared by the studio list, the builder and the
  marking page so the three never describe the same state in different words.
*/
import type { Tone } from '../../components/ui'
import type { QuizAttemptMarkingStatus, QuizQuestionType, QuizReleasePolicy, QuizStatusView } from '../../contracts/quizzes'

export const QUIZ_STATUS_META: Record<QuizStatusView, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SCHEDULED: { label: 'Scheduled', tone: 'amber' },
  OPEN: { label: 'Open', tone: 'lime' },
  CLOSED: { label: 'Closed', tone: 'danger' },
}

export const QUESTION_TYPE_META: Record<QuizQuestionType, { label: string; hint: string }> = {
  SINGLE_CHOICE: { label: 'Single choice', hint: 'One correct option. Scored automatically.' },
  MULTIPLE_CHOICE: { label: 'Multiple choice', hint: 'Every correct option must be chosen, and nothing else. Scored automatically.' },
  TRUE_FALSE: { label: 'True / false', hint: 'A statement the student marks true or false. Scored automatically.' },
  SHORT_ANSWER: { label: 'Short answer', hint: 'A written answer you mark by hand. Blank answers score 0 automatically.' },
}

export const QUESTION_TYPES: QuizQuestionType[] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']

export const RELEASE_META: Record<QuizReleasePolicy, { label: string; description: string }> = {
  IMMEDIATE: { label: 'Results on submit', description: 'Students see their score and the correct answers as soon as they hand in (after any short answers are marked).' },
  AFTER_CLOSE: { label: 'Results after closing', description: 'Scores and correct answers stay hidden until the quiz closes, so early finishers cannot share them.' },
}

export const ATTEMPT_STATUS_META: Record<QuizAttemptMarkingStatus, { label: string; tone: Tone }> = {
  IN_PROGRESS: { label: 'In progress', tone: 'blue' },
  TO_MARK: { label: 'To mark', tone: 'amber' },
  MARKED: { label: 'Marked', tone: 'lime' },
}

/** A closing time two days out at 17:00, the builder's default. */
export const defaultCloseInput = () => {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  d.setHours(17, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
