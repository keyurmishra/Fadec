/*
  Shared primitives for every FADEC contract.

  Rules carried from the PRD:
  - Timestamps are ISO-8601 UTC strings (master PRD §7.1); render in the
    viewer's timezone at the edge, never store local time.
  - Money is integer minor units, never a float (§6.4). Payment is deferred,
    so nothing here is chargeable yet — the shape exists so a free/manual
    enrolment today can carry a price later without a migration.
  - Errors are structured: code, message, requestId, safe field errors (§9.4).
  - Lists are cursor-paginated with a stable order (§9.4).
*/

/** Opaque resource identifier. Never derive authorisation from it. */
export type Id = string

/** RFC 3339 timestamp in UTC, e.g. "2026-11-24T09:30:00.000Z". */
export type IsoDateTime = string

/** Calendar date without time, e.g. "2027-01-18". */
export type IsoDate = string

/** Opaque cursor for the next page, or null on the last page. */
export type Cursor = string | null

/**
 * Amount in integer minor units (paise/cents). Currency is fixed per order,
 * never inferred client-side. Payment is deferred; prices are display-only
 * until checkout exists.
 */
export type MoneyDTO = {
  amountMinor: number
  currency: 'INR' | 'USD'
}

export type PaginatedDTO<T> = {
  items: T[]
  nextCursor: Cursor
  /** Optional approximate total; do not paginate with it. */
  totalCount?: number
}

/** Structured API error, safe to show and to quote to support. */
export type ApiErrorDTO = {
  code: string
  message: string
  requestId: string
  fieldErrors?: Record<string, string>
}

/** Server-owned timestamps present on persistable records. */
export type AuditStamp = {
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}
