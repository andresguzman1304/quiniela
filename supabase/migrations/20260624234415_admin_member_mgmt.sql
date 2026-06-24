-- =============================================================================
-- Gestión de jugadores por el organizador:
--   1. get_members      → lista TODOS los miembros (incl. los que aún no compran
--                          número), con su nombre y cuántos números tienen. Sirve
--                          para detectar duplicados "fantasma" (p. ej. una persona
--                          mayor que entró 3 veces creando usuarios anónimos).
--   2. admin_rename_member → corrige el nombre de un jugador (p. ej. alguien que
--                          tecleó el código en vez de su nombre). Permitido siempre.
--   3. admin_remove_member → saca por completo a un jugador de la quiniela (borra
--                          sus números y su membresía). Solo antes de que inicie
--                          ningún partido, para no romper el marcador.
-- Todo es solo-organizador y pasa por app.is_organizer.
-- =============================================================================

-- (1) Lista de miembros para el panel del organizador.
create or replace function public.get_members(p_pool uuid)
returns table (
  user_id      uuid,
  display_name text,
  ticket_count int,
  is_organizer boolean,
  joined_at    timestamptz
)
language plpgsql
security definer
stable
set search_path = public, app
as $$
begin
  if not app.is_organizer(p_pool) then raise exception 'No autorizado'; end if;

  return query
  select
    m.user_id,
    coalesce(pf.display_name, 'Jugador')                          as display_name,
    (select count(*)::int from public.tickets t
       where t.pool_id = p_pool and t.user_id = m.user_id)        as ticket_count,
    (p.organizer_id = m.user_id)                                  as is_organizer,
    m.joined_at
  from public.pool_members m
  join public.pools p on p.id = m.pool_id
  left join public.profiles pf on pf.id = m.user_id
  where m.pool_id = p_pool
  order by (p.organizer_id = m.user_id) desc, m.joined_at;
end;
$$;

-- (2) Renombrar a un jugador (corrige errores de captura). Permitido en todo momento.
create or replace function public.admin_rename_member(p_pool uuid, p_user uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if not app.is_organizer(p_pool) then raise exception 'No autorizado'; end if;
  if v_name = '' then raise exception 'El nombre no puede ir vacío'; end if;

  -- Solo si el usuario es miembro de ESTA quiniela (no toca perfiles ajenos).
  if not exists (
    select 1 from public.pool_members where pool_id = p_pool and user_id = p_user
  ) then
    raise exception 'Ese jugador no está en la quiniela';
  end if;

  insert into public.profiles (id, display_name)
  values (p_user, v_name)
  on conflict (id) do update set display_name = excluded.display_name;
end;
$$;

-- (3) Quitar a un jugador por completo. Solo antes de que inicie algún partido.
create or replace function public.admin_remove_member(p_pool uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_locked boolean;
  v_owner  uuid;
begin
  if not app.is_organizer(p_pool) then raise exception 'No autorizado'; end if;

  select organizer_id into v_owner from public.pools where id = p_pool;
  if v_owner = p_user then
    raise exception 'No puedes sacarte a ti mismo (organizador)';
  end if;

  select exists (
    select 1 from public.pool_items where pool_id = p_pool and now() >= lock_at
  ) into v_locked;
  if v_locked then
    raise exception 'La quiniela ya inició: no se puede sacar a un jugador';
  end if;

  -- Borra sus números (cascada elimina predicciones y puntajes) y su membresía.
  delete from public.tickets      where pool_id = p_pool and user_id = p_user;
  delete from public.pool_members where pool_id = p_pool and user_id = p_user;
end;
$$;

grant execute on function public.get_members(uuid)                  to authenticated;
grant execute on function public.admin_rename_member(uuid, uuid, text) to authenticated;
grant execute on function public.admin_remove_member(uuid, uuid)    to authenticated;
