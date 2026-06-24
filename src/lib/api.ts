import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type {
  FootballPoolConfig,
  FootballScore,
  LeaderboardRow,
  Pool,
  PoolItem,
  PoolPreview,
  PoolStats,
  PoolType,
  Prediction,
  Ticket,
} from '@/lib/types'

// =============================================================================
// Queries (lectura) — todas respetan RLS (el usuario solo ve lo que le toca).
// =============================================================================

// Mis quinielas: RLS devuelve solo los pools donde soy organizador o tengo boleto.
export function useMyPools(enabled = true) {
  return useQuery({
    queryKey: ['my_pools'],
    enabled,
    queryFn: async (): Promise<Pool[]> => {
      const { data, error } = await supabase
        .from('pools')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Pool[]
    },
  })
}

export function usePool(poolId?: string) {
  return useQuery({
    queryKey: ['pool', poolId],
    enabled: !!poolId,
    queryFn: async (): Promise<Pool> => {
      const { data, error } = await supabase.from('pools').select('*').eq('id', poolId!).single()
      if (error) throw error
      return data as Pool
    },
  })
}

export function usePoolItems(poolId?: string) {
  return useQuery({
    queryKey: ['pool_items', poolId],
    enabled: !!poolId,
    queryFn: async (): Promise<PoolItem[]> => {
      const { data, error } = await supabase
        .from('pool_items')
        .select('*')
        .eq('pool_id', poolId!)
        .order('item_index')
      if (error) throw error
      return data as PoolItem[]
    },
  })
}

export function useMyTickets(poolId?: string, userId?: string) {
  return useQuery({
    queryKey: ['my_tickets', poolId, userId],
    enabled: !!poolId && !!userId,
    queryFn: async (): Promise<Ticket[]> => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('pool_id', poolId!)
        .eq('user_id', userId!)
        .order('ticket_number')
      if (error) throw error
      return data as Ticket[]
    },
  })
}

export function usePredictions(ticketId?: string) {
  return useQuery({
    queryKey: ['predictions', ticketId],
    enabled: !!ticketId,
    queryFn: async (): Promise<Prediction[]> => {
      const { data, error } = await supabase.from('predictions').select('*').eq('ticket_id', ticketId!)
      if (error) throw error
      return data as Prediction[]
    },
  })
}

export function useLeaderboard(poolId?: string) {
  return useQuery({
    queryKey: ['leaderboard', poolId],
    enabled: !!poolId,
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase.rpc('get_leaderboard', { p_pool: poolId! })
      if (error) throw error
      return (data ?? []) as LeaderboardRow[]
    },
  })
}

export function usePoolStats(poolId?: string) {
  return useQuery({
    queryKey: ['pool_stats', poolId],
    enabled: !!poolId,
    queryFn: async (): Promise<PoolStats | null> => {
      const { data, error } = await supabase.rpc('get_pool_stats', { p_pool: poolId! })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return (row ?? null) as PoolStats | null
    },
  })
}

// =============================================================================
// RPCs / escrituras (funciones crudas)
// =============================================================================

export interface CreatePoolInput {
  type: PoolType
  title: string
  price_cents: number
  currency: string
  max_tickets: number
  config: FootballPoolConfig
  items: { lock_at: string; payload: { home: string; away: string } }[]
}

export async function createPool(input: CreatePoolInput): Promise<{ id: string; join_code: string }> {
  const { data, error } = await supabase.rpc('create_pool', {
    p_type: input.type,
    p_title: input.title,
    p_price_cents: input.price_cents,
    p_currency: input.currency,
    p_max_tickets: input.max_tickets,
    p_config: input.config,
    p_items: input.items,
  })
  if (error) throw error
  return data as { id: string; join_code: string }
}

export async function getPoolPreview(code: string): Promise<PoolPreview> {
  const { data, error } = await supabase.rpc('get_pool_preview', { p_code: code })
  if (error) throw error
  return data as PoolPreview
}

// =============================================================================
// Mutations (con invalidación de cache)
// =============================================================================

