import { ArrowLeft, Check, Clock, RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '../../components/Button'
import { Textarea } from '../../components/Field'
import { Badge, Card, EmptyState, Skeleton } from '../../components/ui'
import type { StudentQuizAnswerValue, StudentQuizAttemptDTO, StudentQuizDetailDTO, StudentQuizQuestionDTO, StudentQuizSaveAnswerResultDTO } from '../../contracts/quizzes'
import { cx } from '../../lib/cx'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { studentApi } from '../../lib/student-api'
import { STUDENT_ASSIGNMENT_STATUS_META, dateTimeLabel } from '../meta'

/*
  One quiz as its student sees it: the rules, a start or resume button, the
  attempt itself while it runs, and the results of earlier attempts once they
  are released.

  The countdown reads the server's expiresAt and nothing else. When it reaches
  zero the page asks the server to hand the attempt in; the server would do the
  same on its own at the next read, so closing the tab loses nothing that was
  saved. Each answer saves as soon as it changes (written answers after a short
  pause), and the indicator next to each question shows the server's reply.
*/
type Load = { status: 'loading' } | { status: 'ready'; data: StudentQuizDetailDTO } | { status: 'error'; error: string; code: number }

export function StudentQuizDetail() {
  const { quizId = '' } = useParams()
  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)

  useDocumentTitle(`${state.status === 'ready' ? state.data.title : 'Quiz'} · Student portal`)

  useEffect(() => {
    let cancelled = false
    studentApi.get<StudentQuizDetailDTO>(`/api/student/quizzes/${encodeURIComponent(quizId)}`).then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error, code: res.status })
    })
    return () => {
      cancelled = true
    }
  }, [quizId, reload])

  const refresh = useCallback(() => setReload((n) => n + 1), [])

  return (
    <div className="flex flex-col gap-6">
      <Link to="/learn/quizzes" className="inline-flex min-h-9 w-fit items-center gap-2 text-[13px] text-muted underline decoration-line-strong underline-offset-4 hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        All quizzes
      </Link>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading quiz">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-48" />
        </div>
      )}

      {state.status === 'error' && state.code === 404 && (
        <EmptyState
          title="That quiz could not be found"
          body="It may not be published, it may belong to a course you are not enrolled in, or the link may be old."
          action={
            <Button to="/learn/quizzes" variant="secondary">
              Back to quizzes
            </Button>
          }
        />
      )}

      {state.status === 'error' && state.code !== 404 && (
        <div role="alert" className="flex flex-col items-start gap-3 border border-[rgb(160_48_36/0.25)] bg-danger-soft px-4 py-3 text-[14px] text-danger">
          <span>{state.error}</span>
          <Button variant="secondary" size="sm" icon={<RotateCw className="size-4" aria-hidden />} onClick={refresh}>
            Try again
          </Button>
        </div>
      )}

      {state.status === 'ready' && <QuizPage quiz={state.data} onChanged={refresh} />}
    </div>
  )
}

