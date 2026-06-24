import { motion } from 'framer-motion'

/**
 * Selector de goles. Si hay tope chico (<=9) muestra botones 0..max; si el tope
 * es grande o ilimitado (null), muestra un stepper numérico (0..99).
 */
export function ScoreInput({
  value,
  max,
  disabled = false,
  onChange,
}: {
  value: number | undefined
  max: number | null
  disabled?: boolean
  onChange: (n: number) => void
}) {
  const cap = max == null ? 99 : Math.min(max, 99)

  if (max != null && max <= 9) {
    return (
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: max + 1 }, (_, n) => {
          const active = value === n
          return (
            <motion.button
              key={n}
              type="button"
              disabled={disabled}
              whileTap={{ scale: 0.88 }}
              onClick={() => onChange(n)}
              className={[
                'h-9 w-9 rounded-lg text-sm font-semibold transition-colors',
                active
                  ? 'bg-brand text-white shadow'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                disabled ? 'cursor-not-allowed opacity-50' : '',
              ].join(' ')}
            >
              {n}
            </motion.button>
          )
        })}
      </div>
    )
  }

  const v = value ?? 0
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || v <= 0}
        onClick={() => onChange(Math.max(0, v - 1))}
        className="h-9 w-9 rounded-lg bg-gray-100 text-lg font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-40"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        max={cap}
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => {
          const n = Math.max(0, Math.min(cap, Math.floor(Number(e.target.value) || 0)))
          onChange(n)
        }}
        className="h-9 w-14 rounded-lg border border-gray-300 text-center font-semibold outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
      />
      <button
        type="button"
        disabled={disabled || v >= cap}
        onClick={() => onChange(Math.min(cap, v + 1))}
        className="h-9 w-9 rounded-lg bg-gray-100 text-lg font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-40"
      >
        +
      </button>
    </div>
  )
}
