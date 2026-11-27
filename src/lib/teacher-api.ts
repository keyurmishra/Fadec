/*
  A tiny typed client for the teaching endpoints.

  Same normalisation as lib/api.ts, plus the HTTP status so the studio can tell
  an expired session (401) from a forbidden resource (403) and from a plain
  validation failure (422). Requests are same-origin so the signed session cookie
  travels with them.
*/
import { createApiClient, type ApiResult } from './api-client'

export type TeacherApiResult<T> = ApiResult<T>

export const teacherApi = createApiClient({ expired: 'Your teaching session has expired. Sign in again to continue.' })
