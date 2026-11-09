import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import * as api from '../lib/api'
import type { PublicUser } from '../lib/api'
import type { SignInValues, SignUpValues } from '../lib/validation'

interface AuthState {
  user: PublicUser | null
  /** True while the initial silent refresh restores an existing session. */
  restoring: boolean
  signUp: (values: SignUpValues) => Promise<void>
  signIn: (values: SignInValues) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [restoring, setRestoring] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .refreshSession()
      .then((session) => {
        if (!cancelled) setUser(session?.user ?? null)
      })
      .finally(() => {
        if (!cancelled) setRestoring(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signUp = useCallback(async (values: SignUpValues) => {
    const session = await api.signUp(values)
    setUser(session.user)
  }, [])

  const signIn = useCallback(async (values: SignInValues) => {
    const session = await api.signIn(values)
    setUser(session.user)
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, restoring, signUp, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
