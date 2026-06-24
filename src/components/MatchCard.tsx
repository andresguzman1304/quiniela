import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { PoolItem } from '@/lib/types'
import { Flag } from '@/components/Flag'

function fmtKickoff(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MatchCard({
  item,
  index = 0,
  children,
}: {
  item: PoolItem
  index?: number
  children?: ReactNode
}) {
  const locked = new Date(item.lock_at).getTime() <= Date.now()
  const home = item.payload?.home ?? '—'
  const away = item.payload?.away ?? '—'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span>{fmtKickoff(item.lock_at)}</span>
        {locked ? (
          <span className="rounded-full bg-gray-200 px-2 py-0.5 font-medium text-gray-600">
            🔒 Cerrado
          </span>
        ) : (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand-dark">
            Abierto
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Flag team={home} size={22} placeholder />
          <span className="truncate font-medium">{home}</span>
        </div>

        {item.result ? (
          <span className="shrink-0 rounded-lg bg-gray-900 px-3 py-1 font-bold tabular-nums text-white">
            {item.result.home}–{item.result.away}
          </span>
        ) : (
          <span className="shrink-0 text-sm font-semibold text-gray-400">vs</span>
        )}

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
          <span className="truncate font-medium">{away}</span>
          <Flag team={away} size={22} placeholder />
        </div>
      </div>

      {children && <div className="mt-3 border-t border-gray-100 pt-3">{children}</div>}
    </motion.div>
  )
}
