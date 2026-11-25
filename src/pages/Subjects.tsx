import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, ExternalLink, FileText, Layers, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '../components/Button'
import { Header } from '../components/Header'
import { Badge, Card, Container, EmptyState, Kicker, Skeleton } from '../components/ui'
import type { StudentSubjectDetailDTO, StudentSubjectSummaryDTO } from '../contracts/teaching'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/*
  Student-facing subject catalogue.

  It reads published rows only: an unpublished subject, a topic with no live
  lecture and every draft lecture are filtered out on the server. What it cannot
  do yet is scope the list to the subjects of the signed-in student's courses —
  student sessions are still local-only and there is no enrolment API. The page
  says so instead of pretending, and the notes name the endpoint that will fix
  it: GET /api/student/subjects, authorised by the student session.
*/
type Load<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: string }

async function getJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { ok: false, error: typeof json.error === 'string' ? json.error : 'That page could not be loaded.' }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'We could not reach the subject catalogue. Check your connection and try again.' }
  }
}

function EnrolmentNote() {
  return (
    <p className="border-l-2 border-amber bg-amber-soft px-4 py-3 text-[12.5px] leading-relaxed text-amber-ink">
      Enrolment scoping is not connected yet: student sessions are stored on this device only, so this page shows every published subject rather than the
      subjects of your own courses. A <code className="font-mono">GET /api/student/subjects</code> endpoint authorised by a real student session is required.
    </p>
  )
}

