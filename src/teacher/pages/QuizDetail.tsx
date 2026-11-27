import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, Check, Pencil, Plus, RotateCw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button, IconButton } from '../../components/Button'
import { Checkbox, ChoiceCard, Input, Select, Textarea } from '../../components/Field'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Badge, EmptyState, Skeleton } from '../../components/ui'
import type { QuizQuestionAuthoringDTO, QuizQuestionInput, QuizQuestionType, QuizReleasePolicy, TeacherQuizDetailDTO } from '../../contracts/quizzes'
import { cx } from '../../lib/cx'
import { teacherApi } from '../../lib/teacher-api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PageHeader, Panel, ProgressBar } from '../components/ui'
import { dateTimeLabel, fromDateTimeInput, toDateTimeInput } from './assessment-meta'
import { ATTEMPT_STATUS_META, QUESTION_TYPES, QUESTION_TYPE_META, QUIZ_STATUS_META, RELEASE_META } from './quiz-meta'

/*
  One quiz: its settings, its questions, the publish checklist and every
  attempt so far.

  Questions are editable only while the quiz is a draft; the server refuses
  edits after that, and the screen hides the controls rather than offering
  buttons that would fail. Every mutation returns the whole quiz, so the screen
  replaces its state with the server's answer instead of patching it locally.
*/
type Load = { status: 'loading' } | { status: 'ready'; data: TeacherQuizDetailDTO } | { status: 'error'; error: string; code: number }

