-- =============================================================================
-- Cascarita (random_scoreline): el participante compra un número y el organizador
-- "sortea" antes del partido, asignando un marcador al azar a cada boleto.
-- Gana quien tenga el marcador real (scoring exacto). Reusa el core.
-- =============================================================================

-- --- Validadores: random_scoreline se valida igual que fútbol exacto ---
create or replace function app.validate_pool_config(p_type public.pool_type, p_cfg jsonb)
returns void language plpgsql as $$
declare v_exact int; v_result int; v_max text;
begin
  if p_type in ('football_exact_score', 'random_scoreline') then
    v_exact  := coalesce((p_cfg #>> '{scoring,exact_points}')::int, 3);
    v_result := coalesce((p_cfg #>> '{scoring,result_points}')::int, 1);
    if v_exact < 0 or v_result < 0 then
      raise exception 'Config inválida: los puntos no pueden ser negativos';
    end if;
    if v_exact < v_result then
      raise exception 'Config inválida: exact_points (%) debe ser >= result_points (%)', v_exact, v_result;
    end if;
    v_max := p_cfg ->> 'max_goals';
    if v_max is not null and (v_max::int < 1 or v_max::int > 50) then
      raise exception 'Config inválida: max_goals debe estar entre 1 y 50 (o nulo = ilimitado)';
    end if;
  end if;
end;
$$;

create or replace function app.validate_prediction(p_type public.pool_type, p_payload jsonb, p_cfg jsonb)
returns void language plpgsql as $$
declare v_cap int;
begin
  if p_type in ('football_exact_score', 'random_scoreline') then
    if jsonb_typeof(p_payload -> 'home') <> 'number' or jsonb_typeof(p_payload -> 'away') <> 'number' then
      raise exception 'Marcador inválido: se requieren goles numéricos en home y away';
    end if;
    v_cap := least(coalesce((p_cfg ->> 'max_goals')::int, 99), 99);
    if (p_payload ->> 'home')::int < 0 or (p_payload ->> 'away')::int < 0
       or (p_payload ->> 'home')::int > v_cap or (p_payload ->> 'away')::int > v_cap then
      raise exception 'Marcador inválido: goles fuera de rango (0..%)', v_cap;
    end if;
  end if;
end;
$$;

create or replace function app.validate_item_result(p_type public.pool_type, p_result jsonb, p_cfg jsonb)
returns void language plpgsql as $$
begin
  if p_type in ('football_exact_score', 'random_scoreline') then
    if jsonb_typeof(p_result -> 'home') <> 'number' or jsonb_typeof(p_result -> 'away') <> 'number' then
      raise exception 'Resultado inválido: se requieren goles numéricos en home y away';
    end if;
    if (p_result ->> 'home')::int < 0 or (p_result ->> 'away')::int < 0
       or (p_result ->> 'home')::int > 99 or (p_result ->> 'away')::int > 99 then
      raise exception 'Resultado inválido: goles fuera de rango (0..99)';
    end if;
  end if;
end;
$$;

-- --- Scoring: random_scoreline puntúa igual que el marcador exacto ---
create or replace function public.score_prediction(p_type public.pool_type, p_pred jsonb, p_res jsonb, p_cfg jsonb)
returns jsonb language plpgsql immutable as $$
begin
  case p_type
    when 'football_exact_score' then return public.score_football_exact(p_pred, p_res, p_cfg);
    when 'random_scoreline'     then return public.score_football_exact(p_pred, p_res, p_cfg);
    else raise exception 'Sin estrategia de scoring para el tipo %', p_type;
  end case;
end;
$$;

-- --- Guard de predicciones: permite escritura del sistema (sorteo) y bloquea
--     que el participante edite su marcador en cascarita ---
create or replace function app.predictions_guard()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_lock timestamptz; v_type public.pool_type; v_cfg jsonb;
begin
  -- El sorteo (assign_random_scorelines) marca esta bandera para poder escribir
  -- los marcadores asignados sin disparar bloqueo/validación de participante.
  if current_setting('app.system_write', true) = 'on' then
    return new;
  end if;

  select pi.lock_at, p.type, p.config
    into v_lock, v_type, v_cfg
  from public.pool_items pi
  join public.pools p on p.id = pi.pool_id
  where pi.id = new.pool_item_id;

  if v_lock is null then raise exception 'Partido no encontrado'; end if;

  if v_type = 'random_scoreline' then
    raise exception 'El marcador es aleatorio (cascarita): no puedes editarlo';
  end if;

  if now() >= v_lock then
    raise exception 'Predicciones cerradas: el partido ya inició';
  end if;

  perform app.validate_prediction(v_type, new.payload, v_cfg);
  new.updated_at := now();
  return new;
end;
$$;

-- --- Sorteo: asigna un marcador al azar a cada boleto del pool ---
-- unique=true: reparte marcadores distintos de la cuadrícula 0..max (sin repetir);
-- unique=false: cada boleto recibe un marcador al azar independiente (puede repetir).
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

  return v_count;
end;
$$;

grant execute on function public.assign_random_scorelines(uuid) to authenticated;
