import { ArrowRight, Bell, Inbox, Plus, RotateCcw } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Button, IconButton, type ButtonVariant } from '../components/Button'
import { EventCard } from '../components/EventCard'
import { Checkbox, ChoiceCard, FormError, Input, Select, Textarea } from '../components/Field'
import { Header } from '../components/Header'
import { Mark } from '../components/Logo'
import { Modal } from '../components/Modal'
import { ProgrammeCard } from '../components/ProgrammeCard'
import { Timetable } from '../components/Timetable'
import { useToast } from '../components/Toast'
import { Accordion, Badge, Card, Chip, Container, EmptyState, Kicker, Segmented, Skeleton, Stat, Stepper, TabPanel, Tabs, type Tone } from '../components/ui'
import { EVENTS, HUB_TODAY, PROGRAMMES, TIMETABLE } from '../content'
import { mondayOf } from '../lib/format'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const COLORS: { group: string; note?: string; items: { name: string; hex: string; note?: string }[] }[] = [
  {
    group: 'Paper and slate',
    items: [
      { name: 'bg', hex: '#f6f3ec', note: 'warm off-white' },
      { name: 'surface', hex: '#fdfbf7', note: 'panels' },
      { name: 'surface-2', hex: '#eee9df' },
      { name: 'raised', hex: '#e4ded2' },
      { name: 'fg', hex: '#0f2137', note: 'deep navy ink' },
      { name: 'muted', hex: '#515c6b' },
      { name: 'faint', hex: '#6d7684' },
    ],
  },
  {
    group: 'The one accent',
    note: 'Aviation amber. Everything else is navy or a hairline.',
    items: [
      { name: 'amber', hex: '#b0761c', note: 'rules, marks' },
      { name: 'amber-deep', hex: '#8f5a12', note: 'fills, focus ring' },
      { name: 'amber-ink', hex: '#7d4f0d', note: 'text on paper' },
    ],
  },
  {
    group: 'Status only',
    note: 'Semantic, never decorative.',
    items: [
      { name: 'lime-ink', hex: '#2a6047', note: 'live / complete' },
      { name: 'danger', hex: '#a03024', note: 'errors' },
      { name: 'navy-ink', hex: '#1d3f63', note: 'informational' },
    ],
  },
]

const TYPE = [
  { name: 'Display', cls: 'font-display text-[64px] leading-[1.02] tracking-[-0.015em]', spec: 'Newsreader 500 · 52–92px' },
  { name: 'H1 page', cls: 'font-display text-[44px] leading-[1.04] tracking-[-0.012em]', spec: 'Newsreader 500 · 40–64px' },
  { name: 'H2 section', cls: 'font-display text-[34px] leading-[1.06]', spec: 'Newsreader 500 · 32–44px' },
  { name: 'H3 card', cls: 'font-display text-[22px] leading-tight', spec: 'Newsreader 500 · 20–23px' },
  { name: 'Lead', cls: 'text-[18px] leading-relaxed', spec: 'Inter 400 · 17–18px' },
  { name: 'Body', cls: 'text-[15px] leading-relaxed text-muted', spec: 'Inter 400 · 14–15px, muted' },
  { name: 'Small', cls: 'text-[13px] text-muted', spec: 'Inter 400 · 12.5–13.5px' },
  { name: 'Eyebrow', cls: 'text-[11px] font-semibold tracking-[0.16em] text-amber-ink uppercase', spec: 'Inter 600 · 11px, 0.16em' },
  { name: 'Data', cls: 'figures font-mono text-[13px] text-fg', spec: 'IBM Plex Mono 400, tabular' },
]

const SPACING = [4, 8, 12, 16, 24, 32, 48, 64, 96]
const RADII = [
  { name: 'control', v: '3px' },
  { name: 'card', v: '2px' },
  { name: 'pill', v: '999px', note: 'dots only' },
]
const SHADOWS = [
  { name: 'lift', cls: 'shadow-lift' },
  { name: 'pill', cls: 'shadow-pill' },
]

const VARIANTS: ButtonVariant[] = ['primary', 'violet', 'secondary', 'ghost', 'danger']
const TONES: Tone[] = ['neutral', 'violet', 'lime', 'amber', 'blue', 'danger']

const RULES = [
  { do: 'One accent: amber, and only for emphasis — a rule, a kicker, an active tab.', dont: 'A second accent colour competing with amber.' },
  { do: 'Hairlines and paper. Borders do the work a drop shadow would do.', dont: 'Gradients, glass, blur, or glowing shadows.' },
  { do: 'Serif display, sans interface, mono figures.', dont: 'Handwritten or decorative display faces.' },
  { do: 'Square corners: 2px plates, 3px controls.', dont: 'Fully rounded cards and pill-shaped buttons.' },
  { do: 'Left-aligned editorial columns with real spacing.', dont: 'Centred everything, or three fonts in one block.' },
]

