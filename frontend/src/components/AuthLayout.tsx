import type { ReactNode } from 'react'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="page">
      <section className="card" aria-labelledby="auth-title">
        <p className="brand">Easygenerator</p>
        <h1 id="auth-title">{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </section>
    </main>
  )
}
