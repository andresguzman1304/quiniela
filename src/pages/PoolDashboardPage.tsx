import { motion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '@/auth/AuthProvider'
import {
  usePool,
  usePoolStats,
  useLeaderboard,
  useMyTickets,
  useBuyTicket,
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

  const handleBuy = async () => {
    try {
      await buyTicket.mutateAsync()
    } catch {
      /* el hook refresca los boletos al completar */
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
                <li key={ticket.id}>
                  <Link to={`/q/${poolId}/boleto/${ticket.id}`}>
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
                </li>
              ))}
            </ul>
          )}

          {canBuyMore && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleBuy}
              disabled={buyTicket.isPending}
              className="mt-4 w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-60"
            >
              {buyTicket.isPending ? 'Comprando…' : `Comprar ${unitWord}`}
            </motion.button>
          )}

          {buyTicket.error && (
            <p className="mt-2 text-sm text-red-600">
              No se pudo comprar el boleto. Intenta de nuevo.
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