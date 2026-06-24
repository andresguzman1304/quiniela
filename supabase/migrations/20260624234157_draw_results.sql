-- =============================================================================
-- Vista del sorteo para el organizador: por número (boleto) y partido, el
-- marcador que le tocó. SECURITY DEFINER porque la política predictions_select
-- oculta los marcadores ajenos hasta que el partido inicia (lock); aquí el
-- organizador necesita revisar cómo quedó el sorteo completo antes del partido.
-- =============================================================================

create or replace function public.get_draw_results(p_pool uuid)
returns table (
  ticket_id     uuid,
  ticket_number int,
  display_name  text,
  paid          boolean,
  pool_item_id  uuid,
  item_index    int,
  item_payload  jsonb,
  payload       jsonb
)
language plpgsql
security definer
stable
set search_path = public, app
as $$
begin
  if not app.is_organizer(p_pool) then raise exception 'No autorizado'; end if;

  return query
  select t.id, t.ticket_number, coalesce(pf.display_name, 'Jugador'), t.paid,
         pi.id, pi.item_index, pi.payload, pr.payload
  from public.tickets t
  left join public.profiles pf on pf.id = t.user_id
  join public.predictions pr on pr.ticket_id = t.id
  join public.pool_items pi on pi.id = pr.pool_item_id
  where t.pool_id = p_pool
  order by t.ticket_number, pi.item_index;
end;
$$;

grant execute on function public.get_draw_results(uuid) to authenticated;
