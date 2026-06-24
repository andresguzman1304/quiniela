import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '@/auth/AuthProvider'
import {
  usePool,
  usePoolStats,
  useLeaderboard,
  useMyTickets,
  useBuyTicket,
  useReleaseTicket,
} from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { PotBadge } from '@/components/PotBadge'
import { ShareBox } from '@/components/ShareBox'
import { Leaderboard } from '@/components/Leaderboard'

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

export function PoolDashboardPage() {
  const { poolId } = useParams<{ poolId: string }>()
  const { session } = useAuth()
  const uid = session?.user.id

  const { data: pool, isLoading: poolLoading, error: poolError } = usePool(poolId)
  const { data: stats } = usePoolStats(poolId)
  const { data: leaderboard } = useLeaderboard(poolId)
  const { data: myTickets } = useMyTickets(poolId, uid)

  const buyTicket = useBuyTicket(poolId ?? '')
  const releaseTicket = useReleaseTicket(poolId ?? '')
  const [confirmingBuy, setConfirmingBuy] = useState(false)
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null)

  if (poolError) {
    return (
      <div className="mx-auto max-w-md px-6 py-10">
        <Link to="/" className="text-sm text-brand-dark">
          &larr; Volver
        </Link>
        <p className="mt-8 rounded-xl border border-gray-200 bg-white p-6 text-center text-red-600">
          No se pudo cargar la quiniela.
        </p>
      </div>
    )
  }

  if (poolLoading || !pool) {
    return (
      <div className="mx-auto max-w-md px-6 py-10">
        <p className="text-center text-gray-500">Cargando…</p>
      </div>
    )
  }

  const tickets = myTickets ?? []
  const isOrganizer = uid != null && pool.organizer_id === uid
  const canBuyMore = tickets.length < pool.max_tickets_per_user
  const hasNoTickets = tickets.length === 0
  const cascarita = pool.type === 'random_scoreline'
  const unitWord = cascarita ? 'número' : 'boleto'

  const priceLabel = formatMoney(pool.price_cents, pool.currency)

  const handleBuy = async () => {
    try {
      await buyTicket.mutateAsync()
    } catch {
      /* el hook refresca los boletos al completar */
    } finally {
      setConfirmingBuy(false)
    }
  }

  const handleRelease = async (ticketId: string) => {
    try {
      await releaseTicket.mutateAsync(ticketId)
    } catch {
      /* error mostrado abajo via releaseTicket.error */
    } finally {
      setConfirmRelease(null)
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <Link to="/" className="text-sm text-brand-dark">
        &larr; Volver
      </Link>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mt-4 space-y-6"
      >
        {/* Encabezado del pool */}
        <motion.header variants={fadeUp}>
          <h1 className="text-2xl font-bold text-gray-900">{pool.title}</h1>
          <p className="mt-1 text-sm text-gray-600">
            Precio por {unitWord}:{' '}
            <span className="font-semibold text-brand-dark">
              {formatMoney(pool.price_cents, pool.currency)}
            </span>
          </p>
        </motion.header>

        {/* Bote */}
        <motion.div variants={fadeUp}>
          <PotBadge stats={stats ?? null} currency={pool.currency} />
        </motion.div>

        {/* Panel del organizador */}
        {isOrganizer && (
          <motion.div variants={fadeUp}>
            <Link to={`/q/${poolId}/admin`}>
              <motion.div
                whileTap={{ scale: 0.98 }}
                className="flex items-center justify-between rounded-xl border border-brand-dark bg-brand-dark px-5 py-4 text-white shadow-sm"
              >
                <span className="font-semibold">Panel del organizador</span>
                <span aria-hidden>&rarr;</span>
              </motion.div>
            </Link>
          </motion.div>
        )}

        {/* Mis boletos */}
        <motion.section
          variants={fadeUp}
          className="rounded-xl border border-gray-200 bg-white p-5"
        >
          <h2 className="text-lg font-semibold text-gray-900">
            {cascarita ? 'Mis números' : 'Mis boletos'}
          </h2>

          {hasNoTickets && (
            <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-sm font-medium text-brand-dark">
              Compra tu {unitWord} para jugar
            </p>
          )}

          {tickets.length > 0 && (
            <ul className="mt-3 space-y-2">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Link to={`/q/${poolId}/boleto/${ticket.id}`} className="flex-1">
                      <motion.div
                        whileTap={{ scale: 0.98 }}
                        className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-800 transition-colors hover:border-brand"
                      >
                        <span>
                          {cascarita
                            ? `Número #${ticket.ticket_number} — ver mi marcador`
                            : `Boleto #${ticket.ticket_number} — llenar predicciones`}
                        </span>
                        <span aria-hidden className="text-brand-dark">
                          &rarr;
                        </span>
                      </motion.div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setConfirmRelease(ticket.id)}
                      className="shrink-0 rounded-lg border border-gray-200 px-3 py-3 text-xs font-medium text-gray-500 transition-colors hover:border-red-300 hover:text-red-600"
                    >
                      Quitar
                    </button>
                  </div>
                  {confirmRelease === ticket.id && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs">
                      <span className="text-red-700">¿Quitar este {unitWord}? Se libera para alguien más.</span>
                      <button
                        type="button"
                        disabled={releaseTicket.isPending}
                        onClick={() => handleRelease(ticket.id)}
                        className="rounded-md bg-red-600 px-2.5 py-1 font-semibold text-white disabled:opacity-60"
                      >
                        {releaseTicket.isPending ? 'Quitando…' : 'Sí, quitar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRelease(null)}
                        className="rounded-md border border-gray-300 bg-white px-2.5 py-1 font-medium text-gray-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {releaseTicket.error && (
            <p className="mt-2 text-sm text-red-600">{(releaseTicket.error as Error).message}</p>
          )}

          {canBuyMore && !confirmingBuy && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setConfirmingBuy(true)}
              className="mt-4 w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity"
            >
              {`Comprar ${unitWord}`}
            </motion.button>
          )}

          {canBuyMore && confirmingBuy && (
            <div className="mt-4 rounded-lg border border-brand/30 bg-brand/5 p-3">
              <p className="text-sm font-medium text-gray-800">
                {tickets.length === 0
                  ? `¿Comprar tu ${unitWord} por ${priceLabel}?`
                  : `¿Comprar otro ${unitWord} por ${priceLabel}?`}
              </p>
              <div className="mt-2 flex gap-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={handleBuy}
                  disabled={buyTicket.isPending}
                  className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {buyTicket.isPending ? 'Comprando…' : 'Sí, comprar'}
                </motion.button>
                <button
                  type="button"
                  onClick={() => setConfirmingBuy(false)}
                  disabled={buyTicket.isPending}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {buyTicket.error && (
            <p className="mt-2 text-sm text-red-600">
              No se pudo comprar el {unitWord}. Intenta de nuevo.
            </p>
          )}
        </motion.section>

        {/* Compartir */}
        <motion.div variants={fadeUp}>
          <ShareBox code={pool.join_code} title={pool.title} />
        </motion.div>

        {/* Tabla de posiciones */}
        <motion.div variants={fadeUp}>
          <Leaderboard rows={leaderboard ?? []} currentUserId={uid} />
        </motion.div>
      </motion.div>
    </div>
  )
}