function QuizPage({ quiz, onChanged }: { quiz: StudentQuizDetailDTO; onChanged: () => void }) {
  const status = STUDENT_ASSIGNMENT_STATUS_META[quiz.status]
  const open = quiz.attempts.find((a) => a.status === 'IN_PROGRESS') ?? null
  const done = quiz.attempts.filter((a) => a.status === 'SUBMITTED')
  const left = Math.max(0, quiz.attemptsAllowed - quiz.attemptsUsed)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setStarting(true)
    setError(null)
    const res = await studentApi.post<StudentQuizAttemptDTO>(`/api/student/quizzes/${encodeURIComponent(quiz.id)}/attempt`, {})
    setStarting(false)
    if (!res.ok) return setError(res.error)
    onChanged()
  }

  const facts = [
    { label: 'Opens', value: dateTimeLabel(quiz.opensAt) },
    { label: 'Closes', value: dateTimeLabel(quiz.closesAt) },
    { label: 'Time limit', value: `${quiz.durationMinutes} minutes` },
    { label: 'Questions', value: `${quiz.questionCount} · ${quiz.maxScore} marks` },
    { label: 'Pass mark', value: `${quiz.passPercent}%` },
    { label: 'Attempts', value: `${left} of ${quiz.attemptsAllowed} left` },
  ]

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 border-b border-line pb-6">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-amber-ink uppercase">{quiz.courseTitle}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[30px] leading-[1.05] tracking-[-0.015em] md:text-[38px]">{quiz.title}</h1>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="text-[13.5px] text-muted">
          {quiz.releasePolicy === 'IMMEDIATE' ? 'Results appear as soon as you hand in.' : 'Results appear once the quiz closes.'} Short answers are marked by your teacher first.
        </p>
      </header>

      {open ? (
        <TakeQuiz attempt={open} quiz={quiz} onFinished={onChanged} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.label} className="flex flex-col gap-1 bg-surface px-4 py-3.5">
                <dt className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">{fact.label}</dt>
                <dd className="figures text-[13.5px] leading-snug">{fact.value}</dd>
              </div>
            ))}
          </dl>

          {quiz.instructions && (
            <Card className="p-5 md:p-6">
              <h2 className="border-b border-line pb-3 text-[15px] font-semibold">Instructions</h2>
              <p className="pt-4 text-[15px] leading-relaxed whitespace-pre-line">{quiz.instructions}</p>
            </Card>
          )}

          <Card className="flex flex-col gap-3 p-5 md:p-6">
            {quiz.status === 'OPEN' && left > 0 ? (
              <>
                <p className="text-[14px]">
                  The timer starts when you press start and runs for {quiz.durationMinutes} minutes, or until the quiz closes at {dateTimeLabel(quiz.closesAt)}, whichever is sooner. It keeps running if you leave the page.
                </p>
                <div>
                  <Button loading={starting} onClick={start}>
                    {done.length ? `Start attempt ${done.length + 1}` : 'Start quiz'}
                  </Button>
                </div>
              </>
            ) : quiz.status === 'SCHEDULED' ? (
              <p className="text-[14px] text-muted">This quiz opens {dateTimeLabel(quiz.opensAt)}.</p>
            ) : quiz.status === 'CLOSED' ? (
              <p className="text-[14px] text-muted">This quiz has closed.</p>
            ) : (
              <p className="text-[14px] text-muted">You have used every attempt for this quiz.</p>
            )}
            {error && (
              <p role="alert" className="text-[13.5px] text-danger">
                {error}
              </p>
            )}
          </Card>
        </>
      )}

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold">Your attempts</h2>
          {done.map((attempt) => (
            <AttemptResult key={attempt.id} attempt={attempt} quiz={quiz} />
          ))}
        </section>
      )}
    </article>
  )
}

/* ------------------------------ taking a quiz ----------------------------- */

type SaveState = 'saving' | 'saved' | 'error'

