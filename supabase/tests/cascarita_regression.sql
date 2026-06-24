-- Regresión: cierra los huecos que halló la revisión adversarial.
\set ON_ERROR_STOP on

do $$
declare
  org uuid := gen_random_uuid();
  players uuid[] := '{}';
  i int; v_pool uuid; v_item uuid; w int; v_exp int; v_bad int;
begin
  insert into auth.users(id,email,aud,role) values (org,'org@reg.com','authenticated','authenticated');
  for i in 1..20 loop
    players[i] := gen_random_uuid();
    insert into auth.users(id,email,aud,role) values (players[i],'r'||i||'@reg.com','authenticated','authenticated');
  end loop;
  perform set_config('request.jwt.claim.sub', org::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub',org,'role','authenticated')::text, true);

  -- ===== FIX(1): re-sorteo tras resultado recalcula, sin puntajes huérfanos =====
  v_pool := (create_pool('random_scoreline','reg redraw',10000,'MXN',2,
     '{"max_goals":3,"unique":false,"scoring":{"exact_points":1,"result_points":0}}'::jsonb,
     '[{"lock_at":"2999-01-01T00:00:00Z","payload":{"home":"MEX","away":"CHE"}}]'::jsonb) ->> 'id')::uuid;
  select id into v_item from pool_items where pool_id=v_pool;
  for i in 1..12 loop insert into tickets(pool_id,user_id,ticket_number) values (v_pool,players[i],1); end loop;
  perform assign_random_scorelines(v_pool);
  perform set_item_result(v_item, '{"home":1,"away":1}'::jsonb);
  perform assign_random_scorelines(v_pool);                    -- RE-SORTEO
  select count(*) into v_bad from item_scores s join tickets t on t.id=s.ticket_id
     where t.pool_id=v_pool and not exists (
       select 1 from predictions pr where pr.ticket_id=s.ticket_id and pr.pool_item_id=s.pool_item_id);
  if v_bad>0 then raise exception 'FIX1 FALLO: % puntajes huérfanos tras re-sorteo', v_bad; end if;
  select count(*) into v_exp from predictions pr join tickets t on t.id=pr.ticket_id
     where t.pool_id=v_pool and pr.payload='{"home":1,"away":1}'::jsonb;
  select count(*) into w from item_scores s join tickets t on t.id=s.ticket_id where t.pool_id=v_pool and s.tier='exact';
  if w<>v_exp then raise exception 'FIX1 FALLO: ganadores(%) != esperados(%) tras re-sorteo', w, v_exp; end if;
  if (select count(*) from item_scores s join tickets t on t.id=s.ticket_id where t.pool_id=v_pool)<>12 then
    raise exception 'FIX1 FALLO: filas de puntaje != 12 tras re-sorteo'; end if;
  raise notice 'OK FIX1: re-sorteo recalcula (sin puntajes huérfanos)';

  -- ===== FIX(2): boleto SIN perfil aparece en get_leaderboard =====
  declare noprof uuid := gen_random_uuid(); lp_pool uuid; cnt int;
  begin
    insert into auth.users(id,email,aud,role) values (noprof,'noprof@reg.com','authenticated','authenticated');
    delete from profiles where id=noprof;                      -- caso sin perfil
    lp_pool := (create_pool('random_scoreline','reg noprofile',10000,'MXN',2,
       '{"max_goals":3,"unique":false,"scoring":{"exact_points":1,"result_points":0}}'::jsonb,
       '[{"lock_at":"2999-01-01T00:00:00Z","payload":{"home":"MEX","away":"CHE"}}]'::jsonb) ->> 'id')::uuid;
    insert into tickets(pool_id,user_id,ticket_number) values (lp_pool, noprof, 1);
    insert into tickets(pool_id,user_id,ticket_number) values (lp_pool, players[1], 1);
    perform assign_random_scorelines(lp_pool);
    select count(*) into cnt from get_leaderboard(lp_pool) where user_id=noprof;
    if cnt<>1 then raise exception 'FIX2 FALLO: boleto sin perfil no aparece en el leaderboard'; end if;
    select count(*) into cnt from get_leaderboard(lp_pool);
    if cnt<>2 then raise exception 'FIX2 FALLO: leaderboard tiene % filas, esperaba 2', cnt; end if;
    raise notice 'OK FIX2: boleto sin perfil aparece (nombre por defecto)';
  end;

  -- ===== Fútbol: rama 1X2 (result_points>0) observable, fila por fila =====
  declare f_pool uuid; f_item uuid; r_h int:=2; r_a int:=1;
          e_exact int; e_result int; e_miss int; a_exact int; a_result int; a_miss int;
  begin
    f_pool := (create_pool('football_exact_score','reg futbol',5000,'MXN',2,
       '{"max_goals":3,"scoring":{"exact_points":3,"result_points":1}}'::jsonb,
       '[{"lock_at":"2999-01-01T00:00:00Z","payload":{"home":"MEX","away":"CHE"}}]'::jsonb) ->> 'id')::uuid;
    select id into f_item from pool_items where pool_id=f_pool;
    for i in 1..12 loop
      insert into tickets(pool_id,user_id,ticket_number) values (f_pool,players[i],1);
      insert into predictions(ticket_id,pool_item_id,payload) values (
        (select id from tickets where pool_id=f_pool and user_id=players[i] limit 1), f_item,
        jsonb_build_object('home',(random()*3)::int,'away',(random()*3)::int));
    end loop;
    perform set_item_result(f_item, jsonb_build_object('home',r_h,'away',r_a));
    select count(*) into e_exact from predictions pr join tickets t on t.id=pr.ticket_id where t.pool_id=f_pool
       and (pr.payload->>'home')::int=r_h and (pr.payload->>'away')::int=r_a;
    select count(*) into e_result from predictions pr join tickets t on t.id=pr.ticket_id where t.pool_id=f_pool
       and not ((pr.payload->>'home')::int=r_h and (pr.payload->>'away')::int=r_a)
       and sign((pr.payload->>'home')::int-(pr.payload->>'away')::int)=sign(r_h-r_a);
    select count(*) into e_miss from predictions pr join tickets t on t.id=pr.ticket_id where t.pool_id=f_pool
       and not ((pr.payload->>'home')::int=r_h and (pr.payload->>'away')::int=r_a)
       and sign((pr.payload->>'home')::int-(pr.payload->>'away')::int)<>sign(r_h-r_a);
    select count(*) into a_exact  from item_scores s join tickets t on t.id=s.ticket_id where t.pool_id=f_pool and s.tier='exact';
    select count(*) into a_result from item_scores s join tickets t on t.id=s.ticket_id where t.pool_id=f_pool and s.tier='result';
    select count(*) into a_miss   from item_scores s join tickets t on t.id=s.ticket_id where t.pool_id=f_pool and s.tier='miss';
    if a_exact<>e_exact or a_result<>e_result or a_miss<>e_miss then
      raise exception 'FUTBOL FALLO: tiers exact(%/%) result(%/%) miss(%/%)',a_exact,e_exact,a_result,e_result,a_miss,e_miss; end if;
    select count(*) into v_bad from item_scores s join tickets t on t.id=s.ticket_id where t.pool_id=f_pool
       and not ((s.tier='exact' and s.points=3) or (s.tier='result' and s.points=1) or (s.tier='miss' and s.points=0));
    if v_bad>0 then raise exception 'FUTBOL FALLO: % filas con puntos incorrectos por tier', v_bad; end if;
    raise notice 'OK fútbol 1X2: exact=% result=% miss=% (puntos 3/1/0 correctos)', a_exact, a_result, a_miss;
  end;

  -- ===== Ciclo de resultado: R1 -> R2 -> NULL =====
  declare c_pool uuid; c_item uuid; cnt int;
  begin
    c_pool := (create_pool('random_scoreline','reg lifecycle',10000,'MXN',2,
       '{"max_goals":3,"unique":false,"scoring":{"exact_points":1,"result_points":0}}'::jsonb,
       '[{"lock_at":"2999-01-01T00:00:00Z","payload":{"home":"MEX","away":"CHE"}}]'::jsonb) ->> 'id')::uuid;
    select id into c_item from pool_items where pool_id=c_pool;
    for i in 1..10 loop insert into tickets(pool_id,user_id,ticket_number) values (c_pool,players[i],1); end loop;
    perform assign_random_scorelines(c_pool);
    perform set_item_result(c_item, '{"home":1,"away":0}'::jsonb);
    select count(*) into cnt from item_scores s join tickets t on t.id=s.ticket_id where t.pool_id=c_pool;
    if cnt<>10 then raise exception 'LIFECYCLE FALLO R1: % filas != 10', cnt; end if;
    perform set_item_result(c_item, '{"home":3,"away":3}'::jsonb);
    select count(*) into cnt from item_scores s join tickets t on t.id=s.ticket_id where t.pool_id=c_pool;
    if cnt<>10 then raise exception 'LIFECYCLE FALLO R2: % != 10 (recompute incompleto)', cnt; end if;
    perform set_item_result(c_item, null);
    select count(*) into cnt from item_scores s join tickets t on t.id=s.ticket_id where t.pool_id=c_pool;
    if cnt<>0 then raise exception 'LIFECYCLE FALLO NULL: % != 0 (no se limpió)', cnt; end if;
    raise notice 'OK ciclo de resultado: R1->R2->NULL recalcula/limpia';
  end;

  -- ===== Único con más boletos que la cuadrícula => RAISE + rollback =====
  declare o_pool uuid; raised boolean := false;
  begin
    o_pool := (create_pool('random_scoreline','reg overflow',10000,'MXN',2,
       '{"max_goals":3,"unique":true,"scoring":{"exact_points":1,"result_points":0}}'::jsonb,
       '[{"lock_at":"2999-01-01T00:00:00Z","payload":{"home":"MEX","away":"CHE"}}]'::jsonb) ->> 'id')::uuid;
    for i in 1..17 loop insert into tickets(pool_id,user_id,ticket_number) values (o_pool,players[i],1); end loop;
    begin
      perform assign_random_scorelines(o_pool);
    exception when others then raised := true;
    end;
    if not raised then raise exception 'OVERFLOW FALLO: 17 únicos en cuadrícula de 16 no lanzó error'; end if;
    if (select count(*) from predictions pr join tickets t on t.id=pr.ticket_id where t.pool_id=o_pool)<>0 then
      raise exception 'OVERFLOW FALLO: dejó predicciones parciales (sin rollback)'; end if;
    raise notice 'OK único overflow: 17>16 lanza error y no inserta parcial';
  end;

  raise notice '✅ REGRESIÓN OK: fixes + 1X2 fútbol + ciclo + overflow';
end $$;
