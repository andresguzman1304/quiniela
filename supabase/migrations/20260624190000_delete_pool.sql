-- =============================================================================
-- Borrar una quiniela "no iniciada" (solo el organizador, antes de que inicie
-- el primer partido). El borrado cascada elimina partidos, boletos, predicciones,
-- puntajes y membresías.
-- =============================================================================

create or replace function public.delete_pool(p_pool uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_locked boolean;
begin
  if not app.is_organizer(p_pool) then raise exception 'No autorizado'; end if;

  select exists (
    select 1 from public.pool_items where pool_id = p_pool and now() >= lock_at
  ) into v_locked;
  if v_locked then
    raise exception 'La quiniela ya inició: no se puede borrar';
  end if;

  delete from public.pools where id = p_pool;
end;
$$;

grant execute on function public.delete_pool(uuid) to authenticated;

-- Endurece la política de borrado directo: el organizador solo puede borrar
-- mientras ningún partido haya iniciado (cierra el camino fuera del RPC).
drop policy if exists pools_delete_organizer on public.pools;
create policy pools_delete_organizer on public.pools
  for delete to authenticated
  using (
    organizer_id = (select auth.uid())
    and not exists (
      select 1 from public.pool_items pi
      where pi.pool_id = id and now() >= pi.lock_at
    )
  );
