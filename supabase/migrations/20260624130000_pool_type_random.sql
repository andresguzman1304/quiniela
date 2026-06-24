-- =============================================================================
-- Nuevo tipo de pool: cascarita de marcador aleatorio.
-- (ALTER TYPE ... ADD VALUE va en su propia migración: el valor nuevo no se
--  puede usar en la misma transacción donde se agrega.)
-- =============================================================================
alter type public.pool_type add value if not exists 'random_scoreline';
