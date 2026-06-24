-- Test de humo end-to-end del backend (correr contra un Postgres de Supabase).
--   psql ... -f supabase/tests/smoke_test.sql
-- Un run limpio que imprime "TODOS LOS ASSERTS PASARON" = backend OK.
-- Nota: setea request.jwt.claim.sub (forma vieja) y request.jwt.claims (json)
-- para que auth.uid() funcione en cualquier versión de la imagen.
\set ON_ERROR_STOP on

do $$
declare
  alice uuid := '00000000-0000-0000-0000-00000000000a';
  bob   uuid := '00000000-0000-0000-0000-00000000000b';
  r jsonb; v_pool uuid; v_code text;
  it1 uuid; it2 uuid; t_alice uuid; t_bob uuid;
  lb record; v_pts int;
begin
  -- ---- Setup: dos usuarios (el trigger crea sus profiles) ----
  insert into auth.users (id, email, aud, role)
  values (alice, 'alice@test.com', 'authenticated', 'authenticated'),
         (bob,   'bob@test.com',   'authenticated', 'authenticated')
  on conflict (id) do nothing;

  -- ---- Alice crea una quiniela con 2 partidos (kickoff lejano) ----
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  r := create_pool('football_exact_score', 'Mundial Test', 5000, 'MXN', 2,
        '{"max_goals":3,"scoring":{"exact_points":3,"result_points":1}}'::jsonb,
        '[{"lock_at":"2999-01-01T00:00:00Z","payload":{"home":"MEX","away":"ARG"}},
          {"lock_at":"2999-01-01T00:00:00Z","payload":{"home":"BRA","away":"GER"}}]'::jsonb);
  v_pool := (r ->> 'id')::uuid;
  v_code := r ->> 'join_code';
  raise notice 'pool=%  code=%', v_pool, v_code;

  select id into it1 from pool_items where pool_id = v_pool and item_index = 1;
  select id into it2 from pool_items where pool_id = v_pool and item_index = 2;

  -- La organizadora también quiere jugar: compra su boleto (pertenencia por boleto).
  perform buy_ticket(v_pool);
  select id into t_alice from tickets where pool_id = v_pool and user_id = alice;

  -- Alice predice: it1 = 2-1 (será exacto), it2 = 0-0 (será miss)
  insert into predictions (ticket_id, pool_item_id, payload) values
    (t_alice, it1, '{"home":2,"away":1}'::jsonb),
    (t_alice, it2, '{"home":0,"away":0}'::jsonb);

  -- ---- Bob se une por código y predice ----
  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform join_pool(v_code);
  perform buy_ticket(v_pool);   -- buyflow: unirse da pertenencia, el boleto se compra aparte
  select id into t_bob from tickets where pool_id = v_pool and user_id = bob;
  insert into predictions (ticket_id, pool_item_id, payload) values
    (t_bob, it1, '{"home":1,"away":0}'::jsonb),   -- mismo ganador (no exacto) -> result
    (t_bob, it2, '{"home":3,"away":1}'::jsonb);   -- será exacto

  -- ---- Alice (organizadora) captura resultados ----
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform set_item_result(it1, '{"home":2,"away":1}'::jsonb);
  perform set_item_result(it2, '{"home":3,"away":1}'::jsonb);

  for lb in select * from get_leaderboard(v_pool) order by rank loop
    raise notice 'rank=% name=% pts=% exact=% result=% made=% paid=%',
      lb.rank, lb.display_name, lb.total_points, lb.exact_hits, lb.result_hits,
      lb.predictions_made, lb.paid;
  end loop;

  -- ---- Asserts de puntaje ----
  -- Alice: it1 exacto(3) + it2 miss(0) = 3 ; Bob: it1 result(1) + it2 exacto(3) = 4
  select total_points into v_pts from get_leaderboard(v_pool) where user_id = alice;
  if v_pts <> 3 then raise exception 'FALLO: Alice debe tener 3 pts (tiene %)', v_pts; end if;
  select total_points into v_pts from get_leaderboard(v_pool) where user_id = bob;
  if v_pts <> 4 then raise exception 'FALLO: Bob debe tener 4 pts (tiene %)', v_pts; end if;

  -- ---- Bob no puede capturar resultados (no es organizador) ----
  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  begin
    perform set_item_result(it1, '{"home":9,"away":9}'::jsonb);
    raise exception 'FALLO: Bob no debería capturar resultados';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    raise notice 'OK seguridad: Bob bloqueado al capturar resultado (%)', sqlerrm;
  end;

  -- ---- Bob no puede auto-marcarse pagado ----
  begin
    perform set_ticket_paid(t_bob, true);
    raise exception 'FALLO: Bob no debería marcarse pagado';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    raise notice 'OK seguridad: Bob bloqueado al marcar pago (%)', sqlerrm;
  end;

  -- ---- Config de puntos bloqueada tras el primer resultado ----
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  begin
    update pools set config = jsonb_set(config, '{scoring,exact_points}', '5'::jsonb)
      where id = v_pool;
    raise exception 'FALLO: no debería permitir cambiar puntos tras resultados';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    raise notice 'OK seguridad: config de puntos bloqueada (%)', sqlerrm;
  end;

  -- ---- Tope de boletos: 3er boleto de Bob debe fallar (max=2) ----
  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform buy_ticket(v_pool);  -- 2do boleto OK (ya tiene 1 del join)
  begin
    perform buy_ticket(v_pool); -- 3ro debe fallar
    raise exception 'FALLO: no debería permitir un 3er boleto (max 2)';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    raise notice 'OK regla: tope de boletos respetado (%)', sqlerrm;
  end;

  raise notice '✅ TODOS LOS ASSERTS PASARON';
end $$;
