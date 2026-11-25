import { SITE } from '../content'

export const money = (n: number) => `${SITE.currency}${Math.round(n).toLocaleString('en-GB')}`

/** Dates in content are ISO days (YYYY-MM-DD), read as UTC so every time zone shows the same day. */
export const parseDay = (iso: string) => new Date(`${iso}T12:00:00Z`)

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  parseDay(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts })

export const daysBetween = (fromIso: string, toIso: string) => Math.round((parseDay(toIso).getTime() - parseDay(fromIso).getTime()) / 864e5)

export const addDays = (iso: string, n: number) => {
  const d = parseDay(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Monday of the week containing `iso`. */
export const mondayOf = (iso: string) => {
  const d = parseDay(iso)
  const dow = (d.getUTCDay() + 6) % 7
  return addDays(iso, -dow)
}
