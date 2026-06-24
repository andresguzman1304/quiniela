-- =============================================================================
-- Fixes de la revisión adversarial:
--  (1) Re-sorteo dejaba item_scores viejos: assign_random_scorelines ahora
--      recalcula el pool tras reasignar, así el tablero nunca muestra ganadores
--      de predicciones que ya no existen.
--  (2) get_leaderboard usaba INNER JOIN a profiles → un boleto sin perfil
--      (incluso ganador) desaparecía. Ahora LEFT JOIN + nombre por defecto.
-- =============================================================================

create or replace function public.assign_random_scorelines(p_pool uuid)
returns int
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_unique  boolean;
  v_max     int;
  v_count   int := 0;
  v_item    record;
  v_ticket  record;
  v_grid    jsonb[];
  v_i       int;
begin
  if not app.is_organizer(p_pool) then raise exception 'No autorizado'; end if;

  select coalesce((config ->> 'unique')::boolean, false),
         coalesce((config ->> 'max_goals')::int, 3)
    into v_unique, v_max
  from public.pools where id = p_pool;
  if not found then raise exception 'Quiniela no encontrada'; end if;

  perform set_config('app.system_write', 'on', true);

  delete from public.predictions pr using public.tickets t
   where pr.ticket_id = t.id and t.pool_id = p_pool;

  for v_item in select id from public.pool_items where pool_id = p_pool loop
    if v_unique then
      select array_agg(jsonb_build_object('home', h, 'away', a) order by random())
        into v_grid
      from generate_series(0, v_max) as h, generate_series(0, v_max) as a;

      v_i := 1;
      for v_ticket in select id from public.tickets where pool_id = p_pool order by created_at, id loop
        if v_i > coalesce(array_length(v_grid, 1), 0) then
          raise exception 'Hay más números que marcadores únicos disponibles (% posibles). Usa modo repetible o sube el tope de goles.',
            coalesce(array_length(v_grid, 1), 0);
        end if;
        insert into public.predictions (ticket_id, pool_item_id, payload)
        values (v_ticket.id, v_item.id, v_grid[v_i]);
        v_i := v_i + 1;
        v_count := v_count + 1;
      end loop;
    else
      for v_ticket in select id from public.tickets where pool_id = p_pool order by created_at, id loop
        insert into public.predictions (ticket_id, pool_item_id, payload)
        values (v_ticket.id, v_item.id,
                jsonb_build_object('home', floor(random() * (v_max + 1))::int,
                                   'away', floor(random() * (v_max + 1))::int));
        v_count := v_count + 1;
      end loop;
    end if;
  end loop;

  -- FIX (1): recalcular tras reasignar para que item_scores refleje el nuevo
  -- sorteo aunque ya existiera un resultado capturado (evita puntajes huérfanos).
  perform public.recompute_pool(p_pool);

  return v_count;
end;
$$;

-- FIX (2): LEFT JOIN a profiles + nombre por defecto.
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
  select t.id, t.user_id, coalesce(pf.display_name, 'Jugador'), t.ticket_number, t.paid,
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
  left join public.profiles pf on pf.id = t.user_id
  left join scores sc on sc.ticket_id = t.id
  left join preds  pd on pd.ticket_id = t.id
  where t.pool_id = p_pool;
end;
$$;
