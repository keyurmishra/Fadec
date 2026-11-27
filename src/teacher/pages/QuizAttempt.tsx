import { AlertCircle, ArrowLeft, Check, RotateCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '../../components/Button'
import { Input, Textarea } from '../../components/Field'
import { useToast } from '../../components/Toast'
import { Badge, Card, Skeleton } from '../../components/ui'
import type { TeacherQuizAnswerDTO, TeacherQuizAttemptDetailDTO } from '../../contracts/quizzes'
import { cx } from '../../lib/cx'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PageHeader } from '../components/ui'
import { dateTimeLabel } from './assessment-meta'
import { ATTEMPT_STATUS_META, QUESTION_TYPE_META } from './quiz-meta'

/*
  One student's attempt, question by question, in the order they saw it.

  Choice questions show what was picked against the key and the points the
  server awarded. Short answers carry a mark form; saving one recomputes the
  attempt's total on the server, and once the last short answer is marked the
  attempt becomes MARKED and the student's result can be released.
*/
type Load = { status: 'loading' } | { status: 'ready'; data: TeacherQuizAttemptDetailDTO } | { status: 'error'; error: string; code: number }

export function TeacherQuizAttempt() {
  const { quizId = '', attemptId = '' } = useParams()
  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)

  useDocumentTitle(`${state.status === 'ready' ? `${state.data.studentName} · ${state.data.quizTitle}` : 'Quiz attempt'} · Teaching studio`)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<TeacherQuizAttemptDetailDTO>(`/api/teacher/quiz-attempts/${encodeURIComponent(attemptId)}`).then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [attemptId, reload])

  const back = (
    <Link to={`/teach/quizzes/${quizId}`} className="inline-flex w-fit items-center gap-2 text-[13px] text-muted hover:text-fg">
      <ArrowLeft className="size-4" aria-hidden />
      Back to the quiz
    </Link>
  )

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading attempt">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="flex flex-col gap-6">
        {back}
        <div className="flex flex-col gap-4 border border-line bg-surface p-6">
          <h1 className="font-display text-[26px]">{state.code === 404 ? 'This attempt is not in one of your quizzes' : 'The attempt could not be loaded'}</h1>
          <p role="alert" className="flex items-start gap-2.5 text-[14px] text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
          <div>
            <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
              Try again
            </Button>
          </div>
        </div>
      </section>
    )
  }

  const attempt = state.data
  const meta = ATTEMPT_STATUS_META[attempt.status]
  const percent = attempt.score !== null && attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 100) : null

  return (
    <section className="flex flex-col gap-6">
      {back}
      <PageHeader
        eyebrow={`${attempt.courseTitle} · ${attempt.quizTitle}`}
        title={attempt.studentName}
        description={`Attempt ${attempt.attemptNumber} · started ${dateTimeLabel(attempt.startedAt)}${attempt.submittedAt ? ` · handed in ${dateTimeLabel(attempt.submittedAt)}` : ''}${attempt.autoSubmitted ? ' when time ran out' : ''}`}
        actions={
          <>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {attempt.score !== null && (
              <Badge tone={attempt.passed === null ? 'neutral' : attempt.passed ? 'lime' : 'danger'}>
                {attempt.score}/{attempt.maxScore}
                {percent !== null ? ` · ${percent}%` : ''}
                {attempt.passed === null ? ' so far' : attempt.passed ? ' · pass' : ' · below pass'}
              </Badge>
            )}
          </>
        }
      />

      {attempt.status === 'IN_PROGRESS' && (
        <Card className="px-5 py-4 text-[13px] text-muted">This attempt is still in progress. Answers saved so far are shown; nothing is scored until it is handed in or the time runs out.</Card>
      )}

      <ol className="flex flex-col gap-4">
        {attempt.answers.map((answer, i) => (
          <AnswerCard
            key={answer.question.id}
            index={i}
            answer={answer}
            attemptId={attempt.id}
            markable={attempt.status !== 'IN_PROGRESS'}
            onMarked={(data) => setState({ status: 'ready', data })}
          />
        ))}
      </ol>
      <p className="text-[12px] text-muted">The pass mark for this quiz is {attempt.passPercent}%. Choice questions are scored from the key and cannot be changed here.</p>
    </section>
  )
}

