-- 100 simulaciones de cascarita: crear pool -> N jugadores -> sorteo -> resultado.
-- Invariante central: ganan EXACTAMENTE los boletos cuyo marcador asignado == resultado,
-- cada uno con 1 punto; el resto 0. Verifica repetible/único, rangos y cuadrícula llena.
\set ON_ERROR_STOP on

do $$
declare
  v_org      uuid := gen_random_uuid();
  v_players  uuid[] := '{}';
  v_n        int;
  v_pool     uuid;
  v_item     uuid;
  v_unique   boolean;
  rh int; ra int; v_result jsonb;
  v_expected int; v_winners int; v_distinct int; v_tickets int; v_bad int;
  i int; iter int;
  v_pass int := 0;
begin
  insert into auth.users(id, email, aud, role)
    values (v_org, 'org@sim.com', 'authenticated', 'authenticated');
  for i in 1..30 loop
    v_players[i] := gen_random_uuid();
    insert into auth.users(id, email, aud, role)
      values (v_players[i], 'p' || i || '@sim.com', 'authenticated', 'authenticated');
  end loop;

  -- Todas las operaciones de organizador corren con este jwt.
  perform set_config('request.jwt.claim.sub', v_org::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_org, 'role', 'authenticated')::text, true);

  for iter in 1..100 loop
    v_unique := (iter % 2 = 0);
    if v_unique then v_n := 2 + (random() * 14)::int;   -- 2..16 (cuadrícula = 16)
    else            v_n := 2 + (random() * 28)::int;    -- 2..30
    end if;

    v_pool := (create_pool('random_scoreline', 'sim ' || iter, 10000, 'MXN', 2,
       jsonb_build_object('max_goals', 3, 'unique', v_unique,
         'scoring', jsonb_build_object('exact_points', 1, 'result_points', 0)),
       jsonb_build_array(jsonb_build_object('lock_at', '2999-01-01T00:00:00Z',
         'payload', jsonb_build_object('home', 'MEX', 'away', 'CHE')))
     ) ->> 'id')::uuid;
    select id into v_item from pool_items where pool_id = v_pool;

    for i in 1..v_n loop
      insert into tickets(pool_id, user_id, ticket_number, paid)
        values (v_pool, v_players[i], 1, (random() < 0.7));
    end loop;

    perform assign_random_scorelines(v_pool);          -- el sorteo

    rh := (random() * 3)::int; ra := (random() * 3)::int;
    v_result := jsonb_build_object('home', rh, 'away', ra);
    perform set_item_result(v_item, v_result);         -- dispara el recálculo

    -- (1) ganadores == predicciones iguales al resultado
    select count(*) into v_expected
      from predictions pr join tickets t on t.id = pr.ticket_id
      where t.pool_id = v_pool
        and (pr.payload->>'home')::int = rh and (pr.payload->>'away')::int = ra;
    select count(*) into v_winners
      from item_scores s join tickets t on t.id = s.ticket_id
      where t.pool_id = v_pool and s.tier = 'exact';
    if v_winners <> v_expected then
      raise exception 'iter %: ganadores(%) != esperados(%) [%-%]', iter, v_winners, v_expected, rh, ra;
    end if;

    -- (2) puntos consistentes: exact=>1, lo demás=>0, nunca otro valor
    select count(*) into v_bad
      from item_scores s join tickets t on t.id = s.ticket_id
      where t.pool_id = v_pool
        and (s.points not in (0,1)
             or (s.tier = 'exact' and s.points <> 1)
             or (s.tier <> 'exact' and s.points <> 0));
    if v_bad > 0 then raise exception 'iter %: % filas de puntaje inconsistentes', iter, v_bad; end if;

    -- (3) un puntaje por boleto
    select count(*) into v_tickets from tickets where pool_id = v_pool;
    if (select count(*) from item_scores s join tickets t on t.id = s.ticket_id where t.pool_id = v_pool) <> v_tickets then
      raise exception 'iter %: filas de puntaje != boletos (%)', iter, v_tickets;
    end if;

    -- (4) modo único => marcadores distintos
    if v_unique then
      select count(distinct pr.payload::text) into v_distinct
        from predictions pr join tickets t on t.id = pr.ticket_id where t.pool_id = v_pool;
      if v_distinct <> v_tickets then
        raise exception 'iter %: único pero % distintos de % boletos', iter, v_distinct, v_tickets;
      end if;
    end if;

    v_pass := v_pass + 1;
    if iter <= 4 or (v_winners > 0 and iter % 17 = 0) then
      raise notice 'sim % | N=% unique=% | resultado %-% | GANADORES=%', iter, v_n, v_unique, rh, ra, v_winners;
    end if;
  end loop;

  -- Edge: único con 16 jugadores (cuadrícula completa) => SIEMPRE exactamente 1 ganador
  declare e_pool uuid; e_item uuid; w int;
  begin
    e_pool := (create_pool('random_scoreline', 'edge-full-grid', 10000, 'MXN', 2,
      jsonb_build_object('max_goals', 3, 'unique', true,
        'scoring', jsonb_build_object('exact_points', 1, 'result_points', 0)),
      jsonb_build_array(jsonb_build_object('lock_at', '2999-01-01T00:00:00Z',
        'payload', jsonb_build_object('home', 'MEX', 'away', 'CHE')))) ->> 'id')::uuid;
    select id into e_item from pool_items where pool_id = e_pool;
    for i in 1..16 loop
      insert into tickets(pool_id, user_id, ticket_number) values (e_pool, v_players[i], 1);
    end loop;
    perform assign_random_scorelines(e_pool);
    perform set_item_result(e_item, jsonb_build_object('home', 2, 'away', 2));
    select count(*) into w from item_scores s join tickets t on t.id = s.ticket_id
      where t.pool_id = e_pool and s.tier = 'exact';
    if w <> 1 then raise exception 'edge cuadrícula llena: esperaba 1 ganador, hubo %', w; end if;
    raise notice 'OK edge: único + 16 jugadores (cuadrícula completa) => exactamente 1 ganador';
  end;

  raise notice '✅ % / 100 simulaciones OK + edge (cuadrícula llena)', v_pass;
end $$;