const remainingLabel = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function TakeQuiz({ attempt, quiz, onFinished }: { attempt: StudentQuizAttemptDTO; quiz: StudentQuizDetailDTO; onFinished: () => void }) {
  const [answers, setAnswers] = useState<Record<string, StudentQuizAnswerValue>>(attempt.answers)
  const [saves, setSaves] = useState<Record<string, SaveState>>({})
  const [now, setNow] = useState(() => Date.now())
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const finishing = useRef(false)
  const answersRef = useRef(answers)
  answersRef.current = answers

  const deadline = Date.parse(attempt.expiresAt)
  const remaining = deadline - now

  const save = useCallback(
    async (questionId: string, value: StudentQuizAnswerValue) => {
      setSaves((s) => ({ ...s, [questionId]: 'saving' }))
      const res = await studentApi.put<StudentQuizSaveAnswerResultDTO>(`/api/student/quiz-attempts/${encodeURIComponent(attempt.id)}/answers/${encodeURIComponent(questionId)}`, { value })
      setSaves((s) => ({ ...s, [questionId]: res.ok ? 'saved' : 'error' }))
      if (!res.ok) setError(res.error)
      if (!res.ok && res.status === 409) onFinished()
    },
    [attempt.id, onFinished],
  )

  const finish = useCallback(async () => {
    if (finishing.current) return
    finishing.current = true
    setSubmitting(true)
    /* Flush any written answer still waiting for its pause, so it is saved before the hand-in. */
    const pending = Object.entries(timers.current)
    for (const [questionId, timer] of pending) {
      clearTimeout(timer)
      delete timers.current[questionId]
      const value = answersRef.current[questionId]
      if (value) await save(questionId, value)
    }
    const res = await studentApi.post<StudentQuizAttemptDTO>(`/api/student/quiz-attempts/${encodeURIComponent(attempt.id)}/submit`, {})
    setSubmitting(false)
    if (!res.ok && res.status !== 409) {
      finishing.current = false
      return setError(res.error)
    }
    onFinished()
  }, [attempt.id, onFinished, save])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (remaining <= 0) void finish()
  }, [remaining, finish])

  useEffect(() => {
    const pending = timers.current
    return () => Object.values(pending).forEach(clearTimeout)
  }, [])

  function choose(question: StudentQuizQuestionDTO, optionId: string) {
    const current = answers[question.id]
    const chosen = current && 'optionIds' in current ? current.optionIds : []
    const next = question.type === 'MULTIPLE_CHOICE' ? (chosen.includes(optionId) ? chosen.filter((id) => id !== optionId) : [...chosen, optionId]) : [optionId]
    const value = { optionIds: next }
    setAnswers((a) => ({ ...a, [question.id]: value }))
    void save(question.id, value)
  }

  function write(question: StudentQuizQuestionDTO, text: string) {
    const value = { text }
    setAnswers((a) => ({ ...a, [question.id]: value }))
    setSaves((s) => ({ ...s, [question.id]: 'saving' }))
    clearTimeout(timers.current[question.id])
    timers.current[question.id] = setTimeout(() => {
      delete timers.current[question.id]
      void save(question.id, value)
    }, 800)
  }

  const answered = attempt.questions.filter((q) => {
    const v = answers[q.id]
    return v && ('optionIds' in v ? v.optionIds.length > 0 : v.text.trim().length > 0)
  }).length
  const urgent = remaining < 60_000

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-[109px] z-10 flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-4 py-3 shadow-sm">
        <span className="text-[13.5px]">
          Attempt {attempt.attemptNumber} of {quiz.attemptsAllowed} · {answered} of {attempt.questions.length} answered
        </span>
        <span className={cx('figures inline-flex items-center gap-1.5 text-[15px] font-semibold', urgent ? 'text-danger' : 'text-fg')} role="timer" aria-live={urgent ? 'polite' : 'off'}>
          <Clock className="size-4" aria-hidden />
          {remaining > 0 ? `${remainingLabel(remaining)} left` : 'Time is up'}
        </span>
      </div>

      <ol className="flex flex-col gap-4">
        {attempt.questions.map((question, i) => {
          const value = answers[question.id]
          const chosen = value && 'optionIds' in value ? value.optionIds : []
          const saveState = saves[question.id]
          return (
            <li key={question.id}>
              <Card className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="figures mt-0.5 text-[12px] text-muted">Q{i + 1}</span>
                  <p id={`q-${question.id}`} className="min-w-0 flex-1 text-[15px] leading-relaxed whitespace-pre-line">
                    {question.prompt}
                  </p>
                  <span className="figures text-[12.5px] text-muted">
                    {question.points} {question.points === 1 ? 'mark' : 'marks'}
                  </span>
                </div>

                {question.type === 'SHORT_ANSWER' ? (
                  <Textarea label="Your answer" rows={4} value={value && 'text' in value ? value.text : ''} onChange={(e) => write(question, e.target.value)} disabled={submitting} />
                ) : (
                  <div role={question.type === 'MULTIPLE_CHOICE' ? 'group' : 'radiogroup'} aria-labelledby={`q-${question.id}`} className="flex flex-col gap-2">
                    {question.type === 'MULTIPLE_CHOICE' && <p className="text-[12.5px] text-muted">Choose every answer that applies.</p>}
                    {question.options.map((option) => {
                      const picked = chosen.includes(option.id)
                      return (
                        <label
                          key={option.id}
                          className={cx(
                            'flex min-h-12 cursor-pointer items-center gap-3 border px-4 py-2.5 text-[14.5px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-amber-deep',
                            picked ? 'border-amber-deep bg-amber-soft' : 'border-line hover:border-line-strong',
                          )}
                        >
                          <input
                            type={question.type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'}
                            name={question.id}
                            checked={picked}
                            disabled={submitting}
                            onChange={() => choose(question, option.id)}
                            className="size-4 accent-[var(--color-amber-deep)]"
                          />
                          {option.text}
                        </label>
                      )
                    })}
                  </div>
                )}

                <p className="min-h-4 text-[12px] text-muted" aria-live="polite">
                  {saveState === 'saving' && 'Saving…'}
                  {saveState === 'saved' && (
                    <span className="inline-flex items-center gap-1 text-lime-ink">
                      <Check className="size-3.5" aria-hidden />
                      Saved
                    </span>
                  )}
                  {saveState === 'error' && <span className="text-danger">Not saved. Change the answer to try again.</span>}
                </p>
              </Card>
            </li>
          )
        })}
      </ol>

      {error && (
        <p role="alert" className="border border-[rgb(160_48_36/0.25)] bg-danger-soft px-4 py-3 text-[13.5px] text-danger">
          {error}
        </p>
      )}

      {confirming ? (
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-[14px]">
            Hand in now? {answered < attempt.questions.length ? `${attempt.questions.length - answered} question${attempt.questions.length - answered === 1 ? ' is' : 's are'} unanswered. ` : ''}You cannot change your answers afterwards.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="violet" loading={submitting} onClick={finish}>
              Yes, hand it in
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={submitting}>
              Keep going
            </Button>
          </div>
        </Card>
      ) : (
        <div>
          <Button variant="violet" onClick={() => setConfirming(true)} disabled={submitting}>
            Hand in quiz
          </Button>
        </div>
      )}
    </div>
  )
}

