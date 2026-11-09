import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function ProtectedRoute() {
  const { user, restoring } = useAuth()
  const location = useLocation()

  if (restoring) {
    return (
      <main className="page">
        <p className="muted" role="status">Restoring your session…</p>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
