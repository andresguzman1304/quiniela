import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/AuthProvider'
import { useProfile } from '@/lib/useProfile'
import { getPoolPreview } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import type { PoolPreview } from '@/lib/types'

// ¿El "nombre" parece en realidad un código de invitación? (mismo texto que el
// código, o un token corto en mayúsculas con números, como "BC3A79").
function looksLikeCode(name: string, code: string): boolean {
  const n = name.replace(/\s+/g, '').toUpperCase()
  if (!n) return false
  if (code && n === code.toUpperCase()) return true
  return /^[A-Z0-9]{5,8}$/.test(n) && /\d/.test(n)
}

export function JoinPoolPage() {
  const { code: codeParam } = useParams<{ code?: string }>()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: profile } = useProfile()

  const [code, setCode] = useState<string>((codeParam ?? '').toUpperCase())
  const [preview, setPreview] = useState<PoolPreview | null>(null)
  const [name, setName] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  // Si ya tiene un nombre real (no anónimo por defecto), lo prellenamos.
  useEffect(() => {
    if (profile?.display_name && profile.display_name !== 'usuario') setName(profile.display_name)
  }, [profile?.display_name])

  const loadPreview = useCallback(async (raw: string) => {
    const clean = raw.trim().toUpperCase()
    if (!clean) return
    setLoadingPreview(true)
    setPreviewError(null)
    setPreview(null)
    try {
      setPreview(await getPoolPreview(clean))
    } catch {
      setPreviewError('Código inválido')
    } finally {
      setLoadingPreview(false)
    }
  }, [])

  useEffect(() => {
    if (codeParam) {
      const c = codeParam.toUpperCase()
      setCode(c)
      void loadPreview(c)
    }
  }, [codeParam, loadPreview])

  async function handleJoin() {
    const clean = code.trim().toUpperCase()
    if (!clean) return
    const cleanName = name.trim()
    if (!cleanName) {
      setJoinError('Escribe tu nombre para entrar.')
      return
    }
    // Evita el error común (sobre todo en personas mayores) de pegar el código
    // de invitación en la casilla del nombre.
    if (looksLikeCode(cleanName, clean)) {
      setJoinError('Eso parece un código, no un nombre. Escribe tu nombre — por ejemplo: María.')
      return
    }
    setJoining(true)
    setJoinError(null)
    try {
      // Sin sesión → entra como anónimo (solo nombre, sin correo).
      let uid = session?.user.id
      if (!uid) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) throw error
        uid = data.user?.id
      }
      if (uid) {
        await supabase.from('profiles').upsert({ id: uid, display_name: name.trim() })
      }
      const { data: poolId, error: jErr } = await supabase.rpc('join_pool', { p_code: clean })
      if (jErr) throw jErr
      navigate('/q/' + (poolId as string))
    } catch (e) {
      setJoinError((e as Error).message || 'No se pudo unir. Verifica el código.')
    } finally {
      setJoining(false)
    }
  }

  const canPreview = code.trim().length > 0 && !loadingPreview

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <Link to="/" className="text-sm text-gray-500 transition-colors hover:text-brand-dark">
        ← Inicio
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-gray-900">Unirme a una quiniela</h1>
      <p className="mt-2 text-sm text-gray-500">Ingresa el código que te compartieron.</p>

      {/* Código (si no vino en la URL) */}
      {!codeParam && (
        <div className="mt-6">
          <input
            type="text"
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="CÓDIGO"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setPreviewError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void loadPreview(code)
            }}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-xl font-semibold uppercase tracking-widest text-gray-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="button"
            disabled={!canPreview}
            onClick={() => void loadPreview(code)}
            className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-brand-dark hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingPreview ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      )}

      {previewError && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {previewError}
        </p>
      )}

      {preview && (
        <motion.div
          key={preview.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-6 rounded-xl border border-gray-200 bg-white p-5"
        >
          <h2 className="text-lg font-bold text-gray-900">{preview.title}</h2>
          <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
            <span>
              {preview.item_count} {preview.item_count === 1 ? 'partido' : 'partidos'}
            </span>
            <span className="font-semibold text-brand-dark">
              {formatMoney(preview.price_cents, preview.currency)} c/u
            </span>
          </div>

          {!session && (
            <div className="mt-4">
              <label htmlFor="joinName" className="mb-1 block text-base font-semibold text-gray-800">
                Escribe tu nombre
              </label>
              <input
                id="joinName"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setJoinError(null)
                }}
                autoComplete="name"
                placeholder="Ejemplo: María González"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg text-gray-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              <p className="mt-1.5 text-sm text-gray-500">
                Tu nombre, no el código. Sin correo ni contraseña.
              </p>
            </div>
          )}

          {joinError && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">
              {joinError}
            </p>
          )}

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            disabled={joining}
            onClick={() => void handleJoin()}
            className="mt-4 w-full rounded-xl bg-brand px-4 py-4 text-lg font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {joining ? 'Entrando…' : 'Unirme'}
          </motion.button>
        </motion.div>
      )}
    </div>
  )
}
