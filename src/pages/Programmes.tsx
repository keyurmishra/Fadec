import { Bookmark, Search, SearchX } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '../components/Button'
import { Select } from '../components/Field'
import { Header } from '../components/Header'
import { PageIntro } from '../components/PageIntro'
import { ProgrammeCard, nextOpenCohort } from '../components/ProgrammeCard'
import { Chip, Container, EmptyState, Reveal } from '../components/ui'
import { AWARDS, MODES, PROGRAMMES, SCHOOLS, type Award, type Mode, type School } from '../content'
import { useStore } from '../lib/store'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const SORTS = [
  { value: 'start', label: 'Next start date' },
  { value: 'fee-asc', label: 'Fee, low to high' },
  { value: 'fee-desc', label: 'Fee, high to low' },
  { value: 'title', label: 'Name' },
] as const

/** Programme finder. Every filter lives in the URL, so a filtered view can be shared or bookmarked. */
export function Programmes() {
  useDocumentTitle('Courses')
  const [params, setParams] = useSearchParams()
  const { shortlist } = useStore()
  const q = params.get('q') ?? ''
  const award = params.get('award') as Award | null
  const school = params.get('school') as School | null
  const mode = params.get('mode') as Mode | null
  const saved = params.get('saved') === '1'
  const sort = (params.get('sort') ?? 'start') as (typeof SORTS)[number]['value']

  const set = (key: string, value: string | null) => {
    // Read the live URL, not the render-time params, so quick successive changes never drop one.
    setParams(
      () => {
        const next = new URLSearchParams(window.location.search)
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  }

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = PROGRAMMES.filter(
      (p) =>
        (!award || p.award === award) &&
        (!school || p.school === school) &&
        (!mode || p.mode === mode) &&
        (!saved || shortlist.includes(p.slug)) &&
        (!needle || [p.title, p.summary, p.school, ...p.curriculum.flatMap((s) => s.modules.map((m) => m.title))].join(' ').toLowerCase().includes(needle)),
    )
    const start = (s: (typeof PROGRAMMES)[number]) => nextOpenCohort(s)?.start ?? '9999'
    return [...list].sort((a, b) =>
      sort === 'fee-asc' ? a.fee - b.fee : sort === 'fee-desc' ? b.fee - a.fee : sort === 'title' ? a.title.localeCompare(b.title) : start(a).localeCompare(start(b)),
    )
  }, [q, award, school, mode, saved, sort, shortlist])

  const anyFilter = !!(q || award || school || mode || saved)

  return (
    <>
      <Header />
      <PageIntro kicker="Course finder" title="Find the course that fits your week" body="Filter by award, school and study mode. Every card shows the next intake with open seats and the fee you will actually pay." />
      <section className="pb-24">
        <Container className="flex flex-col gap-8">
          <div className="sticky top-0 z-20 flex flex-col gap-4 border-b border-line bg-bg px-1 py-4 md:py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <label className="relative flex-1">
                <span className="sr-only">Search courses and subjects</span>
                <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => set('q', e.target.value)}
                  placeholder="Search courses and subjects, e.g. meteorology"
                  className="h-12 w-full rounded-[3px] border border-line-strong bg-surface pr-4 pl-11 text-[15px] text-fg placeholder:text-faint hover:border-line-strong focus:outline-none focus-visible:border-amber-deep focus-visible:shadow-[0_0_0_3px_rgb(176_118_28/0.18)]"
                />
              </label>
              <div className="flex gap-3">
                <Select label="Sort by" hideLabel value={sort} onChange={(e) => set('sort', e.target.value === 'start' ? null : e.target.value)} className="min-w-[200px] flex-1">
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      Sort: {s.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1" role="group" aria-label="Award">
              <Chip active={!award} onClick={() => set('award', null)}>
                All awards
              </Chip>
              {AWARDS.map((a) => (
                <Chip key={a} active={award === a} onClick={() => set('award', award === a ? null : a)}>
                  {a}
                </Chip>
              ))}
              <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />
              <Chip active={saved} onClick={() => set('saved', saved ? null : '1')}>
                <Bookmark className="size-4" aria-hidden />
                Shortlist ({shortlist.length})
              </Chip>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1" role="group" aria-label="School">
                {SCHOOLS.map((s) => (
                  <Chip key={s} active={school === s} onClick={() => set('school', school === s ? null : s)}>
                    {s}
                  </Chip>
                ))}
              </div>
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1 sm:ml-auto" role="group" aria-label="Study mode">
                {MODES.map((m) => (
                  <Chip key={m} active={mode === m} onClick={() => set('mode', mode === m ? null : m)}>
                    {m}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase" role="status" aria-live="polite">
              {results.length} {results.length === 1 ? 'course' : 'courses'}
            </p>
            {anyFilter && (
              <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Clear filters
              </Button>
            )}
          </div>

          {results.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((p, i) => (
                <Reveal as="li" key={p.slug} delay={Math.min(i, 5) * 0.04} className="h-full">
                  <ProgrammeCard p={p} />
                </Reveal>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<SearchX className="size-6" aria-hidden />}
              title={saved && !shortlist.length ? 'Your shortlist is empty' : 'No course matches those filters'}
              body={saved && !shortlist.length ? 'Use the bookmark on any course card to keep it here while you compare.' : 'Try a broader search or remove a filter. New courses are added every term.'}
              action={
                <Button variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                  Clear filters
                </Button>
              }
            />
          )}
        </Container>
      </section>
    </>
  )
}
