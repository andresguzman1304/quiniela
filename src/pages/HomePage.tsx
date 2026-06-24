import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { useProfile } from '@/lib/useProfile'
import { useMyPools } from '@/lib/api'

export function HomePage() {
  const { session } = useAuth()
  const { data: profile } = useProfile()
  const { data: myPools } = useMyPools(!!session)
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => {
    if (profile?.display_name) setName(profile.display_name)
  }, [profile?.display_name])

  async function saveName() {
    if (!session || !name.trim()) return
    setSaving(true)
    setSavedMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim() })
      .eq('id', session.user.id)
    setSaving(false)
    if (error) setSavedMsg(error.message)
    else {
      setSavedMsg('Nombre guardado ✓')
      qc.invalidateQueries({ queryKey: ['profile'] })
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-dark">Quinielas</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-gray-500 underline hover:text-gray-700"
        >
          Salir
        </button>
      </header>

      <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">Tu nombre</h2>
        <p className="mb-3 text-xs text-gray-500">Así te verán en los leaderboards.</p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          <button
            onClick={saveName}
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {saving ? '…' : 'Guardar'}
          </button>
        </div>
        {savedMsg && <p className="mt-2 text-xs text-gray-500">{savedMsg}</p>}
      </section>

      <div className="grid gap-4">
        <Link
          to="/crear"
          className="rounded-xl bg-brand p-5 text-center font-semibold text-white shadow-sm transition hover:bg-brand-dark"
        >
          ➕ Crear una quiniela
        </Link>
        <Link
          to="/unirse"
          className="rounded-xl border border-gray-300 bg-white p-5 text-center font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50"
        >
          🎟️ Unirme con un código
        </Link>
      </div>

      {myPools && myPools.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Mis quinielas</h2>
          <ul className="space-y-2">
            {myPools.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/q/${p.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800 transition hover:border-brand"
                >
                  <span className="truncate">{p.title}</span>
                  <span className="ml-2 shrink-0 text-xs text-gray-400">
                    {p.type === 'random_scoreline' ? '🎲 Cascarita' : '⚽ Predicción'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
