import { type FC } from 'react'
import type { PoolItem } from '@/lib/types'
import { footballPlugin } from '@/pools/football/footballPlugin'

/**
 * Contrato de "tipo de pool". Football lo implementa hoy; un tipo nuevo
 * (p. ej. coachella_lineup) solo agrega su plugin aquí — el core no cambia.
 */
// Los genéricos por defecto son `any` a propósito: el dispatch por string
// (pluginFor) pierde el tipo concreto; la seguridad de tipos vive dentro de
// cada plugin (p. ej. footballPlugin está tipado con FootballPoolConfig/Score).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PoolTypePlugin<Config = any, Pred = any, Result = any> {
  label: string
  defaultConfig: () => Config
  ConfigForm: FC<{ value: Config; onChange: (v: Config) => void }>
  PredictionInput: FC<{
    item: PoolItem
    config: Config
    value: Pred | undefined
    disabled: boolean
    onChange: (v: Pred) => void
  }>
  ResultInput: FC<{
    item: PoolItem
    value: Result | null
    onChange: (v: Result | null) => void
  }>
}

export const POOL_TYPES: Record<string, PoolTypePlugin> = {
  football_exact_score: footballPlugin as PoolTypePlugin,
}

export function pluginFor(type: string): PoolTypePlugin {
  return POOL_TYPES[type] ?? (footballPlugin as PoolTypePlugin)
}
