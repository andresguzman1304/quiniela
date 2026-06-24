// Tipos de dominio (hasta generar database.types.ts con `npm run gen:types`).

export type PoolType = 'football_exact_score' | 'random_scoreline'

export interface FootballScore {
  home: number
  away: number
}

export interface ScoringConfig {
  exact_points: number
  result_points: number
}

export interface FootballPoolConfig {
  /** null = goles ilimitados (input libre, acotado a 0..99 al validar) */
  max_goals: number | null
  scoring: ScoringConfig
  /** Solo cascarita (random_scoreline): true = marcadores únicos; false = repetibles */
  unique?: boolean
}

export interface Pool {
  id: string
  organizer_id: string
  type: PoolType
  title: string
  join_code: string
  price_cents: number
  currency: string
  max_tickets_per_user: number
  config: FootballPoolConfig
  scoring_locked: boolean
  created_at: string
}

export interface PoolItem {
  id: string
  pool_id: string
  item_index: number
  lock_at: string
  payload: { home: string; away: string }
  result: FootballScore | null
  result_entered_at: string | null
}

export interface Ticket {
  id: string
  pool_id: string
  user_id: string
  ticket_number: number
  paid: boolean
  paid_at: string | null
  created_at: string
}

export interface Prediction {
  id: string
  ticket_id: string
  pool_item_id: string
  payload: FootballScore
  updated_at: string
}

export interface LeaderboardRow {
  ticket_id: string
  user_id: string
  display_name: string
  ticket_number: number
  paid: boolean
  total_points: number
  exact_hits: number
  result_hits: number
  predictions_made: number
  rank: number
}

export interface PoolStats {
  total_tickets: number
  paid_tickets: number
  unpaid_tickets: number
  pot_cents: number
  item_count: number
  results_in: number
  incomplete_tickets: number
}

export interface PoolPreview {
  id: string
  title: string
  type: PoolType
  price_cents: number
  currency: string
  max_tickets_per_user: number
  item_count: number
}
