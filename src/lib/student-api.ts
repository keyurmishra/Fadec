/*
  The student portal's client.

  The signed session cookie is HttpOnly, so the browser copy of "who am I" is
  whatever GET /api/student/me says, and a 401 always means the cookie is gone
  or was never set.
*/
import { createApiClient, type ApiResult } from './api-client'

export type StudentApiResult<T> = ApiResult<T>

export const STUDENT_SIGN_IN = '/learn/signin'

export const studentApi = createApiClient({ expired: 'Your student session has expired. Sign in again to continue.' })
