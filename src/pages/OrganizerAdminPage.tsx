import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  usePool,
  usePoolItems,
  useLeaderboard,
  useSetTicketPaid,
  useSetItemResult,
  useAssignScorelines,
} from '@/lib/api'
import { useAuth } from '@/auth/AuthProvider'
import { pluginFor } from '@/pools/types/registry'
import { MatchCard } from '@/components/MatchCard'
import type { FootballScore } from '@/lib/types'

export function OrganizerAdminPage() {
  const { poolId } = useParams<{ poolId: string }>()
  const { session } = useAuth()
  const uid = session?.user.id

  const { data: pool, isLoading: poolLoading, error: poolError } = usePool(poolId)
  const { data: items, isLoading: itemsLoading } = usePoolItems(poolId)
  const { data: leaderboard, isLoading: lbLoading } = useLeaderboard(poolId)

  const setTicketPaid = useSetTicketPaid(poolId ?? '')
  const setItemResult = useSetItemResult(poolId ?? '')
  const assign = useAssignScorelines(poolId ?? '')

  const [drafts, setDrafts] = useState<Record<string, FootballScore | null>>({})

  if (poolLoading) {
    return (
      <div className="mx-auto max-w-md px-6 py-10 text-center text-gray-500">Cargando…</div>
    )
  }

  if (poolError || !pool) {
    return (
      <div className="mx-auto max-w-md px-6 py-10">
        <p className="text-center text-red-600">Error al cargar la quiniela.</p>
        <div className="mt-4 text-center">
          <Link to={'/q/' + poolId} className="text-brand-dark underline">
            Volver
          </Link>
        </div>
      </div>
    )
  }

  if (pool.organizer_id !== uid) {
    return (
      <div className="mx-auto max-w-md px-6 py-10 text-center">
        <p className="text-gray-700">No autorizado</p>
        <div className="mt-4">
          <Link to={'/q/' + poolId} className="text-brand-dark underline">
            Volver a la quiniela
          </Link>
        </div>
      </div>
    )
  }

  const plugin = pluginFor(pool.type)

  const getDraft = (itemId: string, fallback: FootballScore | null): FootballScore | null => {
    return itemId in drafts ? drafts[itemId] : fallback
  }

  const updateDraft = (itemId: string, value: FootballScore | null) => {
    setDrafts((prev) => ({ ...prev, [itemId]: value }))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-md px-6 py-10"
    >
      <Link to={'/q/' + poolId} className="text-sm text-brand-dark underline">
        ← Volver a la quiniela
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-gray-900">Administración</h1>
      <p className="mt-1 text-sm text-gray-500">{pool.title}</p>

      {/* Sorteo (solo cascarita) */}
      {pool.type === 'random_scoreline' && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Sorteo de marcadores 🎲</h2>
          <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-600">
              Reparte un marcador al azar a cada número. Hazlo cuando todos hayan comprado, antes del
              partido. Si lo repites, se vuelven a barajar.
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              disabled={assign.isPending}
              onClick={() => assign.mutateAsync().catch(() => {})}
              className="mt-3 w-full rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white disabled:opacity-60"
            >
              {assign.isPending ? 'Sorteando…' : 'Sortear marcadores'}
            </motion.button>
            {assign.data != null && !assign.isPending && (
              <p className="mt-2 text-sm text-brand-dark">✓ {assign.data} marcadores asignados.</p>
            )}
            {assign.error && (
              <p className="mt-2 text-sm text-red-600">{(assign.error as Error).message}</p>
            )}
          </div>
        </section>
      )}

      {/* Sección Pagos */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Pagos</h2>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white">
          {lbLoading ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">Cargando…</p>
          ) : !leaderboard || leaderboard.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">Aún no hay boletos.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {leaderboard.map((row) => (
                <li key={row.ticket_id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{row.display_name}</p>
                    <p className="text-xs text-gray-500">Boleto #{row.ticket_number}</p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    type="button"
                    disabled={setTicketPaid.isPending}
                    onClick={() =>
                      setTicketPaid.mutateAsync({ ticketId: row.ticket_id, paid: !row.paid })
                    }
                    className="ml-3 flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-50"
                  >
                    <span aria-hidden>{row.paid ? '✅' : '⬜'}</span>
                    <span>{row.paid ? 'Pagado' : 'Pendiente'}</span>
                  </motion.button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Sección Resultados */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Resultados</h2>
        <div className="mt-3 space-y-4">
          {itemsLoading ? (
            <p className="text-center text-sm text-gray-500">Cargando…</p>
          ) : !items || items.length === 0 ? (
            <p className="text-center text-sm text-gray-500">No hay partidos.</p>
          ) : (
            items.map((item, i) => {
              const draftValue = getDraft(item.id, item.result)
              return (
                <MatchCard key={item.id} item={item} index={i}>
                  <div className="mt-3 space-y-3">
                    <plugin.ResultInput
                      item={item}
                      value={draftValue}
                      onChange={(v) => updateDraft(item.id, v)}
                    />

                    {item.result && (
                      <p className="text-xs text-gray-500">
                        Resultado guardado: {item.result.home} - {item.result.away}
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        type="button"
                        disabled={setItemResult.isPending || draftValue == null}
                        onClick={() =>
                          setItemResult.mutateAsync({ itemId: item.id, result: draftValue })
                        }
                        className="flex-1 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Guardar resultado
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        type="button"
                        disabled={setItemResult.isPending || item.result == null}
                        onClick={() => {
                          updateDraft(item.id, null)
                          setItemResult.mutateAsync({ itemId: item.id, result: null })
                        }}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 disabled:opacity-50"
                      >
                        Borrar
                      </motion.button>
                    </div>
                  </div>
                </MatchCard>
              )
            })
          )}
        </div>
      </section>
    </motion.div>
  )
}