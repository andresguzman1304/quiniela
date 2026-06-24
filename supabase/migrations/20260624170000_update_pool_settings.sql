-- =============================================================================
-- Editar la configuración de una quiniela ya creada (solo el organizador).
-- Permite ajustar título, precio, máx. boletos/números por persona y el config
-- (p. ej. el tope de goles de una cascarita) después de crearla.
-- =============================================================================

create or replace function public.update_pool_settings(
  p_pool        uuid,
  p_title       text  default null,
  p_price_cents int   default null,
  p_max_tickets int   default null,
  p_config      jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_type public.pool_type;
begin
  select type into v_type from public.pools where id = p_pool;
  if v_type is null then raise exception 'Quiniela no encontrada'; end if;
  if not app.is_organizer(p_pool) then raise exception 'No autorizado'; end if;

  if p_max_tickets is not null and p_max_tickets < 1 then
    raise exception 'El máximo por persona debe ser al menos 1';
  end if;

  if p_config is not null then
    perform app.validate_pool_config(v_type, p_config);
  end if;

  update public.pools
     set title                = coalesce(nullif(btrim(p_title), ''), title),
         price_cents          = coalesce(p_price_cents, price_cents),
         max_tickets_per_user = coalesce(p_max_tickets, max_tickets_per_user),
         config               = coalesce(p_config, config)
   where id = p_pool;
end;
$$;

grant execute on function public.update_pool_settings(uuid, text, int, int, jsonb) to authenticated;
