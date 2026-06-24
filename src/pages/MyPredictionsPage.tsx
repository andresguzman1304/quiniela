import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { usePool, usePoolItems, usePredictions, useSavePrediction } from '@/lib/api'
import { pluginFor } from '@/pools/types/registry'
import { MatchCard } from '@/components/MatchCard'
import { Flag } from '@/components/Flag'
import type { FootballScore } from '@/lib/types'

export function MyPredictionsPage() {
  const { poolId, ticketId } = useParams<{ poolId: string; ticketId: string }>()
  const { data: pool, isLoading: poolLoading } = usePool(poolId)
  const { data: items } = usePoolItems(poolId)
  const { data: predictions } = usePredictions(ticketId)
  const save = useSavePrediction(poolId ?? '', ticketId ?? '')

  const savedMap = useMemo(() => {
    const m: Record<string, FootballScore> = {}
    for (const p of predictions ?? []) m[p.pool_item_id] = p.payload
    return m
  }, [predictions])

  const [draft, setDraft] = useState<Record<string, FootballScore>>({})
  const [justSaved, setJustSaved] = useState<string | null>(null)
  useEffect(() => {
    setDraft((prev) => ({ ...savedMap, ...prev }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictions])

  if (poolLoading || !pool || !items) {
    return <div className="mx-auto max-w-md px-6 py-10 text-center text-gray-500">Cargando…</div>
  }

  const cascarita = pool.type === 'random_scoreline'
  const plugin = pluginFor(pool.type)

  async function handleSave(itemId: string) {
    const payload = draft[itemId]
    if (!payload) return
    await save.mutateAsync({ poolItemId: itemId, payload })
    setJustSaved(itemId)
    setTimeout(() => setJustSaved(null), 1500)
  }

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <Link to={`/q/${poolId}`} className="text-sm text-brand-dark hover:underline">
        ← Volver a la quiniela
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">{pool.title}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {cascarita ? 'Tu número — marcador al azar' : 'Tus predicciones'}
      </p>

      <div className="mt-6 space-y-3">
        {items.map((item, i) => {
          const assigned = savedMap[item.id]
          const locked = new Date(item.lock_at).getTime() <= Date.now()

          if (cascarita) {
            return (
              <MatchCard key={item.id} item={item} index={i}>
                {assigned ? (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center justify-center gap-3 rounded-lg bg-brand/10 py-3"
                  >
                    <Flag team={item.payload.home} size={20} placeholder />
                    <span className="text-2xl font-extrabold tabular-nums text-brand-dark">
                      {assigned.home} – {assigned.away}
                    </span>
                    <Flag team={item.payload.away} size={20} placeholder />
                  </motion.div>
                ) : (
                  <p className="rounded-lg bg-gray-100 py-3 text-center text-sm font-medium text-gray-500">
                    🎲 Pendiente del sorteo
                  </p>
                )}
              </MatchCard>
            )
          }

          // Modo predicción libre
          const current = draft[item.id]
          const saved = savedMap[item.id]
          const changed =
            !!current && (!saved || saved.home !== current.home || saved.away !== current.away)
          return (
            <MatchCard key={item.id} item={item} index={i}>
              <plugin.PredictionInput
                item={item}
                config={pool.config}
                value={current}
                disabled={locked}
                onChange={(v: FootballScore) => setDraft((p) => ({ ...p, [item.id]: v }))}
              />
              {locked ? (
                <p className="mt-2 text-center text-xs font-medium text-gray-400">🔒 Cerrado</p>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSave(item.id)}
                  disabled={!changed || save.isPending}
                  className="mt-3 w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {justSaved === item.id ? '✓ Guardado' : 'Guardar'}
                </button>
              )}
            </MatchCard>
          )
        })}
      </div>
    </div>
  )
}
