import { ArrowUpRight, Bookmark, BookmarkCheck } from 'lucide-react'
import { Link } from 'react-router'

import type { Programme } from '../content'
import { fmtDate, money } from '../lib/format'
import { img } from '../lib/images'
import { useStore } from '../lib/store'
import { IconButton } from './Button'
import { Badge, type Tone } from './ui'

export const AWARD_TONE: Record<Programme['award'], Tone> = { Licence: 'violet', Rating: 'blue', Certificate: 'lime' }

export function nextOpenCohort(p: Programme) {
  return p.cohorts.find((c) => c.taken < c.seats) ?? null
}

export function ProgrammeCard({ p }: { p: Programme }) {
  const { shortlist, toggleShortlist } = useStore()
  const saved = shortlist.includes(p.slug)
  const next = nextOpenCohort(p)
  return (
    <article className="group relative flex h-full flex-col border border-line bg-surface transition-colors duration-200 hover:border-[rgb(15_33_55/0.4)]">
      <div className="relative aspect-[16/10] overflow-hidden border-b border-line">
        <img
          src={img(p.image)}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        />
        <span className="absolute top-0 left-0 border-r border-b border-line bg-surface px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
          {p.award}
        </span>
        <IconButton
          aria-label={saved ? `Remove ${p.title} from shortlist` : `Shortlist ${p.title}`}
          aria-pressed={saved}
          onClick={() => toggleShortlist(p.slug)}
          className="absolute top-2 right-2 z-10"
        >
          {saved ? <BookmarkCheck className="size-4 text-amber-ink" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
        </IconButton>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <p className="text-[10.5px] font-semibold tracking-[0.14em] text-muted uppercase">
          {p.school} · {p.mode}
        </p>
        <h3 className="font-display text-[23px] leading-[1.12] tracking-[-0.005em]">
          <Link
            to={`/programmes/${p.slug}`}
            className="-my-2 inline-block py-2 after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-amber-deep"
          >
            {p.title}
          </Link>
        </h3>
        <p className="text-[13.5px] leading-relaxed text-muted">{p.summary}</p>

        <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-line pt-4 text-[12.5px]">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[10.5px] tracking-[0.12em] text-faint uppercase">Next start</dt>
            <dd className="figures font-medium">{next ? fmtDate(next.start, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Waitlist'}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[10.5px] tracking-[0.12em] text-faint uppercase">Tuition</dt>
            <dd className="figures font-medium">
              {money(p.fee)}
              <span className="text-muted"> total</span>
            </dd>
          </div>
        </dl>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-[12px] text-muted">
            {p.duration} · {p.hoursPerWeek} a week
          </span>
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-fg">
            Details
            <ArrowUpRight className="size-3.5 text-amber-ink transition-transform group-hover:-translate-y-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </article>
  )
}

/** Kept for screens that render a course's award pill on its own. */
export function AwardBadge({ award }: { award: Programme['award'] }) {
  return <Badge tone={AWARD_TONE[award]}>{award}</Badge>
}
