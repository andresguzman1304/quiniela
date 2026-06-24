import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'

export function LoginPage() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setSubmitting(false)
    if (err) setError(err.message)
    else setSent(true)
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-1 text-3xl font-bold text-brand-dark">Quinielas</h1>
      <p className="mb-8 text-gray-600">Crea o únete a quinielas con tus amigos.</p>

      {sent ? (
        <div className="rounded-lg border border-brand/30 bg-brand/5 p-4 text-sm text-gray-700">
          📩 Te enviamos un enlace de acceso a <strong>{email}</strong>. Ábrelo en este
          dispositivo para entrar.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Correo</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand px-4 py-2 font-medium text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? 'Enviando…' : 'Enviar enlace de acceso'}
          </button>
        </form>
      )}
    </div>
  )
}
