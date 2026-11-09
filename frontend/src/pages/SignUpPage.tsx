import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/AuthLayout'
import { apiErrorMessage } from '../lib/api'
import { passwordRules, signUpSchema, type SignUpValues } from '../lib/validation'

export function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema), mode: 'onTouched' })

  const password = watch('password') ?? ''

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await signUp(values)
      navigate('/app', { replace: true })
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not create your account. Please try again.'))
    }
  })

  return (
    <AuthLayout title="Create your account" subtitle="Sign up to start using the application.">
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <label htmlFor="name">Name</label>
        <input id="name" autoComplete="name" placeholder="Ada Lovelace" {...register('name')} />
        {errors.name && <p className="field-error" role="alert">{errors.name.message}</p>}

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
          autoComplete="new-password"
          aria-describedby="password-rules"
          {...register('password')}
        />
        {errors.password && <p className="field-error" role="alert">{errors.password.message}</p>}

        <ul className="rules" id="password-rules">
          {passwordRules.map((rule) => (
            <li key={rule.id} className={rule.test(password) ? 'rule-met' : 'rule-unmet'}>
              <span aria-hidden="true">{rule.test(password) ? '✓' : '○'}</span> {rule.label}
            </li>
          ))}
        </ul>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      <p className="switch">
        Already have an account? <Link to="/sign-in">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
