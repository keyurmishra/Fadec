import { ArrowRight, CalendarClock } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '../components/Button'
import { Header } from '../components/Header'
import { PageIntro } from '../components/PageIntro'
import { Accordion, Badge, Card, Container, SectionHeading } from '../components/ui'
import { ADMISSIONS, HUB_TODAY, PAYMENT_PLANS, PROGRAMMES, SCHOLARSHIPS } from '../content'
import { daysBetween, fmtDate, money } from '../lib/format'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function Admissions() {
  useDocumentTitle('Admissions')
  const intakes = PROGRAMMES.flatMap((p) => p.cohorts.map((c) => ({ p, c })))
    .filter(({ c }) => c.deadline >= HUB_TODAY)
    .sort((a, b) => a.c.deadline.localeCompare(b.c.deadline))
    .slice(0, 8)

  return (
    <>
      <Header />
      <PageIntro
        kicker="Admissions"
        title="Apply once, start with your cohort"
        body="Applications are free. Most decisions take ten working days, and your deposit stays refundable until two weeks before you start."
        meta="Decisions in 10 working days"
      >
        <div className="flex flex-wrap gap-2 pt-2">
          <Button to="/apply" size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
            Start an application
          </Button>
          <Button to="/events?type=Q%26A" size="lg" variant="secondary">
            Ask admissions
          </Button>
        </div>
      </PageIntro>

      <Container className="flex flex-col gap-16 py-14 pb-24 md:gap-20 md:py-20">
        <section className="flex flex-col gap-8" aria-labelledby="steps">
          <SectionHeading kicker="How it works" title={<span id="steps">Four steps to your first briefing</span>} />
          <ol className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {ADMISSIONS.steps.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-3 bg-surface p-6">
                <span className="figures font-mono text-[11px] tracking-[0.14em] text-amber-ink">0{i + 1}</span>
                <h3 className="font-display text-[21px] leading-tight">{s.title}</h3>
                <p className="text-[13.5px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]" aria-labelledby="dates">
          <div className="flex flex-col gap-6">
            <SectionHeading
              kicker="Requirements"
              title={<span id="dates">Before you apply</span>}
              body="Deadlines are set per intake. Late applications are considered while seats remain."
            />
            <dl className="border-t border-line">
              {ADMISSIONS.requirements.map((r) => (
                <div key={r.title} className="flex flex-col gap-1 border-b border-line py-4">
                  <dt className="text-[13px] font-semibold">{r.title}</dt>
                  <dd className="text-[13.5px] leading-relaxed text-muted">{r.body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[14px]">
              <caption className="sr-only">Application deadlines by course and intake</caption>
              <thead className="text-[10.5px] tracking-[0.14em] text-faint uppercase">
                <tr className="border-b border-line">
                  <th scope="col" className="px-5 py-4 font-semibold">Course</th>
                  <th scope="col" className="hidden px-3 py-4 font-semibold sm:table-cell">Starts</th>
                  <th scope="col" className="px-5 py-4 text-right font-semibold">Apply by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {intakes.map(({ p, c }) => {
                  const days = daysBetween(HUB_TODAY, c.deadline)
                  const full = c.taken >= c.seats
                  return (
                    <tr key={c.id}>
                      <th scope="row" className="px-5 py-3.5 font-normal">
                        <Link to={`/programmes/${p.slug}`} className="inline-flex min-h-10 flex-col justify-center hover:text-amber-ink">
                          <span className="font-medium">{p.title}</span>
                          <span className="text-[12.5px] text-muted">{c.label} intake</span>
                          <span className="text-[12.5px] text-muted sm:hidden">Starts {fmtDate(c.start, { day: 'numeric', month: 'short' })}</span>
                        </Link>
                      </th>
                      <td className="hidden px-3 py-3.5 text-muted sm:table-cell">{fmtDate(c.start, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="flex flex-col items-end gap-1">
                          <span className="figures">{fmtDate(c.deadline, { day: 'numeric', month: 'short' })}</span>
                          {full ? <Badge tone="neutral">Waitlist</Badge> : days <= 35 ? <Badge tone="amber">{days} days left</Badge> : null}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </section>

        <section id="fees" className="flex scroll-mt-6 flex-col gap-8" aria-labelledby="fees-h">
          <SectionHeading
            kicker="Fees and funding"
            title={<span id="fees-h">Clear fees, three ways to pay</span>}
            body="The fee is fixed for the length of your course. Each course page has a calculator with your intake and bursary."
          />
          <div className="grid gap-px border border-line bg-line md:grid-cols-3">
            {PAYMENT_PLANS.map((pl) => (
              <div key={pl.id} className="flex flex-col gap-2 bg-surface p-6">
                <h3 className="font-display text-[19px] leading-tight">{pl.label}</h3>
                <p className="text-[13.5px] leading-relaxed text-muted">{pl.note}</p>
              </div>
            ))}
          </div>
          <Card className="grid gap-8 p-6 md:grid-cols-[1fr_1.3fr] md:p-8">
            <div className="flex flex-col gap-3">
              <h3 className="font-display text-[24px] leading-tight">Bursaries and scholarships</h3>
              <p className="text-[14.5px] leading-relaxed text-muted">
                Tick the bursary question in your application. We assess eligibility with your offer, and you can hold more than one where the rules allow.
              </p>
              <p className="flex items-center gap-2 text-[13.5px] text-muted">
                <CalendarClock className="size-4 shrink-0 text-amber-ink" aria-hidden />
                Deposit {money(ADMISSIONS.deposit)}, refundable until 14 days before your start date
              </p>
            </div>
            <ul className="grid gap-px border border-line bg-line sm:grid-cols-3">
              {SCHOLARSHIPS.filter((s) => s.amount).map((s) => (
                <li key={s.id} className="flex flex-col gap-1 bg-surface p-4">
                  <span className="figures font-display text-[30px] leading-none">{s.amount * 100}%</span>
                  <span className="text-[12.5px] leading-snug text-muted">{s.label}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]" aria-labelledby="faq">
          <SectionHeading kicker="Questions" title={<span id="faq">Before you apply</span>} className="self-start" />
          <Accordion items={ADMISSIONS.faqs} />
        </section>
      </Container>
    </>
  )
}
