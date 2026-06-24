-- Permite ver la vista previa de un pool por código SIN sesión (rol anon),
-- para que un invitado vea el título/precio antes de entrar (anónimo).
grant execute on function public.get_pool_preview(text) to anon;
