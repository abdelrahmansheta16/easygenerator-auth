import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

export interface PublicUser {
  id: string
  email: string
  name: string
  createdAt: string
}

interface SessionResponse {
  accessToken: string
  user: PublicUser
}

/**
 * The access token lives only in memory — never localStorage/sessionStorage,
 * where any XSS could read it. The long-lived refresh token is an HttpOnly
 * cookie that JavaScript cannot touch; the browser sends it only to /api/auth.
 */
let accessToken: string | null = null
let refreshInFlight: Promise<SessionResponse | null> | null = null

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

function storeSession(session: SessionResponse | null): SessionResponse | null {
  accessToken = session?.accessToken ?? null
  return session
}

/** Single-flight refresh: parallel 401s share one /auth/refresh call. */
export function refreshSession(): Promise<SessionResponse | null> {
  refreshInFlight ??= api
    .post<SessionResponse>('/api/auth/refresh', null, {
      headers: { 'x-requested-with': 'XMLHttpRequest' },
    })
    .then((res) => storeSession(res.data))
    .catch(() => storeSession(null))
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

export async function signUp(input: { email: string; name: string; password: string }) {
  const res = await api.post<SessionResponse>('/api/auth/sign-up', input)
  return storeSession(res.data)!
}

export async function signIn(input: { email: string; password: string }) {
  const res = await api.post<SessionResponse>('/api/auth/sign-in', input)
  return storeSession(res.data)!
}

export async function logout(): Promise<void> {
  try {
    await api.post('/api/auth/logout', null, {
      headers: { 'x-requested-with': 'XMLHttpRequest' },
    })
  } finally {
    storeSession(null)
  }
}

export async function fetchMe(): Promise<PublicUser> {
  const res = await api.get<PublicUser>('/api/auth/me')
  return res.data
}

/** Extracts the server's user-facing message without leaking internals. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { message?: string | string[] } | undefined)?.message
    if (Array.isArray(message)) return message[0] ?? fallback
    if (typeof message === 'string') return message
    if (error.response?.status === 429) return 'Too many attempts. Please wait a moment and try again.'
  }
  return fallback
}

// Attach the in-memory token; on 401, refresh once and replay the request.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    const isAuthCall = original?.url?.includes('/api/auth/refresh')
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      const session = await refreshSession()
      if (session) {
        original._retried = true
        original.headers.Authorization = `Bearer ${session.accessToken}`
        return api(original)
      }
    }
    throw error
  },
)
