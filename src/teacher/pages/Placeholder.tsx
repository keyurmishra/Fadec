import { ArrowRight } from 'lucide-react'

import { Badge, Card } from '../../components/ui'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PageHeader } from '../components/ui'

/*
  An honest placeholder. Every sidebar destination exists and is guarded, so
  navigation is complete; the screen states which phase brings its data and
  what it will contain, instead of showing invented records.
*/
export function TeacherPlaceholder({ title, phase, description, items }: { title: string; phase: string; description: string; items: string[] }) {
  useDocumentTitle(`${title} · Teaching studio`)
  return (
    <section className="flex flex-col gap-8">
      <PageHeader eyebrow="Teaching studio" title={title} description={description} actions={<Badge tone="amber">{phase}</Badge>} />

      <Card className="flex flex-col gap-5 p-6 md:p-8">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-[24px] leading-tight">This screen ships in {phase}</h2>
          <p className="max-w-[68ch] text-[14.5px] leading-relaxed text-muted">
            The route, the sidebar entry and the role guard are live now. What is missing is the data layer behind it — the endpoint and table named in the build plan.
            Nothing here is mocked to look finished.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">What it will contain</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-2 border-t border-line pt-2 text-[13.5px] text-muted">
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-amber-ink" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </section>
  )
}
