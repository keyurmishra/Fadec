/*
  The one error shape every API route answers with:

    { "error": "<sentence a person can read>", "fieldErrors"?: { <field>: "<message>" }, ...detail }

  The React clients (src/lib/api.ts and src/lib/api-client.ts) read `error` and
  `fieldErrors` and nothing else, so a route may add detail (a publish
  checklist, say) but never rename these two keys.

  Status codes keep their usual meaning here:
    400  the body is not a JSON object
    401  no valid session for this workspace
    404  missing, or someone else's (the two are never told apart)
    409  the request conflicts with the resource's state
    422  the body is a JSON object but a field is wrong
    500  an unexpected failure; the cause is logged, never sent
    503  storage or a required secret is unavailable
*/
import type { FieldErrors } from '../shared/validation'

export function apiError(status: number, error: string, detail: Record<string, unknown> = {}): Response {
  return Response.json({ ...detail, error }, { status })
}

export const invalid = (fieldErrors: FieldErrors) => apiError(422, 'Please check the highlighted fields.', { fieldErrors })

export const badJson = () => apiError(400, 'Send a JSON object.')

export const apiNotFound = () => apiError(404, 'Not found')

export const serverError = () => apiError(500, 'Something went wrong on our side. Please try again.')

export const unavailable = () => apiError(503, 'The service is temporarily unavailable. Please try again shortly.')

/*
  Ids in this API are short slugs (`crs-ppl`, `qq-…`). A path segment far longer
  than any id, or one carrying control characters, cannot name anything, so it
  is answered as not found before a query is built from it.
*/
const MAX_SEGMENT = 128
const MAX_PATH = 512

export function implausiblePath(path: string): boolean {
  if (path.length > MAX_PATH) return true
  return path.split('/').some((segment) => segment.length > MAX_SEGMENT || /[\u0000-\u001f\u007f]/.test(safeDecode(segment)))
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    // A malformed escape cannot be an id either.
    return '\u0000'
  }
}
