import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function WelcomePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  const onLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      navigate('/sign-in', { replace: true })
    }
  }

  return (
    <main className="page">
      <section className="card card-wide" aria-labelledby="welcome-title">
        <p className="brand">Easygenerator</p>
        <h1 id="welcome-title">Welcome to the application.</h1>
        {user && (
          <p className="muted">
            Signed in as <strong>{user.name}</strong> ({user.email}).
          </p>
        )}
        <button type="button" className="button-ghost" onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? 'Signing out…' : 'Log out'}
        </button>
      </section>
    </main>
  )
}