export function TeacherQuizDetail() {
  const { quizId = '' } = useParams()
  const toast = useToast()
  const base = `/api/teacher/quizzes/${quizId}`

  const [state, setState] = useState<Load>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState<QuizQuestionAuthoringDTO | 'new' | null>(null)

  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [duration, setDuration] = useState('')
  const [attempts, setAttempts] = useState('')
  const [pass, setPass] = useState('')
  const [release, setRelease] = useState<QuizReleasePolicy>('IMMEDIATE')
  const [shuffle, setShuffle] = useState(false)

  useDocumentTitle(`${state.status === 'ready' ? state.data.title : 'Quiz'} · Teaching studio`)

  function hydrate(data: TeacherQuizDetailDTO) {
    setTitle(data.title)
    setInstructions(data.instructions)
    setOpensAt(toDateTimeInput(data.opensAt))
    setClosesAt(toDateTimeInput(data.closesAt))
    setDuration(String(data.durationMinutes))
    setAttempts(String(data.attemptsAllowed))
    setPass(String(data.passPercent))
    setRelease(data.releasePolicy)
    setShuffle(data.shuffleQuestions)
    setFormError('')
  }

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    teacherApi.get<TeacherQuizDetailDTO>(base).then((res) => {
      if (cancelled) return
      if (!res.ok) return setState({ status: 'error', error: res.error, code: res.status })
      setState({ status: 'ready', data: res.data })
      hydrate(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [base, reload])

  /** Run a mutation that answers with the whole quiz. Settings the teacher is typing are kept unless asked. */
  async function send(key: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown, rehydrate = false) {
    setBusy(key)
    setActionError('')
    const res =
      method === 'PATCH'
        ? await teacherApi.patch<TeacherQuizDetailDTO>(path, body ?? {})
        : method === 'DELETE'
          ? await teacherApi.del<TeacherQuizDetailDTO>(path)
          : method === 'PUT'
            ? await teacherApi.put<TeacherQuizDetailDTO>(path, body ?? {})
            : await teacherApi.post<TeacherQuizDetailDTO>(path, body ?? {})
    setBusy(null)
    if (!res.ok) {
      setActionError(res.error)
      return null
    }
    setState({ status: 'ready', data: res.data })
    if (rehydrate) hydrate(res.data)
    return res.data
  }

  async function saveSettings() {
    if (title.trim().length < 2) return setFormError('Give the quiz a title of at least 2 characters.')
    const opens = fromDateTimeInput(opensAt)
    const closes = fromDateTimeInput(closesAt)
    if (!opens || !closes) return setFormError('Set both an opening and a closing time.')
    if (Date.parse(closes) <= Date.parse(opens)) return setFormError('The quiz must close after it opens.')
    const minutes = Number(duration)
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) return setFormError('Set a time limit between 1 and 600 minutes.')
    const tries = Number(attempts)
    if (!Number.isInteger(tries) || tries < 1 || tries > 10) return setFormError('Allow between 1 and 10 attempts.')
    const passMark = Number(pass)
    if (!Number.isInteger(passMark) || passMark < 0 || passMark > 100) return setFormError('Set a pass mark from 0 to 100%.')
    setFormError('')
    const data = await send(
      'settings',
      'PATCH',
      base,
      { title: title.trim(), instructions: instructions.trim(), opensAt: opens, closesAt: closes, durationMinutes: minutes, attemptsAllowed: tries, passPercent: passMark, releasePolicy: release, shuffleQuestions: shuffle },
      true,
    )
    if (data) toast('Quiz settings saved')
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading quiz">
        <Skeleton className="h-24" />
        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="flex flex-col gap-6">
        <Link to="/teach/quizzes" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          All quizzes
        </Link>
        <div className="flex flex-col gap-4 border border-line bg-surface p-6">
          <h1 className="font-display text-[26px]">{state.code === 404 ? 'This quiz is not in one of your courses' : 'The quiz could not be loaded'}</h1>
          <p role="alert" className="flex items-start gap-2.5 text-[14px] text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
              Try again
            </Button>
            <Button to="/teach/quizzes" variant="ghost">
              Back to quizzes
            </Button>
          </div>
        </div>
      </section>
    )
  }

  const quiz = state.data
  const statusMeta = QUIZ_STATUS_META[quiz.status]
  const isPublished = quiz.status !== 'DRAFT'
  const closePassed = Date.parse(quiz.closesAt) <= Date.now()
  const unmet = quiz.publish.requirements.filter((r) => !r.satisfied)
  const submitted = quiz.attempts.filter((a) => a.status !== 'IN_PROGRESS')
  const sat = quiz.enrolledCount ? Math.round((quiz.studentCount / quiz.enrolledCount) * 100) : 0
  const passedCount = submitted.filter((a) => a.passed).length

  return (
    <section className="flex flex-col gap-6">
      <Link to="/teach/quizzes" className="inline-flex w-fit items-center gap-2 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        All quizzes
      </Link>

      <PageHeader
        eyebrow={quiz.courseTitle}
        title={quiz.title}
        description={`${quiz.questionCount} ${quiz.questionCount === 1 ? 'question' : 'questions'} · ${quiz.maxScore} marks · ${quiz.durationMinutes} min · pass ${quiz.passPercent}%`}
        actions={
          <>
            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            {isPublished && quiz.status === 'CLOSED' && !closePassed && (
              <Button variant="secondary" size="sm" loading={busy === 'close'} onClick={() => send('close', 'POST', `${base}/reopen`).then((d) => d && toast('Quiz re-opened'))}>
                Reopen
              </Button>
            )}
            {isPublished && (quiz.status === 'OPEN' || quiz.status === 'SCHEDULED') && (
              <Button variant="secondary" size="sm" loading={busy === 'close'} onClick={() => send('close', 'POST', `${base}/close`).then((d) => d && toast('Quiz closed to new attempts'))}>
                Close early
              </Button>
            )}
            {isPublished ? (
              <Button
                variant="secondary"
                size="sm"
                loading={busy === 'publish'}
                disabled={quiz.attempts.length > 0}
                title={quiz.attempts.length ? 'Students have started this quiz, so it stays published.' : undefined}
                onClick={() => send('publish', 'POST', `${base}/unpublish`).then((d) => d && toast('Quiz returned to draft'))}
              >
                Unpublish
              </Button>
            ) : (
              <Button
                size="sm"
                loading={busy === 'publish'}
                disabled={!quiz.publish.canPublish}
                title={quiz.publish.canPublish ? undefined : 'Complete the publish checklist first'}
                onClick={() => send('publish', 'POST', `${base}/publish`).then((d) => d && toast('Quiz published to students'))}
              >
                Publish quiz
              </Button>
            )}
          </>
        }
      />

      {actionError && (
        <div role="alert" className="flex items-start gap-2.5 border border-[rgb(160_48_36/0.25)] bg-danger-soft px-4 py-3 text-[13.5px] text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="text-[12px] underline underline-offset-4">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            title="Questions"
            description={quiz.editable ? 'Add, edit and order the questions. They are fixed once the quiz is published.' : 'Published: the question set is fixed. Unpublish (before anyone starts) to change it.'}
            action={
              quiz.editable ? (
                <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
                  Add question
                </Button>
              ) : undefined
            }
          >
            {quiz.questions.length === 0 ? (
              <EmptyState className="border-0" title="No questions yet" body="Add single choice, multiple choice, true/false or short answer questions." />
            ) : (
              <ol className="flex flex-col divide-y divide-line">
                {quiz.questions.map((q, i) => (
                  <li key={q.id} className="flex flex-col gap-2.5 px-5 py-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <span className="figures mt-0.5 text-[12px] text-muted">Q{i + 1}</span>
                      <p className="min-w-0 flex-1 text-[14px] leading-relaxed whitespace-pre-line">{q.prompt}</p>
                      <Badge>{QUESTION_TYPE_META[q.type].label}</Badge>
                      <span className="figures text-[12.5px] text-muted">
                        {q.points} {q.points === 1 ? 'pt' : 'pts'}
                      </span>
                    </div>
                    {q.options.length > 0 && (
                      <ul className="flex flex-col gap-1 pl-7">
                        {q.options.map((o) => {
                          const correct = q.correctOptionIds.includes(o.id)
                          return (
                            <li key={o.id} className={cx('flex items-center gap-2 text-[13px]', correct ? 'font-medium text-lime-ink' : 'text-muted')}>
                              {correct ? <Check className="size-3.5 shrink-0" aria-hidden /> : <span className="size-3.5 shrink-0" aria-hidden />}
                              {o.text}
                              {correct && <span className="sr-only"> (correct)</span>}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    {q.type === 'SHORT_ANSWER' && q.modelAnswer && <p className="pl-7 text-[12.5px] text-muted">Marking guide: {q.modelAnswer}</p>}
                    {quiz.editable && (
                      <div className="flex flex-wrap gap-1 pl-6">
                        <IconButton aria-label={`Move question ${i + 1} up`} disabled={i === 0 || busy !== null} onClick={() => send(`move-${q.id}`, 'POST', `/api/teacher/quiz-questions/${q.id}/move`, { direction: 'UP' })}>
                          <ArrowUp className="size-4" aria-hidden />
                        </IconButton>
                        <IconButton
                          aria-label={`Move question ${i + 1} down`}
                          disabled={i === quiz.questions.length - 1 || busy !== null}
                          onClick={() => send(`move-${q.id}`, 'POST', `/api/teacher/quiz-questions/${q.id}/move`, { direction: 'DOWN' })}
                        >
                          <ArrowDown className="size-4" aria-hidden />
                        </IconButton>
                        <IconButton aria-label={`Edit question ${i + 1}`} disabled={busy !== null} onClick={() => setEditing(q)}>
                          <Pencil className="size-4" aria-hidden />
                        </IconButton>
                        <IconButton
                          aria-label={`Delete question ${i + 1}`}
                          disabled={busy !== null}
                          onClick={() => send(`del-${q.id}`, 'DELETE', `/api/teacher/quiz-questions/${q.id}`).then((d) => d && toast('Question deleted'))}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </IconButton>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Settings" description="When the quiz runs, how long each attempt lasts, and when results are shown.">
            <div className="flex flex-col gap-4 px-5 py-4">
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea label="Instructions" optional rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
                <Input label="Closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input label="Time limit (min)" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
                <Input label="Attempts allowed" inputMode="numeric" value={attempts} onChange={(e) => setAttempts(e.target.value)} />
                <Input label="Pass mark (%)" inputMode="numeric" value={pass} onChange={(e) => setPass(e.target.value)} />
              </div>
              <Select label="Results" value={release} onChange={(e) => setRelease(e.target.value as QuizReleasePolicy)} hint={RELEASE_META[release].description}>
                {(Object.keys(RELEASE_META) as QuizReleasePolicy[]).map((p) => (
                  <option key={p} value={p}>
                    {RELEASE_META[p].label}
                  </option>
                ))}
              </Select>
              <Checkbox label="Shuffle question order for each attempt" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
              {formError && (
                <p role="alert" className="flex items-center gap-1.5 text-[13px] text-danger">
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                  {formError}
                </p>
              )}
              <div className="flex justify-end">
                <Button size="sm" loading={busy === 'settings'} onClick={saveSettings}>
                  Save settings
                </Button>
              </div>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          {!isPublished && (
            <Panel title="Publish checklist" description={quiz.publish.canPublish ? 'Every requirement is met.' : `${unmet.length} requirement${unmet.length === 1 ? '' : 's'} outstanding`}>
              <ul className="flex flex-col divide-y divide-line">
                {quiz.publish.requirements.map((r) => (
                  <li key={r.key} className="flex items-start gap-2.5 px-5 py-3">
                    <span
                      className={cx(
                        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                        r.satisfied ? 'border-[rgb(47_107_79/0.4)] bg-lime-soft text-lime-ink' : 'border-line-strong text-faint',
                      )}
                      aria-hidden
                    >
                      {r.satisfied ? <Check className="size-2.5" strokeWidth={3} /> : <X className="size-2.5" />}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className={cx('text-[13px]', r.satisfied ? 'text-muted' : 'font-medium text-fg')}>
                        {r.label}
                        <span className="sr-only">{r.satisfied ? ' — met' : ' — not met'}</span>
                      </span>
                      {!r.satisfied && r.detail && <span className="text-[11.5px] text-muted">{r.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Results" description="Against every enrolment on the course.">
            <div className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-muted">Students who have sat it</span>
                <span className="figures text-[13px]">
                  {quiz.studentCount} of {quiz.enrolledCount}
                </span>
              </div>
              <ProgressBar value={sat} />
              <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                {[
                  { k: 'Attempts', v: String(quiz.attemptCount) },
                  { k: 'To mark', v: String(quiz.toMarkCount) },
                  { k: 'Average', v: quiz.averagePercent === null ? '—' : `${quiz.averagePercent}%` },
                  { k: 'Passed', v: String(passedCount) },
                ].map((s) => (
                  <div key={s.k} className="flex flex-col gap-0.5">
                    <dt className="text-[11.5px] text-muted">{s.k}</dt>
                    <dd className="figures text-[19px] leading-none font-semibold">{s.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Panel>

          <Panel title="Attempts" description={quiz.attempts.length ? 'Waiting to mark first, then newest.' : 'Nobody has started yet.'}>
            {quiz.attempts.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted">Students take quizzes from the student portal. Each attempt appears here as soon as it starts.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {quiz.attempts.map((a) => {
                  const meta = ATTEMPT_STATUS_META[a.status]
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <Link to={`/teach/quizzes/${quiz.id}/attempts/${a.id}`} className="truncate text-[13.5px] font-medium underline decoration-transparent underline-offset-4 hover:decoration-amber">
                          {a.studentName}
                        </Link>
                        <span className="text-[11.5px] text-muted">
                          Attempt {a.attemptNumber} · {a.submittedAt ? dateTimeLabel(a.submittedAt) : `started ${dateTimeLabel(a.startedAt)}`}
                          {a.autoSubmitted ? ' · timed out' : ''}
                        </span>
                      </span>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="figures w-14 text-right text-[13px]">{a.score === null ? '—' : `${a.score}/${a.maxScore}`}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <div className="flex flex-col gap-1.5 border border-line bg-surface px-5 py-4 text-[12px] text-muted">
            <span>Created {dateTimeLabel(quiz.createdAt)}</span>
            {quiz.publishedAt && <span>Published {dateTimeLabel(quiz.publishedAt)}</span>}
            <span>Updated {dateTimeLabel(quiz.updatedAt)}</span>
          </div>
        </div>
      </div>

      {editing && (
        <QuestionEditor
          question={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const isNew = editing === 'new'
            const res = isNew ? await teacherApi.post<TeacherQuizDetailDTO>(`${base}/questions`, input) : await teacherApi.put<TeacherQuizDetailDTO>(`/api/teacher/quiz-questions/${editing.id}`, input)
            if (!res.ok) return res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error
            setState({ status: 'ready', data: res.data })
            setEditing(null)
            toast(isNew ? 'Question added' : 'Question saved')
            return null
          }}
        />
      )}
    </section>
  )
}

type OptionDraft = { key: number; text: string; correct: boolean }

let optionKey = 0
const blankOptions = (): OptionDraft[] => [0, 1, 2, 3].map(() => ({ key: ++optionKey, text: '', correct: false }))

/** Add or edit one question. Returns the server's error message, or null on success. */
function QuestionEditor({ question, onClose, onSave }: { question: QuizQuestionAuthoringDTO | null; onClose: () => void; onSave: (input: QuizQuestionInput) => Promise<string | null> }) {
  const [type, setType] = useState<QuizQuestionType>(question?.type ?? 'SINGLE_CHOICE')
  const [prompt, setPrompt] = useState(question?.prompt ?? '')
  const [points, setPoints] = useState(String(question?.points ?? 1))
  const [modelAnswer, setModelAnswer] = useState(question?.modelAnswer ?? '')
  const [truth, setTruth] = useState<'true' | 'false' | null>(question?.type === 'TRUE_FALSE' ? (question.correctOptionIds[0] as 'true' | 'false') : null)
  const [options, setOptions] = useState<OptionDraft[]>(() =>
    question && (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE')
      ? question.options.map((o) => ({ key: ++optionKey, text: o.text, correct: question.correctOptionIds.includes(o.id) }))
      : blankOptions(),
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isChoice = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE'

  function toggleCorrect(key: number) {
    setOptions((rows) => rows.map((o) => (o.key === key ? { ...o, correct: type === 'MULTIPLE_CHOICE' ? !o.correct : true } : type === 'SINGLE_CHOICE' ? { ...o, correct: false } : o)))
  }

  async function save() {
    const value = Number(points)
    if (prompt.trim().length < 3) return setError('Write the question first.')
    if (!Number.isInteger(value) || value < 1 || value > 100) return setError('Give the question 1–100 points.')

    let input: QuizQuestionInput
    if (type === 'TRUE_FALSE') {
      if (!truth) return setError('Choose whether the statement is true or false.')
      input = { type, prompt: prompt.trim(), points: value, options: [], correctIndexes: [truth === 'true' ? 0 : 1], modelAnswer: '' }
    } else if (type === 'SHORT_ANSWER') {
      input = { type, prompt: prompt.trim(), points: value, options: [], correctIndexes: [], modelAnswer: modelAnswer.trim() }
    } else {
      const filled = options.filter((o) => o.text.trim())
      if (filled.length < 2) return setError('Give at least two options.')
      const correct = filled.flatMap((o, i) => (o.correct ? [i] : []))
      if (!correct.length) return setError('Mark the correct option.')
      if (type === 'SINGLE_CHOICE' && correct.length > 1) return setError('Single choice takes exactly one correct option.')
      input = { type, prompt: prompt.trim(), points: value, options: filled.map((o) => ({ text: o.text.trim() })), correctIndexes: correct, modelAnswer: '' }
    }

    setSaving(true)
    setError('')
    const failure = await onSave(input)
    setSaving(false)
    if (failure) setError(failure)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={question ? 'Edit question' : 'Add question'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {question ? 'Save question' : 'Add question'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Select
            label="Type"
            value={type}
            hint={QUESTION_TYPE_META[type].hint}
            onChange={(e) => {
              const next = e.target.value as QuizQuestionType
              setType(next)
              if (next === 'SINGLE_CHOICE') setOptions((rows) => rows.map((o, i) => ({ ...o, correct: o.correct && rows.findIndex((r) => r.correct) === i })))
            }}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_META[t].label}
              </option>
            ))}
          </Select>
          <Input label="Points" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} />
        </div>

        <Textarea label={type === 'TRUE_FALSE' ? 'Statement' : 'Question'} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />

        {type === 'TRUE_FALSE' && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-medium">The statement is</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard name="truth" checked={truth === 'true'} onChange={() => setTruth('true')} title="True" />
              <ChoiceCard name="truth" checked={truth === 'false'} onChange={() => setTruth('false')} title="False" />
            </div>
          </fieldset>
        )}

        {isChoice && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-medium">Options, with the correct {type === 'MULTIPLE_CHOICE' ? 'ones' : 'one'} ticked</legend>
            {options.map((o, i) => (
              <div key={o.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleCorrect(o.key)}
                  aria-pressed={o.correct}
                  aria-label={`Option ${i + 1} is correct`}
                  className={cx(
                    'flex size-9 shrink-0 items-center justify-center border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-deep',
                    type === 'SINGLE_CHOICE' ? 'rounded-full' : 'rounded-[2px]',
                    o.correct ? 'border-[rgb(47_107_79/0.5)] bg-lime-soft text-lime-ink' : 'border-line-strong text-faint hover:text-muted',
                  )}
                >
                  <Check className="size-4" strokeWidth={o.correct ? 3 : 2} aria-hidden />
                </button>
                <Input label={`Option ${i + 1}`} hideLabel placeholder={`Option ${i + 1}`} value={o.text} className="flex-1" onChange={(e) => setOptions((rows) => rows.map((r) => (r.key === o.key ? { ...r, text: e.target.value } : r)))} />
                <IconButton aria-label={`Remove option ${i + 1}`} disabled={options.length <= 2} onClick={() => setOptions((rows) => rows.filter((r) => r.key !== o.key))}>
                  <X className="size-4" aria-hidden />
                </IconButton>
              </div>
            ))}
            {options.length < 8 && (
              <div>
                <Button variant="ghost" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setOptions((rows) => [...rows, { key: ++optionKey, text: '', correct: false }])}>
                  Add option
                </Button>
              </div>
            )}
            <p className="text-[12px] text-muted">Empty options are dropped when you save.</p>
          </fieldset>
        )}

        {type === 'SHORT_ANSWER' && (
          <Textarea label="Marking guide" optional rows={3} value={modelAnswer} onChange={(e) => setModelAnswer(e.target.value)} hint="Only you see this, next to each answer you mark." />
        )}

        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-[13px] text-danger">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
