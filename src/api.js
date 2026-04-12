const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

async function readBody(response) {
  const contentType = response.headers.get('content-type') ?? ''

  if (response.status === 204) {
    return null
  }

  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text ? { detail: text } : null
}

function createApiError(response, payload) {
  const detail =
    payload?.detail ??
    payload?.title ??
    (typeof payload === 'string' ? payload : null) ??
    `Request failed with status ${response.status}`

  return new Error(detail)
}

export function createApiClient({ getSession, persistSession, clearSession }) {
  async function refreshAccessToken(refreshToken) {
    const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    })

    const payload = await readBody(response)
    if (!response.ok) {
      throw createApiError(response, payload)
    }

    return payload
  }

  async function request(path, options = {}, allowRefresh = true) {
    const session = getSession()
    const headers = new Headers(options.headers ?? {})

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    if (session?.accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${session.accessToken}`)
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    if (response.status === 401 && allowRefresh && session?.refreshToken) {
      try {
        const refreshedSession = await refreshAccessToken(session.refreshToken)
        persistSession(refreshedSession)
        return request(path, options, false)
      } catch {
        clearSession()
      }
    }

    const payload = await readBody(response)
    if (!response.ok) {
      throw createApiError(response, payload)
    }

    return payload
  }

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
  }
}
