/*
  Labels the student portal uses.

  Kept apart from the studio's assessment-meta on purpose: students never see a
  draft state, and the words for a window they are looking at ("Opening soon")
  are not the words a teacher uses for the same row ("Scheduled").
*/
import type { LatePolicy } from '../contracts/assessment'
import type { StudentAssignmentStatus } from '../contracts/learning'
import type { Tone } from '../components/ui'

export const STUDENT_ASSIGNMENT_STATUS_META: Record<StudentAssignmentStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Open', tone: 'lime' },
  SCHEDULED: { label: 'Opening soon', tone: 'amber' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
}

export const LATE_POLICY_LABEL: Record<LatePolicy, string> = {
  ALLOW: 'Late work accepted',
  MARK_LATE: 'Late work marked late',
  BLOCK: 'Late work blocked after the due date',
}

export const dateTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** "in 3 days" / "2 days ago", for the line under a due date. */
export function relativeDue(iso: string, now = Date.now()): string {
  const days = Math.round((Date.parse(iso) - now) / 864e5)
  const abs = Math.abs(days)
  const unit = `${abs} day${abs === 1 ? '' : 's'}`
  if (days === 0) return 'due today'
  return days > 0 ? `due in ${unit}` : `${unit} ago`
}
