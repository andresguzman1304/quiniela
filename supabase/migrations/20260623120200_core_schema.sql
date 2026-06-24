-- =============================================================================
-- Fase 1 — Core genérico de datos (sin lógica de fútbol en columnas).
-- Lo específico de cada tipo vive en columnas jsonb: pools.config,
-- pool_items.payload / .result, predictions.payload.
-- =============================================================================

create type public.pool_type as enum ('football_exact_score');
-- A futuro: alter type public.pool_type add value 'coachella_lineup';

-- Un pool (quiniela). config (jsonb) ejemplo para fútbol:
--   { "max_goals": 3, "scoring": { "exact_points": 3, "result_points": 1 } }
-- max_goals null/ausente = ilimitado (input libre, acotado a 0..99 al validar).
create table public.pools (
  id                   uuid primary key default gen_random_uuid(),
  organizer_id         uuid not null references auth.users(id),
  type                 public.pool_type not null,
  title                text not null check (length(btrim(title)) > 0),
  join_code            text not null unique,
  price_cents          integer not null default 0 check (price_cents >= 0),
  currency             text not null default 'MXN',
  max_tickets_per_user int not null default 1 check (max_tickets_per_user between 1 and 10),
  config               jsonb not null default '{}'::jsonb,
  scoring_locked       boolean not null default false,  -- true tras el 1er resultado
  created_at           timestamptz not null default now()
);
create index pools_organizer_idx on public.pools (organizer_id);

-- Unidad predecible genérica. Fútbol: un partido por ítem.
--   payload: {"home":"México","away":"Argentina"}
--   result:  {"home":2,"away":1}  (NULL hasta capturar)
create table public.pool_items (
  id                uuid primary key default gen_random_uuid(),
  pool_id           uuid not null references public.pools(id) on delete cascade,
  item_index        int  not null,
  lock_at           timestamptz not null,             -- fútbol: hora de kickoff
  payload           jsonb not null,
  result            jsonb,
  result_entered_at timestamptz,
  unique (pool_id, item_index)
);
create index pool_items_pool_idx on public.pool_items (pool_id);

-- Boleto: cada uno compite independiente en el leaderboard.
create table public.tickets (
  id            uuid primary key default gen_random_uuid(),
  pool_id       uuid not null references public.pools(id) on delete cascade,
  user_id       uuid not null references auth.users(id),
  ticket_number int  not null check (ticket_number >= 1),
  paid          boolean not null default false,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (pool_id, user_id, ticket_number)
);
create index tickets_pool_idx on public.tickets (pool_id);
create index tickets_user_idx on public.tickets (user_id);

-- Predicción por (boleto, ítem). Fútbol payload: {"home":2,"away":1}
create table public.predictions (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  pool_item_id uuid not null references public.pool_items(id) on delete cascade,
  payload      jsonb not null,
  updated_at   timestamptz not null default now(),
  unique (ticket_id, pool_item_id)
);
create index predictions_item_idx on public.predictions (pool_item_id);

-- SALIDA del motor: una fila por (boleto, ítem) SOLO si ese boleto predijo ese
-- ítem y ya hay resultado. Fila ausente = 0 puntos. La escriben únicamente las
-- funciones del sistema (recompute_*), nunca el cliente.
create table public.item_scores (
  ticket_id    uuid not null references public.tickets(id) on delete cascade,
  pool_item_id uuid not null references public.pool_items(id) on delete cascade,
  points       integer not null default 0,
  tier         text not null check (tier in ('exact','result','miss')),
  breakdown    jsonb,                                  -- gancho para tipos futuros (Coachella)
  computed_at  timestamptz not null default now(),
  primary key (ticket_id, pool_item_id)
);
create index item_scores_item_idx on public.item_scores (pool_item_id);
