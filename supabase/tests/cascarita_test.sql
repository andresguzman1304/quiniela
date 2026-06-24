-- Test de la modalidad cascarita (random_scoreline). Correr contra Postgres de Supabase.
\set ON_ERROR_STOP on

do $$
declare
  org uuid := '00000000-0000-0000-0000-0000000000c1';
  p1  uuid := '00000000-0000-0000-0000-0000000000c2';
  p2  uuid := '00000000-0000-0000-0000-0000000000c3';
  r jsonb; v_pool uuid; v_item uuid; n int; v_cnt int; v_res jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (org, 'org@t.com', 'authenticated', 'authenticated'),
    (p1,  'p1@t.com',  'authenticated', 'authenticated'),
    (p2,  'p2@t.com',  'authenticated', 'authenticated')
  on conflict (id) do nothing;

  -- Org crea cascarita REPETIBLE, 1 partido, tope 3, scoring exacto=1/result=0
  perform set_config('request.jwt.claim.sub', org::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', org, 'role', 'authenticated')::text, true);
  r := create_pool('random_scoreline', 'Cascarita MEX', 10000, 'MXN', 2,
       '{"max_goals":3,"unique":false,"scoring":{"exact_points":1,"result_points":0}}'::jsonb,
       '[{"lock_at":"2999-01-01T00:00:00Z","payload":{"home":"México","away":"Chequia"}}]'::jsonb);
  v_pool := (r ->> 'id')::uuid;
  select id into v_item from pool_items where pool_id = v_pool;

  perform buy_ticket(v_pool);                  -- org compra su número
  perform set_config('request.jwt.claim.sub', p1::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  perform join_pool((select join_code from pools where id = v_pool));
  perform buy_ticket(v_pool);                  -- p1 compra su número
  perform set_config('request.jwt.claim.sub', p2::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p2, 'role', 'authenticated')::text, true);
  perform join_pool((select join_code from pools where id = v_pool));
  perform buy_ticket(v_pool);                  -- p2 compra su número

  -- Antes del sorteo: sin marcadores
  select count(*) into n from predictions pr join tickets t on t.id = pr.ticket_id where t.pool_id = v_pool;
  if n <> 0 then raise exception 'FALLO: no debería haber marcadores antes del sorteo (hay %)', n; end if;

  -- Participante NO puede auto-asignarse marcador
  begin
    insert into predictions (ticket_id, pool_item_id, payload)
    values ((select id from tickets where pool_id = v_pool and user_id = p2 limit 1), v_item, '{"home":3,"away":3}'::jsonb);
    raise exception 'FALLO: participante no debería fijar su marcador';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    raise notice 'OK: participante bloqueado de editar marcador (%)', sqlerrm;
  end;

  -- Sorteo (solo organizador)
  perform set_config('request.jwt.claim.sub', org::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', org, 'role', 'authenticated')::text, true);
  v_cnt := assign_random_scorelines(v_pool);
  if v_cnt <> 3 then raise exception 'FALLO: el sorteo debería asignar 3 marcadores (asignó %)', v_cnt; end if;
  raise notice 'OK: sorteo asignó % marcadores', v_cnt;

  perform 1 from predictions pr join tickets t on t.id = pr.ticket_id
   where t.pool_id = v_pool
     and ((pr.payload ->> 'home')::int not between 0 and 3 or (pr.payload ->> 'away')::int not between 0 and 3);
  if found then raise exception 'FALLO: marcador asignado fuera de rango 0..3'; end if;

  -- El resultado = marcador de p1 -> p1 gana 1 punto
  select pr.payload into v_res from predictions pr join tickets t on t.id = pr.ticket_id
   where t.pool_id = v_pool and t.user_id = p1 limit 1;
  perform set_item_result(v_item, v_res);
  perform 1 from get_leaderboard(v_pool) where user_id = p1 and total_points = 1;
  if not found then raise exception 'FALLO: p1 debería tener 1 punto (su marcador fue el resultado)'; end if;
  raise notice 'OK: el del marcador ganador recibe 1 punto';

  -- ===== Modo ÚNICO: marcadores distintos =====
  declare u_pool uuid; u_r jsonb; d int;
  begin
    u_r := create_pool('random_scoreline', 'Cascarita única', 10000, 'MXN', 2,
      '{"max_goals":3,"unique":true,"scoring":{"exact_points":1,"result_points":0}}'::jsonb,
      '[{"lock_at":"2999-01-01T00:00:00Z","payload":{"home":"A","away":"B"}}]'::jsonb);
    u_pool := (u_r ->> 'id')::uuid;
    perform buy_ticket(u_pool);
    perform set_config('request.jwt.claim.sub', p1::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
    perform join_pool((select join_code from pools where id = u_pool));
    perform buy_ticket(u_pool);
    perform set_config('request.jwt.claim.sub', p2::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p2, 'role', 'authenticated')::text, true);
    perform join_pool((select join_code from pools where id = u_pool));
    perform buy_ticket(u_pool);
    perform set_config('request.jwt.claim.sub', org::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', org, 'role', 'authenticated')::text, true);
    perform assign_random_scorelines(u_pool);
    select count(distinct pr.payload::text) into d
      from predictions pr join tickets t on t.id = pr.ticket_id where t.pool_id = u_pool;
    if d <> 3 then raise exception 'FALLO: modo único debería dar 3 marcadores distintos (dio %)', d; end if;
    raise notice 'OK: modo único asignó 3 marcadores distintos';
  end;

  raise notice '✅ CASCARITA: TODOS LOS ASSERTS PASARON';
end $$;
