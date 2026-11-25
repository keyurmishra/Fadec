/*
  A tiny typed client for the teaching endpoints.

  Same normalisation as lib/api.ts, plus the HTTP status so the studio can tell
  an expired session (401) from a forbidden resource (403) and from a plain
  validation failure (422). Requests are same-origin so the demo session cookie
  travels with them.
*/
export type TeacherApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number; fieldErrors?: Record<string, string> }

const fallbackFor = (status: number) => {
  if (status === 401) return 'Your teaching session has expired. Sign in again to continue.'
  if (status === 403) return 'You do not have access to this course.'
  if (status === 404) return 'That resource could not be found.'
  if (status === 422) return 'Please check the highlighted fields.'
  return 'Something went wrong. Please try again.'
}

async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<TeacherApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: typeof json.error === 'string' ? json.error : fallbackFor(res.status),
        fieldErrors: (json.fieldErrors as Record<string, string>) ?? undefined,
      }
    }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, status: 0, error: 'We could not reach the teaching service. Check your connection and try again.' }
  }
}

export const teacherApi = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
}
