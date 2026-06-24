import { AnimatePresence, motion } from 'framer-motion'
import type { LeaderboardRow } from '@/lib/types'

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`)

export function Leaderboard({
  rows,
  currentUserId,
}: {
  rows: LeaderboardRow[]
  currentUserId?: string
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
        Aún no hay boletos en esta quiniela.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Jugador</th>
            <th className="px-2 py-2 text-center font-medium">Pts</th>
            <th className="px-2 py-2 text-center font-medium" title="Marcadores exactos">🎯</th>
            <th className="px-2 py-2 text-center font-medium">Pago</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {rows.map((r) => {
              const mine = r.user_id === currentUserId
              return (
                <motion.tr
                  key={r.ticket_id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`border-t border-gray-100 ${mine ? 'bg-brand/5' : ''}`}
                >
                  <td className="px-3 py-2 font-semibold tabular-nums">{medal(r.rank)}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.display_name}</span>
                    {r.ticket_number > 1 && (
                      <span className="ml-1 text-xs text-gray-400">#{r.ticket_number}</span>
                    )}
                    {mine && <span className="ml-1 text-xs text-brand-dark">(tú)</span>}
                  </td>
                  <td className="px-2 py-2 text-center font-bold tabular-nums">{r.total_points}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-gray-600">{r.exact_hits}</td>
                  <td className="px-2 py-2 text-center">
                    {r.paid ? (
                      <span title="Pagado">✅</span>
                    ) : (
                      <span title="Sin pagar" className="opacity-40">⬜</span>
                    )}
                  </td>
                </motion.tr>
              )
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  )
}