export function Styleguide() {
  useDocumentTitle('Style guide')
  const toast = useToast()
  const [replay, setReplay] = useState(0)
  const [seg, setSeg] = useState<'week' | 'month'>('week')
  const [tab, setTab] = useState<'one' | 'two' | 'three'>('one')
  const [chip, setChip] = useState(true)
  const [check, setCheck] = useState(true)
  const [choice, setChoice] = useState('a')
  const [modal, setModal] = useState(false)

  return (
    <>
      <Header />
      <Container className="flex flex-col gap-16 pt-10 pb-28">
        <div className="flex max-w-[760px] flex-col gap-4">
          <Kicker>Design system</Kicker>
          <h1 className="font-display text-[46px] leading-[1.02] md:text-[64px]">Style guide</h1>
          <p className="text-[16px] leading-relaxed text-muted">
            Every token and component, rendered by the real components. Tokens live in{' '}
            <code className="font-mono text-[13.5px] text-fg">src/styles.css</code>; components in{' '}
            <code className="font-mono text-[13.5px] text-fg">src/components</code>.
          </p>
          <p className="border-l-2 border-amber bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-muted">
            FADEC is an editorial technical-academy system: warm off-white paper, deep navy ink, hairlines, and a
            single aviation-amber accent. No gradients, no glassmorphism, no decorative second accent.
          </p>
        </div>

        <Block title="Colour">
          {COLORS.map((g) => (
            <div key={g.group} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-[12px] font-semibold tracking-[0.14em] text-fg uppercase">{g.group}</h3>
                {g.note && <span className="text-[12.5px] text-muted">{g.note}</span>}
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {g.items.map((c) => (
                  <li key={c.name} className="flex flex-col gap-2">
                    <span className="h-16 rounded-[2px] border border-line" style={{ background: c.hex }} />
                    <span className="text-[13px] font-medium">{c.name}</span>
                    <span className="figures font-mono text-[11.5px] text-muted">
                      {c.hex}
                      {c.note ? `, ${c.note}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Block>

        <Block title="Type">
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {TYPE.map((t) => (
              <li key={t.name} className="flex flex-col gap-2 py-4 md:flex-row md:items-baseline md:gap-8">
                <span className="w-40 shrink-0 text-[12px] text-muted">
                  {t.name}
                  <span className="block text-[11.5px] text-faint">{t.spec}</span>
                </span>
                <span className={`min-w-0 break-words ${t.cls}`}>Airframe structures</span>
              </li>
            ))}
          </ul>
        </Block>

        <div className="grid gap-10 lg:grid-cols-3">
          <Block title="Spacing">
            <ul className="flex flex-col gap-2">
              {SPACING.map((s) => (
                <li key={s} className="flex items-center gap-3 text-[12.5px] text-muted">
                  <span className="figures w-8 font-mono">{s}</span>
                  <span className="h-2 bg-amber" style={{ width: Math.min(s * 2, 160) }} />
                </li>
              ))}
            </ul>
          </Block>
          <Block title="Radii">
            <ul className="grid grid-cols-3 gap-3">
              {RADII.map((r) => (
                <li key={r.name} className="flex flex-col items-center gap-2 text-center text-[12px] text-muted">
                  <span className="size-16 border border-line bg-surface-2" style={{ borderRadius: r.v }} />
                  <span>
                    {r.name}
                    <span className="block font-mono text-[11px] text-faint">{r.v}</span>
                    {r.note && <span className="block text-[10.5px] text-faint">{r.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Block>
          <Block title="Elevation">
            <ul className="grid grid-cols-2 gap-4">
              {SHADOWS.map((s) => (
                <li key={s.name} className="flex flex-col items-center gap-2 text-[12px] text-muted">
                  <span className={`h-16 w-full rounded-[2px] border border-line bg-surface ${s.cls}`} />
                  {s.name}
                </li>
              ))}
              <li className="col-span-2 border-t border-line pt-3 text-[12.5px] leading-relaxed text-muted">
                Cards do not use elevation. A 1px hairline and the surface tint carry the hierarchy; the two shadows above
                are reserved for overlays and the modal.
              </li>
            </ul>
          </Block>
        </div>

        <Block
          title="Motion"
          action={
            <Button variant="secondary" size="sm" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => setReplay((n) => n + 1)}>
              Replay
            </Button>
          }
        >
          <ul key={replay} className="grid gap-4 sm:grid-cols-3">
            {[
              { name: 'rise', cls: 'animate-rise', spec: '0.7s ease-out-soft, content entrance' },
              { name: 'pulse-dot', cls: 'animate-pulse-dot', spec: '2s, live indicators' },
              { name: 'hover', cls: '', spec: '150–200ms colour and border only' },
            ].map((m) => (
              <li key={m.name} className="flex flex-col items-center gap-3 border border-line bg-surface p-4 text-center">
                <span className={`size-2.5 rounded-full bg-amber-deep ${m.cls}`} />
                <span className="font-mono text-[11.5px]">{m.name}</span>
                <span className="text-[12px] text-muted">{m.spec}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] text-muted">
            Nothing translates, scales or glows on interaction beyond a colour change. Reduced motion turns the two
            entrance animations off.
          </p>
        </Block>

        <Block title="Buttons">
          <div className="overflow-x-auto">
            <table className="text-left text-[12px] text-muted">
              <thead>
                <tr>
                  <th scope="col" className="pr-4 pb-3 font-medium">Variant</th>
                  {['Default', 'Hover', 'Focus', 'Pressed', 'Disabled', 'Loading'].map((s) => (
                    <th key={s} scope="col" className="px-2 pb-3 font-medium">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {VARIANTS.map((v) => (
                  <tr key={v}>
                    <th scope="row" className="py-2 pr-4 font-mono font-normal whitespace-nowrap">{v}</th>
                    <td className="px-2 py-2"><Button variant={v} size="sm">Apply</Button></td>
                    <td className="px-2 py-2"><Button variant={v} size="sm" force="hover">Apply</Button></td>
                    <td className="px-2 py-2"><Button variant={v} size="sm" force="focus">Apply</Button></td>
                    <td className="px-2 py-2"><Button variant={v} size="sm" force="pressed">Apply</Button></td>
                    <td className="px-2 py-2"><Button variant={v} size="sm" disabled>Apply</Button></td>
                    <td className="px-2 py-2"><Button variant={v} size="sm" loading>Apply</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button size="sm" iconRight={<Plus className="size-3.5" aria-hidden />}>Small</Button>
            <Button size="md" iconRight={<ArrowRight className="size-4" aria-hidden />}>Medium</Button>
            <Button size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>Large</Button>
            <IconButton aria-label="Notifications (default)"><Bell className="size-4.5" aria-hidden /></IconButton>
            <IconButton aria-label="Notifications (hover)" force="hover"><Bell className="size-4.5" aria-hidden /></IconButton>
            <IconButton aria-label="Notifications (focus)" force="focus"><Bell className="size-4.5" aria-hidden /></IconButton>
            <IconButton aria-label="Notifications (disabled)" disabled><Bell className="size-4.5" aria-hidden /></IconButton>
          </div>
        </Block>

        <Block title="Selection">
          <div className="flex flex-wrap items-center gap-3">
            <Chip active={chip} onClick={() => setChip(!chip)}>Toggle me</Chip>
            <Chip active={false}>Default</Chip>
            <Chip active={false} force="hover">Hover</Chip>
            <Chip active={false} force="focus">Focus</Chip>
            <Chip active>Active</Chip>
            <Chip active={false} disabled>Disabled</Chip>
            <Segmented label="Range" value={seg} onChange={setSeg} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
          </div>
          <Tabs
            label="Example tabs"
            value={tab}
            onChange={setTab}
            tabs={[{ value: 'one', label: 'Curriculum' }, { value: 'two', label: 'Assessments' }, { value: 'three', label: 'Resources', count: 3 }]}
          />
          <TabPanel value={tab} className="border border-line bg-surface p-4 text-[13.5px] text-muted">
            Panel for the {tab === 'one' ? 'Curriculum' : tab === 'two' ? 'Assessments' : 'Resources'} tab. Arrow keys move
            between tabs.
          </TabPanel>
          <div className="flex flex-wrap items-center gap-2">
            {TONES.map((t) => (
              <Badge key={t} tone={t}>{t}</Badge>
            ))}
            <Badge tone="lime" dot>Live</Badge>
          </div>
        </Block>

        <Block title="Form fields">
          <div className="grid gap-5 md:grid-cols-3">
            <Input label="Default" placeholder="Jordan Ellis" />
            <Input label="Hover" placeholder="Jordan Ellis" force="hover" />
            <Input label="Focus" placeholder="Jordan Ellis" force="focus" />
            <Input label="Error" defaultValue="jordan@" error="Enter a valid email address." />
            <Input label="Disabled" defaultValue="AE-24-01873" disabled />
            <Input label="With hint" optional hint="We only call about your application." />
            <Select label="Select" defaultValue="">
              <option value="">Choose a course</option>
              <option>Commercial Pilot Licence</option>
            </Select>
            <Select label="Select error" error="Choose a course." defaultValue="">
              <option value="">Choose a course</option>
            </Select>
            <Textarea label="Textarea" rows={3} placeholder="Logged flying hours and types flown" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Checkbox label="Checked" checked={check} onChange={(e) => setCheck(e.target.checked)} />
              <Checkbox label="Unchecked" checked={false} onChange={() => {}} />
              <Checkbox label="Disabled" disabled checked={false} onChange={() => {}} />
              <Checkbox label="With error" checked={false} onChange={() => {}} error="Confirm to continue." />
            </div>
            <fieldset className="flex flex-col gap-2 md:col-span-2">
              <legend className="sr-only">Choice cards</legend>
              <ChoiceCard name="sg" value="a" checked={choice === 'a'} onChange={() => setChoice('a')} title="January 2027" body="Mon & Wed 18:30–20:30 GMT" />
              <ChoiceCard name="sg" value="b" checked={choice === 'b'} onChange={() => setChoice('b')} title="April 2027" body="Tue & Thu 19:00–21:00 GMT" />
              <ChoiceCard name="sg" value="c" checked={false} disabled onChange={() => {}} title="September 2026 (full)" body="Disabled" />
            </fieldset>
          </div>
          <FormError>We could not reach the server. Check your connection and try again.</FormError>
        </Block>

        <Block title="Feedback and overlays">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => toast('Saved to your shortlist')}>Show a toast</Button>
            <Button variant="secondary" onClick={() => setModal(true)}>Open a modal</Button>
          </div>
          <Stepper steps={['Course', 'Experience', 'Documents', 'Review']} current={1} />
          <div className="grid gap-4 md:grid-cols-2">
            <EmptyState
              icon={<Inbox className="size-5" aria-hidden />}
              title="No results"
              body="Shown when a filter or list has nothing in it."
              action={<Button variant="secondary" size="sm">Clear filters</Button>}
            />
            <div className="flex flex-col gap-3 border border-line bg-surface p-6" role="status" aria-label="Loading example">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-28" />
            </div>
          </div>
          <Accordion
            items={[
              { q: 'Accordion item, open', a: 'Answers sit in the panel below the question.' },
              { q: 'Accordion item, closed', a: 'Hidden until opened.' },
            ]}
          />
        </Block>

        <Block title="Cards">
          <div className="grid gap-4 md:grid-cols-3">
            <ProgrammeCard p={PROGRAMMES[0]} />
            <ProgrammeCard p={PROGRAMMES[2]} />
            <Card className="flex flex-col justify-between gap-6 p-6">
              <Stat value="94%" label="Ground paper first-attempt pass rate" />
              <Stat value="1:14" label="Instructor to engineer ratio" />
            </Card>
          </div>
          <div className="flex flex-col gap-3">
            <EventCard ev={EVENTS[0]} going={false} onRsvp={() => {}} onCancel={() => {}} />
            <EventCard ev={EVENTS[1]} going onRsvp={() => {}} onCancel={() => {}} />
            <EventCard ev={EVENTS[3]} going={false} onRsvp={() => {}} onCancel={() => {}} />
          </div>
        </Block>

        <Block title="Timetable">
          <div className="border border-line bg-surface p-4 md:p-6">
            <Timetable sessions={TIMETABLE} weekStart={mondayOf(HUB_TODAY)} today={HUB_TODAY} compact />
          </div>
        </Block>

        <Block title="Editorial rules">
          <ul className="border-t border-line">
            {RULES.map((r) => (
              <li key={r.do} className="grid gap-3 border-b border-line py-4 md:grid-cols-2 md:gap-8">
                <p className="flex gap-2.5 text-[13.5px] leading-relaxed">
                  <span className="font-mono text-[11px] text-lime-ink">DO</span>
                  {r.do}
                </p>
                <p className="flex gap-2.5 text-[13.5px] leading-relaxed text-muted">
                  <span className="font-mono text-[11px] text-danger">AVOID</span>
                  {r.dont}
                </p>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Brand mark">
          <div className="flex flex-wrap items-center gap-10 border border-line bg-surface p-6">
            <Mark className="text-[64px] text-fg" />
            <div className="flex flex-col gap-1">
              <span className="font-display text-[32px] leading-none">FADEC</span>
              <span className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">Aviation academy</span>
            </div>
            <p className="max-w-[42ch] text-[13px] leading-relaxed text-muted">
              A swept delta in deep navy with a single amber beacon. The wordmark is set in the display serif; the
              descriptor is uppercase Inter at 0.18em. Keep clear space of one mark height.
            </p>
          </div>
        </Block>
      </Container>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Confirm cohort change"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={() => setModal(false)}>Confirm</Button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-muted">
          Focus is trapped inside, Escape closes it, and focus returns to the button that opened it. The overlay is a
          flat navy wash, not a blur.
        </p>
      </Modal>
    </>
  )
}

function Block({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-6" aria-label={title}>
      <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
        <h2 className="font-display text-[26px] leading-none">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
