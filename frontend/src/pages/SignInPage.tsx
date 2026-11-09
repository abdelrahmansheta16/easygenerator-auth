import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/AuthLayout'
import { apiErrorMessage } from '../lib/api'
import { signInSchema, type SignInValues } from '../lib/validation'

export function SignInPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema), mode: 'onTouched' })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await signIn(values)
      const from = (location.state as { from?: string } | null)?.from ?? '/app'
      navigate(from, { replace: true })
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not sign you in. Please try again.'))
    }
  })

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to the application.">
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="ada@example.com"
          {...register('email')}
        />
        {errors.email && <p className="field-error" role="alert">{errors.email.message}</p>}

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && <p className="field-error" role="alert">{errors.password.message}</p>}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="switch">
        No account yet? <Link to="/sign-up">Sign up</Link>
      </p>
    </AuthLayout>
  )
}