export function useCreatePool() {
  return useMutation({ mutationFn: createPool })
}

export function useJoinPool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string): Promise<string> => {
      const { data, error } = await supabase.rpc('join_pool', { p_code: code.trim() })
      if (error) throw error
      return data as string
    },
    onSuccess: (poolId) => {
      qc.invalidateQueries({ queryKey: ['my_tickets', poolId] })
      qc.invalidateQueries({ queryKey: ['leaderboard', poolId] })
      qc.invalidateQueries({ queryKey: ['pool_stats', poolId] })
    },
  })
}

export function useBuyTicket(poolId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('buy_ticket', { p_pool: poolId })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_tickets', poolId] })
      qc.invalidateQueries({ queryKey: ['leaderboard', poolId] })
      qc.invalidateQueries({ queryKey: ['pool_stats', poolId] })
    },
  })
}

// Liberar / "descomprar" un número propio (antes del partido).
export function useReleaseTicket(poolId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ticketId: string): Promise<void> => {
      const { error } = await supabase.rpc('release_ticket', { p_ticket: ticketId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_tickets', poolId] })
      qc.invalidateQueries({ queryKey: ['leaderboard', poolId] })
      qc.invalidateQueries({ queryKey: ['pool_stats', poolId] })
    },
  })
}

export function useSavePrediction(poolId: string, ticketId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { poolItemId: string; payload: FootballScore }): Promise<void> => {
      const { error } = await supabase
        .from('predictions')
        .upsert(
          { ticket_id: ticketId, pool_item_id: vars.poolItemId, payload: vars.payload },
          { onConflict: 'ticket_id,pool_item_id' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['predictions', ticketId] })
      qc.invalidateQueries({ queryKey: ['leaderboard', poolId] })
      qc.invalidateQueries({ queryKey: ['pool_stats', poolId] })
    },
  })
}

export function useSetTicketPaid(poolId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { ticketId: string; paid: boolean }): Promise<void> => {
      const { error } = await supabase.rpc('set_ticket_paid', {
        p_ticket: vars.ticketId,
        p_paid: vars.paid,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaderboard', poolId] })
      qc.invalidateQueries({ queryKey: ['pool_stats', poolId] })
    },
  })
}

export function useSetItemResult(poolId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { itemId: string; result: FootballScore | null }): Promise<void> => {
      const { error } = await supabase.rpc('set_item_result', {
        p_item: vars.itemId,
        p_result: vars.result,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pool_items', poolId] })
      qc.invalidateQueries({ queryKey: ['leaderboard', poolId] })
      qc.invalidateQueries({ queryKey: ['pool_stats', poolId] })
    },
  })
}

// El organizador borra una quiniela no iniciada.
export function useDeletePool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (poolId: string): Promise<void> => {
      const { error } = await supabase.rpc('delete_pool', { p_pool: poolId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_pools'] })
    },
  })
}

// El organizador edita la configuración de una quiniela ya creada.
export function useUpdatePoolSettings(poolId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      title?: string
      price_cents?: number
      max_tickets?: number
      config?: FootballPoolConfig
    }): Promise<void> => {
      const { error } = await supabase.rpc('update_pool_settings', {
        p_pool: poolId,
        p_title: vars.title ?? null,
        p_price_cents: vars.price_cents ?? null,
        p_max_tickets: vars.max_tickets ?? null,
        p_config: vars.config ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pool', poolId] })
      qc.invalidateQueries({ queryKey: ['my_pools'] })
      qc.invalidateQueries({ queryKey: ['pool_stats', poolId] })
    },
  })
}

// Cascarita: el organizador "sortea" y se asigna un marcador al azar a cada boleto.
export function useAssignScorelines(poolId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('assign_random_scorelines', { p_pool: poolId })
      if (error) throw error
      return data as number
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['predictions'] })
      qc.invalidateQueries({ queryKey: ['leaderboard', poolId] })
      qc.invalidateQueries({ queryKey: ['pool_stats', poolId] })
    },
  })
}
