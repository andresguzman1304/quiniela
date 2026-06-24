import { motion } from 'framer-motion'
import type { PoolStats } from '@/lib/types'
import { formatMoney } from '@/lib/format'

export function PotBadge({ stats, currency }: { stats: PoolStats | null; currency: string }) {
  if (!stats) return null
  return (
    <div className="grid grid-cols-3 gap-2">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="col-span-3 rounded-xl bg-gradient-to-br from-brand to-brand-dark p-4 text-white shadow"
      >
        <div className="text-xs uppercase tracking-wide opacity-80">Bote (pagado)</div>
        <div className="text-3xl font-bold tabular-nums">
          {formatMoney(stats.pot_cents, currency)}
        </div>
      </motion.div>
      <Stat label="Boletos" value={`${stats.total_tickets}`} />
      <Stat label="Pagados" value={`${stats.paid_tickets}`} />
      <Stat label="Partidos" value={`${stats.results_in}/${stats.item_count}`} hint="con resultado" />
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2 text-center">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      {hint && <div className="text-[9px] text-gray-400">{hint}</div>}
    </div>
  )
}