export function Subjects() {
  useDocumentTitle('Subjects')
  const [state, setState] = useState<Load<{ items: StudentSubjectSummaryDTO[] }>>({ status: 'loading' })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getJson<{ items: StudentSubjectSummaryDTO[] }>('/api/subjects').then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error })
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  return (
    <>
      <Header />
      <section className="border-b border-line py-12 md:py-16">
        <Container className="flex max-w-[1100px] flex-col gap-4">
          <Kicker>Academic subjects</Kicker>
          <h1 className="font-display max-w-[24ch] text-[38px] leading-[1.03] tracking-[-0.015em] md:text-[52px]">The ground subjects behind every course</h1>
          <p className="max-w-[58ch] text-[16px] leading-relaxed text-muted">
            Meteorology, navigation and air regulation are taught inside your training courses. Open a subject to read its syllabus and the lectures your
            instructors have published.
          </p>
        </Container>
      </section>

      <section className="py-12 md:py-16">
        <Container className="flex max-w-[1100px] flex-col gap-6">
          <EnrolmentNote />

          {state.status === 'loading' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading subjects">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-[240px]" />
              ))}
            </div>
          )}

          {state.status === 'error' && (
            <Card className="flex flex-col gap-4 p-6">
              <p role="alert" className="flex items-start gap-2.5 text-[14px] text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {state.error}
              </p>
              <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
                Try again
              </Button>
            </Card>
          )}

          {state.status === 'ready' && !state.data.items.length && (
            <EmptyState
              icon={<Layers className="size-6" aria-hidden />}
              title="No subjects published yet"
              body="As soon as a subject is published, and has at least one published lecture, it appears here."
              action={<Button to="/dashboard">Back to the student hub</Button>}
            />
          )}

          {state.status === 'ready' && state.data.items.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {state.data.items.map((subject) => (
                <Card as="li" key={subject.id} className="flex flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-11 items-center justify-center rounded-[2px] border border-line bg-navy-soft text-navy" aria-hidden>
                      <BookOpen className="size-5" />
                    </span>
                    <Badge tone="lime">Published</Badge>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <h2 className="font-display text-[21px] leading-tight">
                      <Link to={`/subjects/${subject.id}`} className="underline decoration-transparent underline-offset-4 hover:decoration-amber">
                        {subject.name}
                      </Link>
                    </h2>
                    <p className="text-[13.5px] leading-relaxed text-muted">{subject.description}</p>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 border-y border-line py-3">
                    {[
                      { k: 'Topics', v: subject.topicCount },
                      { k: 'Lessons', v: subject.lessonCount },
                      { k: 'Lectures', v: subject.lectureCount },
                    ].map((s) => (
                      <div key={s.k} className="flex flex-col gap-0.5">
                        <dt className="text-[11px] text-muted">{s.k}</dt>
                        <dd className="figures text-[17px] leading-none font-semibold">{s.v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-wrap gap-1.5">
                    {subject.courses.map((c) => (
                      <span key={c.id} className="inline-flex h-6 items-center rounded-[2px] border border-line bg-surface-2 px-2 text-[11.5px] text-muted">
                        {c.title}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto">
                    <Button to={`/subjects/${subject.id}`} variant="secondary" size="sm" iconRight={<ArrowRight className="size-3.5" aria-hidden />}>
                      Open syllabus
                    </Button>
                  </div>
                </Card>
              ))}
            </ul>
          )}
        </Container>
      </section>
    </>
  )
}

export function SubjectDetail() {
  const { subjectId = '' } = useParams()
  const [state, setState] = useState<Load<StudentSubjectDetailDTO>>({ status: 'loading' })
  const [reload, setReload] = useState(0)

  useDocumentTitle(`${state.status === 'ready' ? state.data.name : 'Subject'} · Subjects`)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getJson<StudentSubjectDetailDTO>(`/api/subjects/${subjectId}`).then((res) => {
      if (cancelled) return
      setState(res.ok ? { status: 'ready', data: res.data } : { status: 'error', error: res.error })
    })
    return () => {
      cancelled = true
    }
  }, [subjectId, reload])

  return (
    <>
      <Header />
      <section className="py-10 md:py-14">
        <Container className="flex max-w-[1000px] flex-col gap-8">
          <Link to="/subjects" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-4" aria-hidden />
            All subjects
          </Link>

          {state.status === 'loading' && (
            <div className="flex flex-col gap-4" role="status" aria-label="Loading subject">
              <Skeleton className="h-28" />
              <Skeleton className="h-64" />
            </div>
          )}

          {state.status === 'error' && (
            <Card className="flex flex-col gap-4 p-6">
              <h1 className="font-display text-[26px]">This subject is not available</h1>
              <p role="alert" className="flex items-start gap-2.5 text-[14px] text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {state.error}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setReload((n) => n + 1)}>
                  Try again
                </Button>
                <Button to="/subjects" variant="ghost">
                  All subjects
                </Button>
              </div>
            </Card>
          )}

          {state.status === 'ready' && (
            <>
              <div className="flex flex-col gap-4 border-b border-line pb-6">
                <Kicker>Subject</Kicker>
                <h1 className="font-display text-[36px] leading-[1.05] tracking-[-0.015em] md:text-[46px]">{state.data.name}</h1>
                <p className="max-w-[62ch] text-[16px] leading-relaxed text-muted">{state.data.description}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {state.data.courses.map((c) => (
                    <Badge key={c.id} tone="blue">
                      {c.title}
                    </Badge>
                  ))}
                  <span className="text-[12.5px] text-muted">
                    {state.data.topicCount} topics · {state.data.lessonCount} lessons · {state.data.lectureCount} published lectures
                  </span>
                </div>
              </div>

              <EnrolmentNote />

              {!state.data.topics.length ? (
                <EmptyState
                  title="Nothing published in this subject yet"
                  body="Your instructors have not published a lecture here. Draft lessons stay hidden until they do."
                  action={<Button to="/subjects" variant="secondary">Browse other subjects</Button>}
                />
              ) : (
                <div className="flex flex-col gap-4">
                  {state.data.topics.map((topic, ti) => (
                    <Card key={topic.id} className="flex flex-col">
                      <div className="flex flex-col gap-1 border-b border-line p-5">
                        <span className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Topic {ti + 1}</span>
                        <h2 className="text-[18px] leading-snug font-semibold">{topic.title}</h2>
                        {topic.description && <p className="text-[13.5px] leading-relaxed text-muted">{topic.description}</p>}
                      </div>
                      <ul className="divide-y divide-line">
                        {topic.lessons.map((lesson) => (
                          <li key={lesson.id} className="flex flex-col gap-3 p-5">
                            <div className="flex flex-col gap-0.5">
                              <h3 className="text-[15px] font-medium">{lesson.title}</h3>
                              {lesson.description && <p className="text-[13px] text-muted">{lesson.description}</p>}
                            </div>
                            <ul className="flex flex-col gap-2">
                              {lesson.lectures.map((lecture) => (
                                <li key={lecture.id} className="flex flex-col gap-2 border border-line bg-surface-2 px-3.5 py-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge tone={lecture.kind === 'VIDEO' ? 'blue' : 'neutral'}>{lecture.kind === 'VIDEO' ? 'Video' : 'Text'}</Badge>
                                    <span className="text-[14px] font-medium">{lecture.title}</span>
                                    <span className="text-[12px] text-muted">
                                      {lecture.courseTitle} · {lecture.estimatedMinutes} min
                                    </span>
                                  </div>
                                  {lecture.resources.length > 0 && (
                                    <ul className="flex flex-col gap-1.5">
                                      {lecture.resources.map((resource) =>
                                        resource.externalUrl ? (
                                          <li key={resource.id}>
                                            <a
                                              href={resource.externalUrl}
                                              target="_blank"
                                              rel="noreferrer noopener"
                                              className="inline-flex items-center gap-1.5 text-[12.5px] text-fg underline decoration-amber decoration-1 underline-offset-4"
                                            >
                                              <ExternalLink className="size-3.5" aria-hidden />
                                              {resource.title}
                                            </a>
                                          </li>
                                        ) : (
                                          <li key={resource.id} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                                            <FileText className="size-3.5" aria-hidden />
                                            {resource.title}
                                            {resource.sizeBytes !== null && <span className="text-faint">({Math.round(resource.sizeBytes / 1024)} KB)</span>}
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  ))}
                </div>
              )}

              <p className="text-[12px] text-muted">
                Lectures here are published by your instructors. Draft lectures, unpublished subjects and lessons without a live lecture are never shown. Only
                resources with a link are listed; hosted files appear once the media pipeline is connected.
              </p>
            </>
          )}
        </Container>
      </section>
    </>
  )
}
