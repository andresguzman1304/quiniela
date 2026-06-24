import { type FC } from 'react'
import type { FootballPoolConfig, FootballScore, PoolItem } from '@/lib/types'
import { ScoreInput } from '@/components/ScoreInput'
import { Flag } from '@/components/Flag'
import type { PoolTypePlugin } from '@/pools/types/registry'

const FootballConfigForm: FC<{
  value: FootballPoolConfig
  onChange: (v: FootballPoolConfig) => void
}> = ({ value, onChange }) => {
  const options: { label: string; max: number | null }[] = [
    { label: '0–3', max: 3 },
    { label: '0–5', max: 5 },
    { label: '0–9', max: 9 },
    { label: 'Ilimitado', max: null },
  ]
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Tope de goles por equipo</label>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const active = value.max_goals === o.max
            return (
              <button
                key={o.label}
                type="button"
                onClick={() => onChange({ ...value, max_goals: o.max })}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Puntos por marcador exacto</span>
          <input
            type="number"
            min={0}
            value={value.scoring.exact_points}
            onChange={(e) =>
              onChange({ ...value, scoring: { ...value.scoring, exact_points: Number(e.target.value) || 0 } })
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Puntos por acertar ganador</span>
          <input
            type="number"
            min={0}
            value={value.scoring.result_points}
            onChange={(e) =>
              onChange({ ...value, scoring: { ...value.scoring, result_points: Number(e.target.value) || 0 } })
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </label>
      </div>
      <p className="text-xs text-gray-500">
        El marcador exacto debe valer ≥ que acertar solo al ganador.
      </p>
    </div>
  )
}

function ScoreRow({
  team,
  goals,
  max,
  disabled,
  onChange,
}: {
  team: string
  goals: number | undefined
  max: number | null
  disabled: boolean
  onChange: (n: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Flag team={team} size={20} placeholder />
        <span className="truncate text-sm font-medium">{team}</span>
      </div>
      <ScoreInput value={goals} max={max} disabled={disabled} onChange={onChange} />
    </div>
  )
}

const FootballPredictionInput: FC<{
  item: PoolItem
  config: FootballPoolConfig
  value: FootballScore | undefined
  disabled: boolean
  onChange: (v: FootballScore) => void
}> = ({ item, config, value, disabled, onChange }) => {
  const max = config?.max_goals ?? null
  return (
    <div className="space-y-2">
      <ScoreRow
        team={item.payload.home}
        goals={value?.home}
        max={max}
        disabled={disabled}
        onChange={(n) => onChange({ home: n, away: value?.away ?? 0 })}
      />
      <ScoreRow
        team={item.payload.away}
        goals={value?.away}
        max={max}
        disabled={disabled}
        onChange={(n) => onChange({ home: value?.home ?? 0, away: n })}
      />
    </div>
  )
}

const FootballResultInput: FC<{
  item: PoolItem
  value: FootballScore | null
  onChange: (v: FootballScore | null) => void
}> = ({ item, value, onChange }) => {
  return (
    <div className="space-y-2">
      <ScoreRow
        team={item.payload.home}
        goals={value?.home}
        max={null}
        disabled={false}
        onChange={(n) => onChange({ home: n, away: value?.away ?? 0 })}
      />
      <ScoreRow
        team={item.payload.away}
        goals={value?.away}
        max={null}
        disabled={false}
        onChange={(n) => onChange({ home: value?.home ?? 0, away: n })}
      />
    </div>
  )
}

export const footballPlugin: PoolTypePlugin<FootballPoolConfig, FootballScore, FootballScore> = {
  label: 'Fútbol — marcador exacto',
  defaultConfig: () => ({ max_goals: 3, scoring: { exact_points: 3, result_points: 1 } }),
  ConfigForm: FootballConfigForm,
  PredictionInput: FootballPredictionInput,
  ResultInput: FootballResultInput,
}
