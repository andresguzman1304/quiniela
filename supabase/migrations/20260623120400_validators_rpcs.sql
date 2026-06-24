-- =============================================================================
-- Fase 1/2 — Validadores por tipo (contrato de plugin) + RPCs de flujo +
-- trigger guardián de predicciones (bloqueo al lock + validación al escribir).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Validadores (despachados por tipo). Cada tipo nuevo agrega su rama aquí.
-- -----------------------------------------------------------------------------
create or replace function app.validate_pool_config(p_type public.pool_type, p_cfg jsonb)
returns void
language plpgsql
as $$
declare v_exact int; v_result int; v_max text;
begin
  if p_type = 'football_exact_score' then
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
returns void
language plpgsql
as $$
declare v_cap int;
begin
  if p_type = 'football_exact_score' then
    if jsonb_typeof(p_payload -> 'home') <> 'number'
       or jsonb_typeof(p_payload -> 'away') <> 'number' then
      raise exception 'Predicción inválida: se requieren goles numéricos en home y away';
    end if;
    v_cap := least(coalesce((p_cfg ->> 'max_goals')::int, 99), 99);
    if (p_payload ->> 'home')::int < 0 or (p_payload ->> 'away')::int < 0
       or (p_payload ->> 'home')::int > v_cap or (p_payload ->> 'away')::int > v_cap then
      raise exception 'Predicción inválida: goles fuera de rango (0..%)', v_cap;
    end if;
  end if;
end;
$$;

create or replace function app.validate_item_result(p_type public.pool_type, p_result jsonb, p_cfg jsonb)
returns void
language plpgsql
as $$
begin
  if p_type = 'football_exact_score' then
    if jsonb_typeof(p_result -> 'home') <> 'number'
       or jsonb_typeof(p_result -> 'away') <> 'number' then
      raise exception 'Resultado inválido: se requieren goles numéricos en home y away';
    end if;
    if (p_result ->> 'home')::int < 0 or (p_result ->> 'away')::int < 0
       or (p_result ->> 'home')::int > 99 or (p_result ->> 'away')::int > 99 then
      raise exception 'Resultado inválido: goles fuera de rango (0..99)';
    end if;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs del flujo (todas validan autorización dentro)
-- -----------------------------------------------------------------------------

-- Crea un pool + sus ítems en una sola transacción. p_items: arreglo jsonb de
-- { "lock_at": "2027-06-01T20:00:00Z", "payload": {"home":"...","away":"..."} }
create or replace function public.create_pool(
  p_type        public.pool_type,
  p_title       text,
  p_price_cents int  default 0,
  p_currency    text default 'MXN',
  p_max_tickets int  default 1,
  p_config      jsonb default '{}'::jsonb,
  p_items       jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_id   uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform app.validate_pool_config(p_type, coalesce(p_config, '{}'::jsonb));

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.pools where join_code = v_code);
  end loop;

  insert into public.pools (organizer_id, type, title, join_code, price_cents,
                            currency, max_tickets_per_user, config)
  values (v_uid, p_type, btrim(p_title), v_code, coalesce(p_price_cents, 0),
          coalesce(nullif(btrim(p_currency), ''), 'MXN'),
          coalesce(p_max_tickets, 1), coalesce(p_config, '{}'::jsonb))
  returning id into v_id;

  insert into public.pool_items (pool_id, item_index, lock_at, payload)
  select v_id, (ord)::int, (e ->> 'lock_at')::timestamptz, e -> 'payload'
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(e, ord);

  return jsonb_build_object('id', v_id, 'join_code', v_code);
end;
$$;

-- Compra un boleto (asigna ticket_number de forma atómica, respeta el máximo).
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

  insert into public.tickets (pool_id, user_id, ticket_number)
  values (p_pool, v_uid, v_count + 1)
  returning id into v_id;
  return v_id;
end;
$$;

-- Unirse por código: crea el boleto #1 si aún no es miembro. Devuelve pool_id.
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
  if not app.is_member(v_pool) then
    perform public.buy_ticket(v_pool);
  end if;
  return v_pool;
end;
$$;

-- Vista previa pública del pool por código (para la pantalla de "unirse").
create or replace function public.get_pool_preview(p_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, app
as $$
declare v jsonb;
begin
  select jsonb_build_object(
           'id', p.id, 'title', p.title, 'type', p.type,
           'price_cents', p.price_cents, 'currency', p.currency,
           'max_tickets_per_user', p.max_tickets_per_user,
           'item_count', (select count(*) from public.pool_items pi where pi.pool_id = p.id)
         )
    into v
  from public.pools p
  where p.join_code = upper(btrim(p_code));
  if v is null then raise exception 'Código de invitación inválido'; end if;
  return v;
end;
$$;

-- Marca/desmarca un boleto como pagado (solo organizador).
create or replace function public.set_ticket_paid(p_ticket uuid, p_paid boolean)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_pool uuid;
begin
  select pool_id into v_pool from public.tickets where id = p_ticket;
  if v_pool is null then raise exception 'Boleto no encontrado'; end if;
  if not app.is_organizer(v_pool) then raise exception 'No autorizado'; end if;
  update public.tickets
     set paid = p_paid,
         paid_at = case when p_paid then now() else null end
   where id = p_ticket;
end;
$$;

-- Captura/edita el resultado de un partido (solo organizador). Dispara el
-- recálculo de puntos vía trigger (definido en la migración de scoring).
create or replace function public.set_item_result(p_item uuid, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_pool uuid; v_type public.pool_type; v_cfg jsonb;
begin
  select pi.pool_id, p.type, p.config
    into v_pool, v_type, v_cfg
  from public.pool_items pi
  join public.pools p on p.id = pi.pool_id
  where pi.id = p_item;

  if v_pool is null then raise exception 'Partido no encontrado'; end if;
  if not app.is_organizer(v_pool) then raise exception 'No autorizado'; end if;
  if p_result is not null then
    perform app.validate_item_result(v_type, p_result, v_cfg);
  end if;

  update public.pool_items
     set result = p_result,
         result_entered_at = case when p_result is not null then now() else null end
   where id = p_item;
end;
$$;

grant execute on function public.create_pool(public.pool_type, text, int, text, int, jsonb, jsonb) to authenticated;
grant execute on function public.buy_ticket(uuid)                 to authenticated;
grant execute on function public.join_pool(text)                  to authenticated;
grant execute on function public.get_pool_preview(text)           to authenticated;
grant execute on function public.set_ticket_paid(uuid, boolean)   to authenticated;
grant execute on function public.set_item_result(uuid, jsonb)     to authenticated;

-- -----------------------------------------------------------------------------
-- Trigger guardián: rechaza escrituras a predicciones tras el lock y valida el
-- payload (un payload malformado rompería el recompute del partido completo).
-- -----------------------------------------------------------------------------
create or replace function app.predictions_guard()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare v_lock timestamptz; v_type public.pool_type; v_cfg jsonb;
begin
  select pi.lock_at, p.type, p.config
    into v_lock, v_type, v_cfg
  from public.pool_items pi
  join public.pools p on p.id = pi.pool_id
  where pi.id = new.pool_item_id;

  if v_lock is null then raise exception 'Partido no encontrado'; end if;
  if now() >= v_lock then
    raise exception 'Predicciones cerradas: el partido ya inició';
  end if;

  perform app.validate_prediction(v_type, new.payload, v_cfg);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists predictions_guard_trg on public.predictions;
create trigger predictions_guard_trg
  before insert or update on public.predictions
  for each row execute function app.predictions_guard();