function AnswerCard({ index, answer, attemptId, markable, onMarked }: { index: number; answer: TeacherQuizAnswerDTO; attemptId: string; markable: boolean; onMarked: (data: TeacherQuizAttemptDetailDTO) => void }) {
  const toast = useToast()
  const { question } = answer
  const [points, setPoints] = useState(answer.awardedPoints === null ? '' : String(answer.awardedPoints))
  const [comment, setComment] = useState(answer.comment)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function mark() {
    const value = Number(points)
    if (points.trim() === '' || !Number.isInteger(value) || value < 0 || value > question.points) return setError(`Award between 0 and ${question.points} points.`)
    setSaving(true)
    setError('')
    const res = await teacherApi.put<TeacherQuizAttemptDetailDTO>(`/api/teacher/quiz-attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(question.id)}`, { points: value, comment })
    setSaving(false)
    if (!res.ok) return setError(res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error)
    onMarked(res.data)
    toast('Mark saved')
  }

  const awaiting = question.type === 'SHORT_ANSWER' && answer.awardedPoints === null && markable

  return (
    <li>
      <Card className={cx('flex flex-col gap-3 p-5', awaiting && 'border-amber-deep')}>
        <div className="flex flex-wrap items-start gap-3">
          <span className="figures mt-0.5 text-[12px] text-muted">Q{index + 1}</span>
          <p className="min-w-0 flex-1 text-[14.5px] leading-relaxed whitespace-pre-line">{question.prompt}</p>
          <Badge>{QUESTION_TYPE_META[question.type].label}</Badge>
          <span className="figures text-[13px]">
            {answer.awardedPoints === null ? '—' : answer.awardedPoints}/{question.points}
          </span>
        </div>

        {question.type !== 'SHORT_ANSWER' ? (
          <ul className="flex flex-col gap-1 pl-7">
            {question.options.map((o) => {
              const picked = answer.selectedOptionIds?.includes(o.id) ?? false
              const correct = question.correctOptionIds.includes(o.id)
              return (
                <li key={o.id} className={cx('flex items-center gap-2 text-[13.5px]', picked ? 'font-medium text-fg' : 'text-muted')}>
                  {correct ? <Check className="size-4 shrink-0 text-lime-ink" aria-hidden /> : picked ? <X className="size-4 shrink-0 text-danger" aria-hidden /> : <span className="size-4 shrink-0" aria-hidden />}
                  {o.text}
                  <span className="sr-only">
                    {picked ? ' (chosen)' : ''}
                    {correct ? ' (correct)' : ''}
                  </span>
                  {picked && <span className="text-[11.5px] text-muted">chosen</span>}
                </li>
              )
            })}
            {!answer.selectedOptionIds?.length && <li className="text-[12.5px] text-muted">Left blank.</li>}
          </ul>
        ) : (
          <div className="flex flex-col gap-3 pl-7">
            <div className="border border-line bg-surface-2 px-4 py-3 text-[14px] leading-relaxed whitespace-pre-line">{answer.text?.trim() ? answer.text : <span className="text-muted">Left blank.</span>}</div>
            {question.modelAnswer && <p className="text-[12.5px] text-muted">Marking guide: {question.modelAnswer}</p>}
            {markable && (
              <div className="flex flex-col gap-3 border-t border-line pt-3">
                <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                  <Input label={`Points (0–${question.points})`} inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} />
                  <Textarea label="Comment" optional rows={2} value={comment} onChange={(e) => setComment(e.target.value)} hint="The student sees this with their result." />
                </div>
                {error && (
                  <p role="alert" className="flex items-center gap-1.5 text-[13px] text-danger">
                    <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                    {error}
                  </p>
                )}
                <div>
                  <Button size="sm" loading={saving} onClick={mark}>
                    {answer.awardedPoints === null ? 'Save mark' : 'Update mark'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </li>
  )
}
