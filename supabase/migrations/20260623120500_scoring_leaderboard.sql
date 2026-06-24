-- =============================================================================
-- Fase 2 — Motor de puntuación (en Postgres), recálculo idempotente, triggers,
-- y funciones de leaderboard / stats.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Estrategia de scoring por tipo (puras). Cada tipo nuevo agrega su función + rama.
-- -----------------------------------------------------------------------------
create or replace function public.score_football_exact(p_pred jsonb, p_res jsonb, p_cfg jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  ph int := (p_pred ->> 'home')::int;
  pa int := (p_pred ->> 'away')::int;
  rh int := (p_res  ->> 'home')::int;
  ra int := (p_res  ->> 'away')::int;
  ex int := coalesce((p_cfg ->> 'exact_points')::int, 3);
  rp int := coalesce((p_cfg ->> 'result_points')::int, 1);
begin
  if ph = rh and pa = ra then
    return jsonb_build_object('points', ex, 'tier', 'exact');
  elsif sign(ph - pa) = sign(rh - ra) then            -- mismo 1X2 (maneja empates)
    return jsonb_build_object('points', rp, 'tier', 'result');
  else
    return jsonb_build_object('points', 0, 'tier', 'miss');
  end if;
end;
$$;

-- Dispatcher: único punto que conoce los tipos.
create or replace function public.score_prediction(p_type public.pool_type, p_pred jsonb, p_res jsonb, p_cfg jsonb)
returns jsonb
language plpgsql
immutable
as $$
begin
  case p_type
    when 'football_exact_score' then
      return public.score_football_exact(p_pred, p_res, p_cfg);
    else
      raise exception 'Sin estrategia de scoring para el tipo %', p_type;
  end case;
end;
$$;

-- -----------------------------------------------------------------------------
-- Recálculo idempotente: borra y reconstruye los puntajes de un ítem desde cero.
-- Solo crea filas para predicciones existentes; sin resultado => 0 filas.
-- -----------------------------------------------------------------------------
create or replace function public.recompute_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_type public.pool_type; v_result jsonb; v_cfg jsonb;
begin
  select p.type, pi.result, p.config -> 'scoring'
    into v_type, v_result, v_cfg
  from public.pool_items pi
  join public.pools p on p.id = pi.pool_id
  where pi.id = p_item_id;

  delete from public.item_scores where pool_item_id = p_item_id;
  if v_result is null then return; end if;           -- sin resultado capturado => 0

  insert into public.item_scores (ticket_id, pool_item_id, points, tier, computed_at)
  select pr.ticket_id, p_item_id, (s.j ->> 'points')::int, s.j ->> 'tier', now()
  from public.predictions pr
  cross join lateral (
    select public.score_prediction(v_type, pr.payload, v_result, coalesce(v_cfg, '{}'::jsonb)) as j
  ) s
  where pr.pool_item_id = p_item_id;
end;
$$;

create or replace function public.recompute_pool(p_pool_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare r record;
begin
  for r in select id from public.pool_items where pool_id = p_pool_id loop
    perform public.recompute_item(r.id);
  end loop;
end;
$$;

-- Estas funciones son internas (las llaman los triggers, que corren como owner).
revoke execute on function public.recompute_item(uuid) from public, anon, authenticated;
revoke execute on function public.recompute_pool(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

-- Al escribir/editar un resultado: recalcula ese ítem (atómico con el write) y
-- bloquea la config de puntos tras el primer resultado.
create or replace function app.trg_recompute_on_result()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if tg_op = 'UPDATE' and new.result is not distinct from old.result then
    return new;                                       -- guardado duplicado: no-op
  end if;
  perform public.recompute_item(new.id);
  if new.result is not null then
    update public.pools set scoring_locked = true
     where id = new.pool_id and scoring_locked = false;
  end if;
  return new;
end;
$$;

drop trigger if exists pool_items_result_recompute on public.pool_items;
create trigger pool_items_result_recompute
  after insert or update of result on public.pool_items
  for each row execute function app.trg_recompute_on_result();

-- Si el organizador cambia la config de puntos (antes del lock), recalcula todo.
create or replace function app.trg_rescore_on_config()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if new.config -> 'scoring' is distinct from old.config -> 'scoring' then
    perform public.recompute_pool(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists pools_config_rescore on public.pools;
create trigger pools_config_rescore
  after update of config on public.pools
  for each row execute function app.trg_rescore_on_config();

-- No permitir cambiar la config de puntos una vez bloqueada (ya hay resultados).
create or replace function app.trg_pools_scoring_lock_guard()
returns trigger
language plpgsql
as $$
begin
  if old.scoring_locked
     and (new.config -> 'scoring' is distinct from old.config -> 'scoring') then
    raise exception 'La configuración de puntos está bloqueada: ya hay resultados capturados';
  end if;
  return new;
end;
$$;

drop trigger if exists pools_scoring_lock_guard on public.pools;
create trigger pools_scoring_lock_guard
  before update on public.pools
  for each row execute function app.trg_pools_scoring_lock_guard();

-- -----------------------------------------------------------------------------
-- Leaderboard y stats (SECURITY DEFINER, gated por membresía). Exponen solo
-- agregados (puntos, conteos) — nunca el contenido de predicciones ajenas — así
-- que el conteo de "quién no ha llenado" funciona aun antes del kickoff.
-- -----------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_pool uuid)
returns table (
  ticket_id        uuid,
  user_id          uuid,
  display_name     text,
  ticket_number    int,
  paid             boolean,
  total_points     int,
  exact_hits       int,
  result_hits      int,
  predictions_made int,
  rank             bigint
)
language plpgsql
security definer
stable
set search_path = public, app
as $$
begin
  if not (app.is_member(p_pool) or app.is_organizer(p_pool)) then
    raise exception 'No autorizado';
  end if;

  return query
  with scores as (
    select s.ticket_id,
           sum(s.points)::int                             as total_points,
           count(*) filter (where s.tier = 'exact')::int  as exact_hits,
           count(*) filter (where s.tier = 'result')::int as result_hits
    from public.item_scores s
    join public.tickets t on t.id = s.ticket_id
    where t.pool_id = p_pool
    group by s.ticket_id
  ),
  preds as (
    select pr.ticket_id, count(*)::int as predictions_made
    from public.predictions pr
    join public.tickets t on t.id = pr.ticket_id
    where t.pool_id = p_pool
    group by pr.ticket_id
  )
  select t.id, t.user_id, pf.display_name, t.ticket_number, t.paid,
         coalesce(sc.total_points, 0),
         coalesce(sc.exact_hits, 0),
         coalesce(sc.result_hits, 0),
         coalesce(pd.predictions_made, 0),
         rank() over (
           order by coalesce(sc.total_points, 0) desc,
                    coalesce(sc.exact_hits, 0)   desc,
                    coalesce(sc.result_hits, 0)  desc,
                    t.created_at asc
         )
  from public.tickets t
  join public.profiles pf on pf.id = t.user_id
  left join scores sc on sc.ticket_id = t.id
  left join preds  pd on pd.ticket_id = t.id
  where t.pool_id = p_pool;
end;
$$;

create or replace function public.get_pool_stats(p_pool uuid)
returns table (
  total_tickets      int,
  paid_tickets       int,
  unpaid_tickets     int,
  pot_cents          bigint,
  item_count         int,
  results_in         int,
  incomplete_tickets int
)
language plpgsql
security definer
stable
set search_path = public, app
as $$
declare v_price int;
begin
  if not (app.is_member(p_pool) or app.is_organizer(p_pool)) then
    raise exception 'No autorizado';
  end if;
  select price_cents into v_price from public.pools where id = p_pool;

  return query
  with itc as (select count(*)::int n from public.pool_items where pool_id = p_pool),
       ric as (select count(*)::int n from public.pool_items where pool_id = p_pool and result is not null)
  select
    count(t.*)::int,
    count(t.*) filter (where t.paid)::int,
    count(t.*) filter (where not t.paid)::int,
    (count(t.*) filter (where t.paid) * coalesce(v_price, 0))::bigint,
    (select n from itc),
    (select n from ric),
    count(t.*) filter (
      where (select count(*) from public.predictions pr where pr.ticket_id = t.id) < (select n from itc)
    )::int
  from public.tickets t
  where t.pool_id = p_pool;
end;
$$;

grant execute on function public.get_leaderboard(uuid) to authenticated;
grant execute on function public.get_pool_stats(uuid)  to authenticated;
