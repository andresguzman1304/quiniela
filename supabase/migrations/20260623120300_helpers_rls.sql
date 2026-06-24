-- =============================================================================
-- Fase 1 — Helpers de autorización + Row Level Security.
-- Los helpers son SECURITY DEFINER: corren como owner y por tanto NO disparan
-- RLS recursivo cuando se usan dentro de políticas (patrón recomendado Supabase).
-- =============================================================================

-- ¿El usuario actual es el organizador del pool?
create or replace function app.is_organizer(p_pool uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.pools
    where id = p_pool and organizer_id = (select auth.uid())
  );
$$;

-- ¿El usuario actual es miembro (tiene >= 1 boleto) del pool?
create or replace function app.is_member(p_pool uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.tickets
    where pool_id = p_pool and user_id = (select auth.uid())
  );
$$;

-- ¿El ítem ya está bloqueado (su lock_at / kickoff ya pasó)?
create or replace function app.item_locked(p_item uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select now() >= (select lock_at from public.pool_items where id = p_item);
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.pools       enable row level security;
alter table public.pool_items  enable row level security;
alter table public.tickets     enable row level security;
alter table public.predictions enable row level security;
alter table public.item_scores enable row level security;

-- pools: legible por organizador o miembros. Crear/unirse va por RPC (no hay
-- política INSERT → el insert directo queda denegado). UPDATE/DELETE: organizador.
create policy pools_select on public.pools
  for select to authenticated
  using (organizer_id = (select auth.uid()) or app.is_member(id));

create policy pools_update_organizer on public.pools
  for update to authenticated
  using (organizer_id = (select auth.uid()))
  with check (organizer_id = (select auth.uid()));

create policy pools_delete_organizer on public.pools
  for delete to authenticated
  using (organizer_id = (select auth.uid()));

-- pool_items: legible por miembros/organizador. El organizador administra los
-- partidos directamente (crear/editar/borrar antes del lock); la captura de
-- resultados se hace por RPC set_item_result.
create policy pool_items_select on public.pool_items
  for select to authenticated
  using (app.is_member(pool_id) or app.is_organizer(pool_id));

create policy pool_items_insert_organizer on public.pool_items
  for insert to authenticated
  with check (app.is_organizer(pool_id));

create policy pool_items_update_organizer on public.pool_items
  for update to authenticated
  using (app.is_organizer(pool_id))
  with check (app.is_organizer(pool_id));

create policy pool_items_delete_organizer on public.pool_items
  for delete to authenticated
  using (app.is_organizer(pool_id));

-- tickets: miembros y organizador ven todos los boletos del pool (transparencia
-- del leaderboard). Comprar va por RPC; `paid` solo cambia por RPC del organizador.
create policy tickets_select on public.tickets
  for select to authenticated
  using (app.is_member(pool_id) or app.is_organizer(pool_id));

create policy tickets_delete_organizer on public.tickets
  for delete to authenticated
  using (app.is_organizer(pool_id));

-- predictions: política central del juego.
--   SELECT: el dueño del boleto SIEMPRE; los demás miembros SOLO tras el lock
--           del ítem (así no se ven marcadores ajenos antes del kickoff).
--   INSERT/UPDATE/DELETE: solo el dueño del boleto y solo antes del lock
--           (el lock en insert/update se refuerza además con trigger).
create policy predictions_select on public.predictions
  for select to authenticated
  using (
    exists (
      select 1 from public.tickets t
      where t.id = predictions.ticket_id and t.user_id = (select auth.uid())
    )
    or (
      app.item_locked(predictions.pool_item_id)
      and exists (
        select 1 from public.tickets t
        where t.id = predictions.ticket_id and app.is_member(t.pool_id)
      )
    )
  );

create policy predictions_insert_owner on public.predictions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tickets t
      where t.id = predictions.ticket_id and t.user_id = (select auth.uid())
    )
  );

create policy predictions_update_owner on public.predictions
  for update to authenticated
  using (
    exists (
      select 1 from public.tickets t
      where t.id = predictions.ticket_id and t.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.tickets t
      where t.id = predictions.ticket_id and t.user_id = (select auth.uid())
    )
  );

create policy predictions_delete_owner on public.predictions
  for delete to authenticated
  using (
    not app.item_locked(predictions.pool_item_id)
    and exists (
      select 1 from public.tickets t
      where t.id = predictions.ticket_id and t.user_id = (select auth.uid())
    )
  );

-- item_scores: solo lectura para miembros/organizador. Nadie del lado cliente
-- escribe; solo las funciones SECURITY DEFINER del motor (que corren como owner
-- y omiten RLS). Revocamos por si acaso.
create policy item_scores_select on public.item_scores
  for select to authenticated
  using (
    exists (
      select 1 from public.tickets t
      where t.id = item_scores.ticket_id
        and (app.is_member(t.pool_id) or app.is_organizer(t.pool_id))
    )
  );

revoke insert, update, delete on public.item_scores from authenticated, anon;
