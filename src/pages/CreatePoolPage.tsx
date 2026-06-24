import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pluginFor } from '@/pools/types/registry'
import { TeamPicker } from '@/components/TeamPicker'
import { useCreatePool } from '@/lib/api'
import type { FootballPoolConfig, PoolType } from '@/lib/types'

interface MatchRow {
  id: string
  home: string
  away: string
  kickoff: string
}

let rowCounter = 0
function newRow(): MatchRow {
  rowCounter += 1
  return { id: `row-${rowCounter}`, home: '', away: '', kickoff: '' }
}

type Mode = 'predict' | 'cascarita'

// Cada opción llena justo una cuadrícula de marcadores (tope+1)²:
// 9→2-2, 16→3-3, 25→4-4, 36→5-5, 49→6-6, 100→9-9.
const PLAYER_OPTS = [9, 16, 25, 36, 49, 100]

export function CreatePoolPage() {
  const navigate = useNavigate()
  const plugin = pluginFor('football_exact_score')

  const [mode, setMode] = useState<Mode>('predict')
  const [title, setTitle] = useState('')
  const [pesos, setPesos] = useState(100)
  const [maxTickets, setMaxTickets] = useState(2)
  // Config para modo "predicción libre"
  const [predictConfig, setPredictConfig] = useState<FootballPoolConfig>(() => plugin.defaultConfig())
  // Config para cascarita
  const [targetPlayers, setTargetPlayers] = useState(16)
  const [unique, setUnique] = useState(false)
  // El rango de marcadores se deriva de cuántos números se quieren repartir:
  // se elige el menor tope cuya cuadrícula (tope+1)² alcance ese número.
  const maxGoals = Math.min(50, Math.max(1, Math.ceil(Math.sqrt(Math.max(1, Math.floor(targetPlayers) || 1))) - 1))
  const gridCount = (maxGoals + 1) ** 2
  const [matches, setMatches] = useState<MatchRow[]>(() => [newRow()])
  const [formError, setFormError] = useState<string | null>(null)

  const createPool = useCreatePool()

  function updateMatch(id: string, patch: Partial<MatchRow>) {
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!title.trim()) {
      setFormError('El título no puede estar vacío.')
      return
    }
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i]
      if (!m.home.trim() || !m.away.trim() || !m.kickoff) {
        setFormError(`Completa el local, visitante y la hora del partido ${i + 1}.`)
        return
      }
    }

    const type: PoolType = mode === 'cascarita' ? 'random_scoreline' : 'football_exact_score'
    const config: FootballPoolConfig =
      mode === 'cascarita'
        ? { max_goals: maxGoals, unique, scoring: { exact_points: 1, result_points: 0 } }
        : predictConfig

    const items = matches.map((m) => ({
      lock_at: new Date(m.kickoff).toISOString(),
      payload: { home: m.home.trim(), away: m.away.trim() },
    }))

    try {
      const result = await createPool.mutateAsync({
        type,
        title: title.trim(),
        price_cents: Math.round(pesos * 100),
        currency: 'MXN',
        max_tickets: maxTickets,
        config,
        items,
      })
      navigate('/q/' + result.id)
    } catch {
      /* error mostrado abajo via createPool.error */
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <Link to="/" className="text-sm text-brand-dark hover:underline">
        ← Volver
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">Crear quiniela</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        {/* Modalidad */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <span className="block text-sm font-medium text-gray-700">Modalidad</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ModeButton
              active={mode === 'predict'}
              title="Predicción libre"
              desc="Cada quien elige su marcador"
              onClick={() => setMode('predict')}
            />
            <ModeButton
              active={mode === 'cascarita'}
              title="Cascarita 🎲"
              desc="Marcador al azar por número"
              onClick={() => setMode('cascarita')}
            />
          </div>
        </div>

        {/* Título */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">
            Título
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={mode === 'cascarita' ? 'Cascarita México vs Chequia' : 'Mundial 2026'}
            required
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        {/* Precio + Máx boletos */}
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700">
              {mode === 'cascarita' ? 'Precio por número (MXN)' : 'Precio por boleto (MXN)'}
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                id="price"
                type="number"
                min={0}
                step="1"
                value={pesos}
                onChange={(e) => setPesos(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>
          <div>
            <label htmlFor="maxTickets" className="block text-sm font-medium text-gray-700">
              {mode === 'cascarita' ? 'Máx. números por persona' : 'Máx. boletos por persona'}
            </label>
            <input
              id="maxTickets"
              type="number"
              min={1}
              step="1"
              value={maxTickets}
              onChange={(e) => setMaxTickets(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-gray-500">
              Cada persona puede comprar hasta {maxTickets} {maxTickets === 1 ? (mode === 'cascarita' ? 'número' : 'boleto') : (mode === 'cascarita' ? 'números' : 'boletos')}.
            </p>
          </div>
        </div>

        {/* Configuración según modalidad */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          {mode === 'predict' ? (
            <>
              <span className="block text-sm font-medium text-gray-700">Configuración de puntos</span>
              <div className="mt-3">
                <plugin.ConfigForm value={predictConfig} onChange={setPredictConfig} />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <span className="block text-sm font-medium text-gray-700">¿Cuántos números quieres repartir?</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PLAYER_OPTS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setTargetPlayers(n)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        targetPlayers === n
                          ? 'bg-brand text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Tope 0-{maxGoals}: {gridCount} marcadores posibles (0-0 a {maxGoals}-{maxGoals}).
                </p>
              </div>
              <div>
                <span className="block text-sm font-medium text-gray-700">Repartición de números</span>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setUnique(false)}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      !unique ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Repetibles
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnique(true)}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      unique ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Únicos
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {unique
                    ? `Cada marcador se asigna una sola vez (máx ${(maxGoals + 1) ** 2} jugadores).`
                    : 'Varios pueden tener el mismo marcador (se reparten el bote si gana).'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Partidos */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {mode === 'cascarita' ? 'Partido' : 'Partidos'}
            </span>
            <span className="text-xs text-gray-400">{matches.length}</span>
          </div>
          <div className="mt-3 space-y-3">
            <AnimatePresence initial={false}>
              {matches.map((m, i) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2 rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Partido {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => setMatches((p) => (p.length > 1 ? p.filter((x) => x.id !== m.id) : p))}
                      disabled={matches.length <= 1}
                      className="text-xs text-red-500 disabled:opacity-30"
                    >
                      Quitar
                    </button>
                  </div>
                  <TeamPicker value={m.home} onChange={(v) => updateMatch(m.id, { home: v })} placeholder="Local" />
                  <TeamPicker value={m.away} onChange={(v) => updateMatch(m.id, { away: v })} placeholder="Visitante" />
                  <input
                    type="datetime-local"
                    value={m.kickoff}
                    onChange={(e) => updateMatch(m.id, { kickoff: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <button
            type="button"
            onClick={() => setMatches((p) => [...p, newRow()])}
            className="mt-3 w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            ＋ Agregar partido
          </button>
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}
        {createPool.error && (
          <p className="text-sm text-red-600">No se pudo crear. Revisa los datos e intenta de nuevo.</p>
        )}

        <motion.button
          type="submit"
          whileTap={{ scale: 0.98 }}
          disabled={createPool.isPending}
          className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60"
        >
          {createPool.isPending ? 'Creando…' : 'Crear quiniela'}
        </motion.button>
      </form>
    </div>
  )
}

function ModeButton({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={
        'rounded-lg border p-3 text-left transition-colors ' +
        (active ? 'border-brand bg-brand/5' : 'border-gray-200 bg-white hover:bg-gray-50')
      }
    >
      <div className={`text-sm font-semibold ${active ? 'text-brand-dark' : 'text-gray-800'}`}>{title}</div>
      <div className="mt-0.5 text-xs text-gray-500">{desc}</div>
    </motion.button>
  )
}
