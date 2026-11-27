import { ArrowRight, ListChecks, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { Button } from '../../components/Button'
import { Badge, Card, EmptyState, Skeleton } from '../../components/ui'
import type { StudentQuizStatus, StudentQuizSummaryDTO } from '../../contracts/quizzes'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { studentApi } from '../../lib/student-api'
import { STUDENT_ASSIGNMENT_STATUS_META, dateTimeLabel } from '../meta'

/*
  Every quiz published for the student's enrolled courses, grouped by its
  window like the assignments list. Taking a quiz happens on its own page.
*/
type Load = { status: 'loading' } | { status: 'ready'; items: StudentQuizSummaryDTO[] } | { status: 'error'; error: string }

const GROUPS: Array<{ status: StudentQuizStatus; title: string; note: string }> = [
  { status: 'OPEN', title: 'Open now', note: 'You can start or resume these.' },
  { status: 'SCHEDULED', title: 'Opening soon', note: 'Published, but not open yet.' },
  { status: 'CLOSED', title: 'Closed', note: 'See your results here.' },
]

export function StudentQuizzes() {
  useDocumentTitle('Quizzes · Student portal')
  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    studentApi.get<{ items: StudentQuizSummaryDTO[] }>('/api/student/quizzes').then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', items: res.data.items } : { status: 'error', error: res.error })
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  const items = state.status === 'ready' ? state.items : []

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-[62ch] flex-col gap-2">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-amber-ink uppercase">Quizzes</p>
          <h1 className="font-display text-[32px] leading-[1.05] tracking-[-0.015em] md:text-[40px]">Quizzes and tests</h1>
          <p className="text-[14.5px] leading-relaxed text-muted">Timed quizzes for your enrolled courses. Answers save as you go, and the timer keeps running if you leave the page.</p>
        </div>
        {state.status === 'error' && (
          <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
            Try again
          </Button>
        )}
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading quizzes">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="border border-[rgb(160_48_36/0.25)] bg-danger-soft px-4 py-3 text-[14px] text-danger">
          {state.error}
        </div>
      )}

      {state.status === 'ready' && items.length === 0 && (
        <EmptyState icon={<ListChecks className="size-5" aria-hidden />} title="No quizzes yet" body="Nothing has been published for your courses. A quiz appears here as soon as your teacher publishes it." />
      )}

      {state.status === 'ready' &&
        GROUPS.map((group) => {
          const rows = items.filter((item) => item.status === group.status)
          if (!rows.length) return null
          return (
            <section key={group.status} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-semibold tracking-[-0.005em]">
                  {group.title}
                  <span className="figures ml-2 text-[12.5px] font-normal text-muted">{rows.length}</span>
                </h2>
                <p className="text-[12.5px] text-muted">{group.note}</p>
              </div>
              <ul className="flex flex-col gap-3">
                {rows.map((quiz) => (
                  <QuizRow key={quiz.id} quiz={quiz} />
                ))}
              </ul>
            </section>
          )
        })}
    </div>
  )
}

function QuizRow({ quiz }: { quiz: StudentQuizSummaryDTO }) {
  const status = STUDENT_ASSIGNMENT_STATUS_META[quiz.status]
  const left = Math.max(0, quiz.attemptsAllowed - quiz.attemptsUsed)
  return (
    <Card as="li">
      <Link
        to={`/learn/quizzes/${quiz.id}`}
        className="group flex flex-col gap-4 p-5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-deep md:flex-row md:items-center md:justify-between"
      >
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{quiz.courseTitle}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-semibold tracking-[-0.005em]">{quiz.title}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
            {quiz.hasOpenAttempt && <Badge tone="blue">In progress</Badge>}
          </div>
          <p className="text-[13px] text-muted">
            {quiz.status === 'SCHEDULED' ? `Opens ${dateTimeLabel(quiz.opensAt)}` : `Closes ${dateTimeLabel(quiz.closesAt)}`} · {quiz.questionCount} questions · {quiz.durationMinutes} min ·{' '}
            {left} of {quiz.attemptsAllowed} {quiz.attemptsAllowed === 1 ? 'attempt' : 'attempts'} left
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg">
          {quiz.hasOpenAttempt ? 'Resume' : 'Open'}
          <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </Link>
    </Card>
  )
}
