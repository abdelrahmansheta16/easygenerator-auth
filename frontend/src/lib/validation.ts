import { z } from 'zod'

/**
 * Client-side mirror of the backend DTO rules. The server re-validates every
 * request — these checks exist for fast feedback, never as the source of truth.
 */
export const passwordRules = [
  { id: 'length', label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { id: 'letter', label: 'At least one letter', test: (v: string) => /[A-Za-z]/.test(v) },
  { id: 'number', label: 'At least one number', test: (v: string) => /[0-9]/.test(v) },
  { id: 'special', label: 'At least one special character', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const

export const signUpSchema = z.object({
  email: z.email('Enter a valid email address.').max(254),
  name: z.string().trim().min(3, 'Name must be at least 3 characters long.').max(100),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must contain at least one letter.')
    .regex(/[0-9]/, 'Password must contain at least one number.')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.'),
})

export const signInSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

export type SignUpValues = z.infer<typeof signUpSchema>
export type SignInValues = z.infer<typeof signInSchema>
