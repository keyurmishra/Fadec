/*
  Shared labels and date helpers for the assessment screens.

  One place for the status wording means the list, the builder and the marking
  queue cannot drift into three different vocabularies for the same states.
*/
import type { LatePolicy } from '../../contracts/assessment'
import type { AssignmentStatusView, SubmissionMarkingStatus } from '../../contracts/teaching'
import type { Tone } from '../../components/ui'

export const ASSIGNMENT_STATUS_META: Record<AssignmentStatusView, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SCHEDULED: { label: 'Scheduled', tone: 'amber' },
  OPEN: { label: 'Open', tone: 'lime' },
  CLOSED: { label: 'Closed', tone: 'danger' },
}

export const SUBMISSION_STATUS_META: Record<SubmissionMarkingStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Awaiting mark', tone: 'amber' },
  DRAFT: { label: 'Draft saved', tone: 'blue' },
  RETURNED: { label: 'Returned', tone: 'lime' },
}

export const LATE_POLICY_META: Record<LatePolicy, { label: string; description: string }> = {
  BLOCK: { label: 'Late work blocked', description: 'The submission form closes at the due date.' },
  ALLOW: { label: 'Late work accepted', description: 'Late work is accepted and marked as on time.' },
  MARK_LATE: { label: 'Late work marked late', description: 'Late work is accepted and flagged as late everywhere.' },
}

export const LATE_POLICY_OPTIONS: Array<{ value: LatePolicy; label: string }> = [
  { value: 'MARK_LATE', label: 'Accept and mark as late' },
  { value: 'ALLOW', label: 'Accept and treat as on time' },
  { value: 'BLOCK', label: 'Block submissions after the due date' },
]

export const dateTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** ISO → the value a datetime-local input expects, in the browser's time zone. */
export const toDateTimeInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const fromDateTimeInput = (value: string) => (value ? new Date(value).toISOString() : null)

/** A due date a week out at 17:00, used as the builder's default. */
export const defaultDueInput = () => {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setHours(17, 0, 0, 0)
  return toDateTimeInput(d.toISOString())
}
