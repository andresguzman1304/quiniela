-- =============================================================================
-- Fase 0 — Cimientos: schema `app`, tabla `profiles` y auto-creación de perfil.
-- =============================================================================

-- Schema privado para helpers SECURITY DEFINER. NO se expone vía PostgREST
-- (no está en la lista de "exposed schemas"), así que el cliente no puede
-- llamar estas funciones directo; solo se usan dentro de políticas y RPCs.
create schema if not exists app;
grant usage on schema app to authenticated;

-- Perfil público (1:1 con auth.users). El display_name es lo que se ve en el
-- leaderboard; por eso es legible por cualquier usuario autenticado.
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) > 0),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Crea el perfil automáticamente al registrarse. display_name temporal = parte
-- local del email; el onboarding del front permite cambiarlo.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, 'usuario'), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