/* -------------------------------- results -------------------------------- */

function AttemptResult({ attempt, quiz }: { attempt: StudentQuizAttemptDTO; quiz: StudentQuizDetailDTO }) {
  const result = attempt.result
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-muted">
          Attempt {attempt.attemptNumber} · handed in {attempt.submittedAt ? dateTimeLabel(attempt.submittedAt) : ''}
          {attempt.autoSubmitted ? ' when time ran out' : ''}
        </span>
        {result ? (
          <div className="flex flex-wrap gap-2">
            <Badge tone="violet">
              {result.score} / {result.maxScore} · {result.percent}%
            </Badge>
            <Badge tone={result.passed ? 'lime' : 'danger'}>{result.passed ? 'Passed' : `Below the ${quiz.passPercent}% pass mark`}</Badge>
          </div>
        ) : (
          <Badge tone="amber">{attempt.resultPending === 'MARKING' ? 'Being marked' : 'Results after closing'}</Badge>
        )}
      </div>

      {!result && (
        <p className="text-[13px] text-muted">
          {attempt.resultPending === 'MARKING'
            ? 'Your teacher is marking the written answers. Your score appears here once that is done.'
            : `Scores and correct answers are released when the quiz closes, ${dateTimeLabel(quiz.closesAt)}.`}
        </p>
      )}

      {result && (
        <details className="group border-t border-line pt-3">
          <summary className="cursor-pointer text-[13px] font-medium underline decoration-amber decoration-1 underline-offset-4">Review answers</summary>
          <ol className="mt-3 flex flex-col gap-3">
            {attempt.questions.map((question, i) => {
              const r = result.questions.find((x) => x.questionId === question.id)
              const value = attempt.answers[question.id]
              const chosen = value && 'optionIds' in value ? value.optionIds : []
              return (
                <li key={question.id} className="flex flex-col gap-2 border border-line px-4 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="figures mt-0.5 text-[12px] text-muted">Q{i + 1}</span>
                    <p className="min-w-0 flex-1 text-[14px] leading-relaxed whitespace-pre-line">{question.prompt}</p>
                    <span className="figures text-[12.5px]">
                      {r?.awardedPoints ?? 0}/{question.points}
                    </span>
                  </div>
                  {question.type === 'SHORT_ANSWER' ? (
                    <p className="pl-7 text-[13.5px] whitespace-pre-line">{value && 'text' in value ? value.text : <span className="text-muted">Left blank.</span>}</p>
                  ) : (
                    <ul className="flex flex-col gap-1 pl-7">
                      {question.options.map((o) => {
                        const correct = r?.correctOptionIds.includes(o.id) ?? false
                        const picked = chosen.includes(o.id)
                        return (
                          <li key={o.id} className={cx('flex items-center gap-2 text-[13.5px]', picked ? 'font-medium' : 'text-muted')}>
                            {correct ? <Check className="size-4 shrink-0 text-lime-ink" aria-hidden /> : picked ? <X className="size-4 shrink-0 text-danger" aria-hidden /> : <span className="size-4 shrink-0" aria-hidden />}
                            {o.text}
                            <span className="sr-only">
                              {picked ? ' (your answer)' : ''}
                              {correct ? ' (correct)' : ''}
                            </span>
                            {picked && <span className="text-[11.5px] text-muted">your answer</span>}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {r?.comment && <p className="pl-7 text-[13px] text-muted">Teacher: {r.comment}</p>}
                </li>
              )
            })}
          </ol>
        </details>
      )}
    </Card>
  )
}

