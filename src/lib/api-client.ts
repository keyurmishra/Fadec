/*
  The request core behind the studio and the student portal clients.

  Both speak to same-origin Worker routes, so the session cookie travels with
  every call, and both need the HTTP status: 401 means the session is gone, 404
  means the resource is not the caller's, and 422 carries field errors. Only the
  401 wording differs between the two audiences, which is what `expired` sets.
*/
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number; fieldErrors?: Record<string, string> }

export type ApiClient = {
  get: <T>(url: string) => Promise<ApiResult<T>>
  post: <T>(url: string, body: unknown) => Promise<ApiResult<T>>
  patch: <T>(url: string, body: unknown) => Promise<ApiResult<T>>
  put: <T>(url: string, body: unknown) => Promise<ApiResult<T>>
  del: <T>(url: string) => Promise<ApiResult<T>>
}

const fallbackFor = (status: number, expired: string) => {
  if (status === 401) return expired
  if (status === 403) return 'You do not have access to that resource.'
  if (status === 404) return 'That resource could not be found.'
  if (status === 422) return 'Please check the highlighted fields.'
  return 'Something went wrong. Please try again.'
}

async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body: unknown, expired: string): Promise<ApiResult<T>> {
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
        error: typeof json.error === 'string' ? json.error : fallbackFor(res.status, expired),
        fieldErrors: (json.fieldErrors as Record<string, string>) ?? undefined,
      }
    }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, status: 0, error: 'We could not reach the service. Check your connection and try again.' }
  }
}

/** Build a client whose 401 message names the workspace the caller was in. */
export function createApiClient({ expired }: { expired: string }): ApiClient {
  return {
    get: <T>(url: string) => request<T>('GET', url, undefined, expired),
    post: <T>(url: string, body: unknown) => request<T>('POST', url, body, expired),
    patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body, expired),
    put: <T>(url: string, body: unknown) => request<T>('PUT', url, body, expired),
    del: <T>(url: string) => request<T>('DELETE', url, undefined, expired),
  }
}
