-- =============================================================================
-- Flujo de compra mejorado:
--   1. Entrar sin comprar: la membresía se separa del boleto (tabla pool_members).
--   2. Liberar / "descomprar" un número antes del partido (release_ticket).
--   3. Numeración robusta de boletos (max+1) para que no choque tras liberar.
--   4. Permitir más de 10 números/boletos por persona (relaja el CHECK duro).
-- =============================================================================

-- (4) Relajar el tope duro de números/boletos por persona (antes: 1..10).
alter table public.pools drop constraint if exists pools_max_tickets_per_user_check;
alter table public.pools add  constraint pools_max_tickets_per_user_check
  check (max_tickets_per_user between 1 and 1000);

-- (1) Membresía separada del boleto: estar "dentro" de la quiniela no obliga a comprar.
create table if not exists public.pool_members (
  pool_id   uuid not null references public.pools(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);
create index if not exists pool_members_user_idx on public.pool_members (user_id);
alter table public.pool_members enable row level security;

drop policy if exists pool_members_select on public.pool_members;
create policy pool_members_select on public.pool_members
  for select to authenticated
  using (user_id = (select auth.uid()) or app.is_organizer(pool_id));
-- Sin políticas INSERT/DELETE: la membresía solo se crea por RPC (join/buy).

-- Backfill: todo el que ya tiene boleto pasa a ser miembro (no perder acceso).
insert into public.pool_members (pool_id, user_id)
select distinct pool_id, user_id from public.tickets
on conflict do nothing;

-- is_member ahora consulta la membresía (desacoplada del boleto). Como todas las
-- políticas RLS pasan por esta función, el cambio aplica en todo el modelo.
create or replace function app.is_member(p_pool uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.pool_members
    where pool_id = p_pool and user_id = (select auth.uid())
  );
$$;

-- Unirse por código: ahora solo te hace miembro, NO compra boleto automático.
create or replace function public.join_pool(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_pool uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select id into v_pool from public.pools where join_code = upper(btrim(p_code));
  if v_pool is null then raise exception 'Código de invitación inválido'; end if;
  insert into public.pool_members (pool_id, user_id)
  values (v_pool, v_uid)
  on conflict do nothing;
  return v_pool;
end;
$$;

-- Comprar un boleto: asegura membresía y numera con max+1 (evita colisión tras liberar).
create or replace function public.buy_ticket(p_pool uuid)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_max   int;
  v_count int;
  v_num   int;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform pg_advisory_xact_lock(hashtext(p_pool::text || ':' || v_uid::text));

  select max_tickets_per_user into v_max from public.pools where id = p_pool;
  if v_max is null then raise exception 'Quiniela no encontrada'; end if;

  select count(*) into v_count from public.tickets
  where pool_id = p_pool and user_id = v_uid;

  if v_count >= v_max then
    raise exception 'Alcanzaste el máximo de boletos (%) para esta quiniela', v_max;
  end if;

  insert into public.pool_members (pool_id, user_id)
  values (p_pool, v_uid)
  on conflict do nothing;

  select coalesce(max(ticket_number), 0) + 1 into v_num
  from public.tickets where pool_id = p_pool and user_id = v_uid;

  insert into public.tickets (pool_id, user_id, ticket_number)
  values (p_pool, v_uid, v_num)
  returning id into v_id;
  return v_id;
end;
$$;

-- (2) Liberar/"descomprar" un número propio antes de que inicie el partido.
-- Borra el boleto (cascada elimina sus predicciones y puntajes). El usuario sigue
-- siendo miembro de la quiniela (puede volver a comprar).
create or replace function public.release_ticket(p_ticket uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_pool   uuid;
  v_locked boolean;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;

  select pool_id into v_pool from public.tickets
  where id = p_ticket and user_id = v_uid;
  if v_pool is null then raise exception 'Número no encontrado'; end if;

  select exists (
    select 1 from public.pool_items where pool_id = v_pool and now() >= lock_at
  ) into v_locked;
  if v_locked then
    raise exception 'El partido ya inició: no puedes quitar el número';
  end if;

  delete from public.tickets where id = p_ticket;
end;
$$;

grant execute on function public.join_pool(text)      to authenticated;
grant execute on function public.buy_ticket(uuid)     to authenticated;
grant execute on function public.release_ticket(uuid) to authenticated;
