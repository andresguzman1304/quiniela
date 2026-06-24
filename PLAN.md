# Quinielas — Plan de implementación integrado (MVP fútbol sobre core genérico)

## 1. Visión y alcance del MVP

**Quinielas** es una app web para **crear** y **unirse** a pools de predicción deportiva. El primer producto que se lanza es **fútbol** (predecir el marcador exacto), pero la arquitectura se construye sobre un **core genérico de "pool de ítems a predecir"** para que un segundo tipo (p. ej. *predecir el lineup de Coachella 2027*) se sume después **sin reescribir el core**.

**Dentro del alcance (MVP):**
- Auth con magic link (sin contraseñas) + perfil con `display_name`.
- Crear quiniela de fútbol: partidos (local vs visitante + hora), tope de goles, puntos por acierto, precio por boleto, máximo de boletos por persona.
- Unirse con **código de invitación** y comprar 1–N boletos (N configurable).
- Predicción de marcador exacto por partido; **bloqueo al kickoff** (servidor).
- Organizador: marca pagos manualmente, captura resultados manualmente.
- Puntuación y leaderboard recalculados en Postgres al guardar un resultado.
- Vista de pool: standings, bote, quién pagó / quién no, quién no llenó predicciones.

**Fuera del alcance (diferido explícitamente):** pasarela de pagos, notificaciones (email/push), payout automático en empates, app móvil nativa, versionado de payloads JSON. Coachella **se diseña ahora, no se construye**.

> **Nota de proceso:** este plan se generó con un workflow multiagente. 4 de 5 diseñadores en paralelo se cayeron por errores de red transitorios; el agente crítico lo detectó y forzó al sintetizador a **autorar las cuatro áreas faltantes** (RLS, auth+perfiles+join, frontend, validadores de tipo) sobre el esquema canónico del diseñador de scoring que sí completó. También se **recortó** la sobre-ingeniería señalada.

---

## 2. Arquitectura general

Cliente React (SPA) → Supabase (Postgres + Auth + RLS + RPCs PL/pgSQL). **Sin Edge Functions, sin backend propio.** La puntuación vive en Postgres porque los únicos insumos son enteros ya en la BD (predicción vs resultado): no hay llamadas externas que justifiquen una Edge Function.

```
┌─────────────────────────────────────────┐
│  React SPA (Vite + TS)                    │
│  supabase-js  ── Auth (magic link)        │
│               ── PostgREST (CRUD + RLS)   │
│               ── RPC: join_pool,          │
│                       buy_ticket,         │
│                       set_ticket_paid,    │
│                       set_item_result     │
└───────────────┬───────────────────────────┘
                │  JWT (auth.uid())
┌───────────────▼───────────────────────────┐
│  Supabase Postgres                          │
│  Tablas: profiles, pools, pool_items,       │
│          tickets, predictions, item_scores  │
│  RLS en todas las tablas expuestas          │
│  Trigger: result write → recompute_item()   │
│  Dispatcher: score_prediction(type,...)     │
│  Vistas (security_invoker): leaderboard,    │
│          pool_stats                          │
└─────────────────────────────────────────────┘
```

**Reglas de seguridad transversales:**
- RLS **habilitado en todas** las tablas del schema `public`.
- En políticas usar siempre `(select auth.uid())` (se evalúa una vez por query, no por fila).
- Toda política con `to authenticated` para cortar `anon` antes de evaluar.
- Chequeos de pertenencia/organizador vía **funciones `SECURITY DEFINER` en un schema NO expuesto** (`app`).
- Vistas creadas con `security_invoker = true` para que respeten RLS de las tablas base.

---

## 3. Modelo de datos

Lo específico de fútbol vive **solo** dentro de columnas `jsonb` (`payload`, `result`, `config`). El core nunca tiene columnas de fútbol. Dinero en **enteros (centavos)**.

```sql
create schema if not exists app;   -- helpers SECURITY DEFINER (NO expuesto a PostgREST)

create type pool_type as enum ('football_exact_score');
-- futuro: alter type pool_type add value 'coachella_lineup';

-- Perfil (nombre visible en el leaderboard) — poblado al registrarse
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table pools (
  id                   uuid primary key default gen_random_uuid(),
  organizer_id         uuid not null references auth.users(id),
  type                 pool_type not null,
  title                text not null,
  join_code            text not null unique,        -- código de invitación (slug corto)
  price_cents          integer not null default 0 check (price_cents >= 0),
  currency             text not null default 'MXN',
  max_tickets_per_user int not null default 1 check (max_tickets_per_user between 1 and 10),
  config               jsonb not null default '{}'::jsonb,  -- por-tipo, incluye scoring; validado en RPC
  scoring_locked       boolean not null default false,      -- true tras 1er resultado
  created_at           timestamptz not null default now()
);

-- Unidad predecible genérica (fútbol: un partido; coachella: un slot o el lineup completo)
create table pool_items (
  id                uuid primary key default gen_random_uuid(),
  pool_id           uuid not null references pools(id) on delete cascade,
  item_index        int not null,
  lock_at           timestamptz not null,        -- fútbol: kickoff
  payload           jsonb not null,              -- fútbol: {"home":"MEX","away":"ARG"}
  result            jsonb,                       -- fútbol: {"home":2,"away":1}; NULL hasta capturar
  result_entered_at timestamptz,
  unique (pool_id, item_index)
);

create table tickets (
  id            uuid primary key default gen_random_uuid(),
  pool_id       uuid not null references pools(id) on delete cascade,
  user_id       uuid not null references auth.users(id),
  ticket_number int not null,                    -- 1..max_tickets_per_user
  paid          boolean not null default false,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (pool_id, user_id, ticket_number)
);
create index on tickets (pool_id);

create table predictions (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references tickets(id) on delete cascade,
  pool_item_id uuid not null references pool_items(id) on delete cascade,
  payload      jsonb not null,                   -- fútbol: {"home":2,"away":1}
  updated_at   timestamptz not null default now(),
  unique (ticket_id, pool_item_id)
);

-- SALIDA del motor: una fila por (ticket, item) SOLO si ese ticket predijo ese ítem y ya hay resultado.
create table item_scores (
  ticket_id    uuid not null references tickets(id) on delete cascade,
  pool_item_id uuid not null references pool_items(id) on delete cascade,
  points       integer not null default 0,
  tier         text not null,                    -- 'exact' | 'result' | 'miss' (texto simple, no jsonb)
  breakdown    jsonb,                            -- opcional; reservado para tipos con detalle rico (Coachella)
  computed_at  timestamptz not null default now(),
  primary key (ticket_id, pool_item_id)
);
create index on item_scores (pool_item_id);
```

**Decisiones de modelado (con recortes de la crítica aplicados):**
- **Pertenencia = basada en boleto.** No hay tabla `pool_members`. "Participante" = usuario con ≥1 boleto. El join crea el primer boleto.
- **Se elimina `pools.status`** (`open|locked|closed` no lo leía nada). El bloqueo de predicciones lo da `pool_items.lock_at` por ítem.
- **`item_scores` solo se escribe si existe predicción.** Fila ausente = 0 en el `SUM`. El conteo de predicciones llenadas sale de `predictions`, no de filas placeholder.
- **`tier` es columna `text`**, no jsonb, para el path de fútbol. `breakdown` jsonb queda solo como gancho de genericidad para tipos futuros.
- **Se elimina el path de escala** (tabla `scoring_strategies` dinámica, `tickets.total_points` denormalizado). `CASE` + `SUM` en vista es correcto para escala indie.

---

## 4. RLS y seguridad

Habilitar RLS en `profiles, pools, pool_items, tickets, predictions, item_scores`. Helpers en schema `app` (no expuesto):

```sql
-- ¿el usuario actual es organizador del pool?
create function app.is_organizer(p_pool uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from pools where id = p_pool and organizer_id = (select auth.uid()));
$$;

-- ¿el usuario actual es miembro (tiene ≥1 boleto) del pool?
create function app.is_member(p_pool uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from tickets where pool_id = p_pool and user_id = (select auth.uid()));
$$;

-- ¿el ítem ya está bloqueado (kickoff pasó)?
create function app.item_locked(p_item uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select now() >= (select lock_at from pool_items where id = p_item);
$$;
```

**Políticas (resumen de las que importan):**

- **profiles**: SELECT `to authenticated using (true)` (nombres visibles en boards); UPDATE/INSERT solo del dueño.
- **pools**: SELECT `to authenticated using ( organizer_id = (select auth.uid()) or app.is_member(id) )`. El descubrimiento para unirse NO usa SELECT directo: se hace por RPC `join_pool(code)`. INSERT vía RPC `create_pool`; UPDATE solo organizador.
- **pool_items**: SELECT para miembros/organizador. INSERT/UPDATE (incluye `result`) solo organizador, vía RPC `set_item_result`.
- **predictions** (política central del juego): **SELECT por ítem, no por pool** — una fila es legible si eres dueño del ticket **O** (el ítem ya está bloqueado **Y** eres miembro):
  ```sql
  create policy predictions_select on predictions for select to authenticated
  using (
    exists (select 1 from tickets t
            where t.id = predictions.ticket_id and t.user_id = (select auth.uid()))
    or (
      app.item_locked(predictions.pool_item_id)
      and exists (select 1 from tickets t
                  where t.id = predictions.ticket_id and app.is_member(t.pool_id))
    )
  );
  ```
  INSERT/UPDATE: solo el dueño del ticket, respaldado con trigger `BEFORE` que rechaza si `now() >= lock_at`.
- **tickets**: SELECT miembros/organizador. INSERT vía RPC `buy_ticket`. UPDATE de `paid` **denegado por política directa**; solo cambia por RPC `set_ticket_paid` (verifica organizador).
- **item_scores**: SELECT para miembros; **sin escritura de cliente**. `revoke insert,update,delete on item_scores from authenticated, anon;`

**Respuestas a las preguntas de seguridad:**
- *¿Un participante lee las predicciones de otros antes del kickoff?* **No** (gated por `lock_at` por ítem).
- *¿Se puede falsear un pago?* **No** (`paid` solo por `set_ticket_paid`).
- *¿Se puede falsear un resultado/score?* **No** (`result` solo organizador; `item_scores` solo funciones del sistema).

---

## 5. Motor de puntuación y leaderboard

**Contrato de plugin (único punto que conoce tipos):** cada tipo implementa `score_<type>(prediction, result, cfg) RETURNS jsonb` → `{points, tier}`. Dispatcher:

```sql
create function score_prediction(p_type pool_type, p_pred jsonb, p_res jsonb, p_cfg jsonb)
returns jsonb language plpgsql immutable as $$
begin
  case p_type
    when 'football_exact_score' then return score_football_exact(p_pred, p_res, p_cfg);
    -- when 'coachella_lineup'   then return score_coachella_lineup(p_pred, p_res, p_cfg);
    else raise exception 'Sin estrategia de scoring para el tipo %', p_type;
  end case;
end; $$;
```

**Fútbol (defaults exact=3, result=1; `exact_points >= result_points`):**
```sql
create function score_football_exact(p_pred jsonb, p_res jsonb, p_cfg jsonb)
returns jsonb language plpgsql immutable as $$
declare
  ph int := (p_pred->>'home')::int; pa int := (p_pred->>'away')::int;
  rh int := (p_res->>'home')::int;  ra int := (p_res->>'away')::int;
  ex int := coalesce((p_cfg->>'exact_points')::int, 3);
  rp int := coalesce((p_cfg->>'result_points')::int, 1);
begin
  if ph = rh and pa = ra then return jsonb_build_object('points', ex, 'tier', 'exact');
  elsif sign(ph - pa) = sign(rh - ra) then return jsonb_build_object('points', rp, 'tier', 'result');
  else return jsonb_build_object('points', 0, 'tier', 'miss');
  end if;
end; $$;
```
`sign(home-away)` colapsa al 1X2 y maneja empates naturalmente. "Goles ilimitados" no necesita tratamiento especial; la **validación al escribir** acota a 0..max_goals (o 0..99 si ilimitado).

**Recálculo idempotente (rebuild desde cero, sin filas placeholder):**
```sql
create function recompute_item(p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_type pool_type; v_result jsonb; v_cfg jsonb;
begin
  select p.type, pi.result, p.config->'scoring'
    into v_type, v_result, v_cfg
  from pool_items pi join pools p on p.id = pi.pool_id
  where pi.id = p_item_id;

  delete from item_scores where pool_item_id = p_item_id;   -- limpia estado previo
  if v_result is null then return; end if;                  -- resultado borrado/sin capturar → 0

  insert into item_scores (ticket_id, pool_item_id, points, tier, computed_at)
  select pr.ticket_id, p_item_id,
         (s.j->>'points')::int, s.j->>'tier', now()
  from predictions pr
  cross join lateral (select score_prediction(v_type, pr.payload, v_result, v_cfg) as j) s
  where pr.pool_item_id = p_item_id;                        -- SOLO predicciones existentes
end; $$;

create function recompute_pool(p_pool_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not app.is_organizer(p_pool_id) then raise exception 'No autorizado'; end if;
  for r in select id from pool_items where pool_id = p_pool_id loop
    perform recompute_item(r.id);
  end loop;
end; $$;

-- Trigger: cualquier escritura de result recalcula ese ítem, atómico con el write
create function trg_recompute_on_result() returns trigger language plpgsql as $$
begin
  if tg_op='UPDATE' and new.result is not distinct from old.result then return new; end if;
  perform recompute_item(new.id);
  return new;
end; $$;
create trigger pool_items_result_recompute
  after insert or update of result on pool_items
  for each row execute function trg_recompute_on_result();

-- Cambio de config de scoring → recálculo automático (sin paso humano)
create function trg_rescore_on_config() returns trigger language plpgsql as $$
begin
  if new.config->'scoring' is distinct from old.config->'scoring' then
    perform recompute_pool(new.id);
  end if;
  return new;
end; $$;
create trigger pools_config_rescore
  after update of config on pools for each row execute function trg_rescore_on_config();
```

**Leaderboard (agrega scores y predicciones por separado para evitar doble conteo):**
```sql
create view leaderboard with (security_invoker = true) as
with scores as (
  select s.ticket_id,
         sum(s.points)                              as total_points,
         count(*) filter (where s.tier='exact')     as exact_hits,
         count(*) filter (where s.tier='result')    as result_hits
  from item_scores s group by s.ticket_id
),
preds as (
  select ticket_id, count(*) as predictions_made
  from predictions group by ticket_id
)
select t.id as ticket_id, t.pool_id, t.user_id, t.ticket_number, t.paid, t.created_at,
       pr.display_name,
       coalesce(sc.total_points,0) as total_points,
       coalesce(sc.exact_hits,0)   as exact_hits,
       coalesce(sc.result_hits,0)  as result_hits,
       coalesce(pd.predictions_made,0) as predictions_made,
       rank() over (
         partition by t.pool_id
         order by coalesce(sc.total_points,0) desc,
                  coalesce(sc.exact_hits,0)   desc,
                  coalesce(sc.result_hits,0)  desc,
                  t.created_at asc
       ) as rank
from tickets t
join profiles pr on pr.id = t.user_id
left join scores sc on sc.ticket_id = t.id
left join preds  pd on pd.ticket_id = t.id;
```

**Stats del pool:**
```sql
create view pool_stats with (security_invoker = true) as
select p.id as pool_id, p.price_cents, p.currency,
  count(t.*)                                       as total_tickets,
  count(t.*) filter (where t.paid)                 as paid_tickets,
  count(t.*) filter (where not t.paid)             as unpaid_tickets,
  count(t.*) filter (where t.paid) * p.price_cents as pot_cents,   -- bote = solo pagados
  (select count(*) from pool_items pi where pi.pool_id = p.id) as item_count,
  count(t.*) filter (
    where (select count(*) from predictions pr where pr.ticket_id = t.id)
        < (select count(*) from pool_items pi where pi.pool_id = p.id)
  ) as incomplete_tickets
from pools p left join tickets t on t.pool_id = p.id
group by p.id;
```

**Casos borde:** resultado tardío (recalcula al capturar), corrección de resultado (idempotente), ticket que no predijo un partido (0 implícito + marcado incompleto), guardado duplicado del mismo resultado (early-return en trigger).

---

## 6. Auth + flujos + invitaciones

**Auth:** Supabase Auth con **magic link (OTP por email)**. Trigger que crea `profiles` al registrarse; la app pide `display_name` si falta.

```sql
create function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email,'@',1))
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();
```

**RPCs del flujo (todas validan autorización dentro):** `create_pool`, `join_pool(code)`, `buy_ticket(pool)` (asigna `ticket_number` atómico + valida `max_tickets_per_user`), `set_ticket_paid(ticket, paid)` (solo organizador), `set_item_result(item, result)` (solo organizador → dispara recompute).

**Flujo organizador:** login → *Crear quiniela* → comparte `join_code`/link → marca pagos → captura resultados → ve leaderboard.
**Flujo participante:** abre link / mete código → `join_pool` (boleto #1) → opcionalmente 2º boleto → llena predicciones por boleto (bloqueadas al kickoff) → ve leaderboard, bote y su estado de pago.

---

## 7. Frontend React

**Stack (lean):** Vite + React + TypeScript, `@supabase/supabase-js`, **TanStack Query**, **React Router**, **Tailwind CSS** + componentes propios mínimos. Tipos generados con `supabase gen types typescript`.

**Estructura de carpetas:**
```
src/
  lib/            supabaseClient.ts, queries.ts (RPC wrappers), types.gen.ts
  auth/           AuthProvider.tsx, useSession.ts, LoginPage.tsx, ProfileGate.tsx
  pools/
    types/        registry.ts  ← mapa pool_type → { PredictionInput, ResultInput, renderItem }
    football/     FootballPrediction.tsx, FootballResult.tsx, footballConfig.ts
    CreatePoolPage.tsx, JoinPoolPage.tsx, PoolDashboard.tsx
    MyPredictionsPage.tsx, OrganizerAdminPage.tsx
  components/     Leaderboard.tsx, PotBadge.tsx, MoneyText.tsx, MatchCard.tsx, ScoreButtons.tsx
  routes.tsx
```

**Rutas / pantallas:**
- `/login` — magic link; `/onboarding` (ProfileGate) si falta `display_name`.
- `/crear` — **CreatePoolPage** → `create_pool`.
- `/unirse/:code` y `/unirse` — **JoinPoolPage** → `join_pool`.
- `/q/:poolId` — **PoolDashboard**: Leaderboard, PotBadge (bote = pagados × precio), conteos pagados/sin pagar/incompletos.
- `/q/:poolId/boleto/:ticketId` — **MyPredictionsPage**: partidos; inputs bloqueados si `now() >= lock_at`.
- `/q/:poolId/admin` — **OrganizerAdminPage** (solo organizador): toggle pagado + captura de resultados.

**Patrón de renderer por tipo (extensibilidad en el front):** un **registry** mapea `pool_type` a sus componentes. El core nunca importa fútbol directamente.
```ts
// pools/types/registry.ts
export interface PoolTypePlugin {
  label: string;
  PredictionInput: React.FC<{ item: PoolItem; value?: Json; onChange:(v:Json)=>void; disabled:boolean }>;
  ResultInput:     React.FC<{ item: PoolItem; value?: Json; onChange:(v:Json)=>void }>;
  ConfigForm:      React.FC<{ value: Json; onChange:(v:Json)=>void }>;
  renderItemSummary: (item: PoolItem) => React.ReactNode;
}
export const POOL_TYPES: Record<string, PoolTypePlugin> = {
  football_exact_score: footballPlugin,   // + coachellaLineup en el futuro
};
```
- `<ScoreButtons>` (botones 0..max_goals) cuando `max_goals` es finito; input numérico libre (0..99) cuando es "ilimitado".
- Optimistic UI solo como *preview* del puntaje (no autoritativo).
- **MoneyText** formatea con `Intl.NumberFormat('es-MX', { style:'currency', currency })`.

---

## 8. Extensibilidad — cómo encaja Coachella 2027

Añadir un tipo nuevo **no toca** core, tablas, trigger, leaderboard ni RLS. Solo se agregan piezas-plugin:

1. **DB:** `alter type pool_type add value 'coachella_lineup';` *(en migración va en su propio statement, separado del que lo usa).*
2. **Función de scoring** `score_coachella_lineup(pred, result, cfg)`: `points = |intersección de artistas| × points_per_correct_artist`.
3. **Una rama `when`** en `score_prediction`.
4. **Validadores** `validate_pool_config` / `validate_item_result` / `validate_prediction`.
5. **Plugin de front** en `POOL_TYPES['coachella_lineup']`.

**Grano de ítem (soporta ambas formas):**
- **Fútbol:** N ítems (un partido por ítem), una predicción por ítem.
- **Coachella:** **un solo ítem** cuyo `payload`/`result` contienen el lineup completo; una predicción cuyo `payload` es el arreglo elegido; `score = tamaño de la intersección`.

**Contrato de validación por tipo (la otra mitad de la pluggabilidad):**
```sql
create function app.validate_pool_config(p_type pool_type, p_cfg jsonb) returns void
language plpgsql as $$
begin
  if p_type = 'football_exact_score' then
    if coalesce((p_cfg#>>'{scoring,exact_points}')::int,3)
       < coalesce((p_cfg#>>'{scoring,result_points}')::int,1)
      then raise exception 'exact_points debe ser >= result_points'; end if;
  end if;
end; $$;
-- análogas: app.validate_prediction(...) y app.validate_item_result(...)
```
La **validación de predicción al escribir** (BEFORE INSERT/UPDATE en `predictions`) es crítica: un solo payload malformado rompería el recompute del partido completo.

---

## 9. Supuestos y defaults

- **Auth:** magic link / OTP por email. Perfil con `display_name` obligatorio antes de operar.
- **Pertenencia:** basada en boleto (sin tabla `pool_members`).
- **Descubrimiento/join:** por `join_code` vía RPC `join_pool`.
- **Scoring:** en Postgres (trigger + RPCs), tiers `exact|result|miss`, defaults exact=3 / result=1.
- **Config de scoring:** se relockea con `scoring_locked` tras el 1er resultado; un cambio dispara `recompute_pool` automático.
- **Bote:** solo boletos **pagados** × precio.
- **Empates:** `rank()` compartido; payout lo resuelve el organizador manualmente.
- **Tickets incompletos compiten** (0 en partidos no predichos).
- **Goles ilimitados:** tope de cordura 0..99 en input libre.
- **Dinero:** enteros (centavos), `currency` por pool (default MXN).
- **Diferido:** pasarela de pagos, notificaciones, versionado de payloads, payout automático.
- **A confirmar:** ¿el organizador puede comprar boleto en su propio pool? (default propuesto: **sí**).

---

## Roadmap de construcción

### Fase 0 — Cimientos (proyecto + auth)
*Meta: esqueleto desplegable con login funcionando y perfiles.*
1. Crear proyecto Supabase y proyecto React con Vite + TS + Tailwind + React Router + TanStack Query + supabase-js.
2. Configurar Supabase Auth con magic link (OTP email); definir URL de redirect.
3. Migración: tabla `profiles` + trigger `app.handle_new_user()`; habilitar RLS y políticas de profiles.
4. Front: AuthProvider/useSession, LoginPage (magic link), ProfileGate/onboarding para fijar `display_name`.
5. Generar types con `supabase gen types typescript` y cablear `supabaseClient.ts`.

### Fase 1 — Core genérico de datos + RLS
*Meta: esquema canónico y seguridad de fila completa, sin lógica de fútbol todavía.*
1. Migración: schema `app`; enum `pool_type`; tablas `pools, pool_items, tickets, predictions, item_scores` con índices.
2. Helpers SECURITY DEFINER: `app.is_organizer`, `app.is_member`, `app.item_locked`.
3. Habilitar RLS y crear TODAS las políticas; revoke writes en `item_scores`.
4. Trigger BEFORE en `predictions` que rechaza escritura si `now() >= lock_at`.
5. RPCs de flujo: `create_pool`, `join_pool`, `buy_ticket`, `set_ticket_paid`, `set_item_result`.
6. Probar políticas con tests de RLS antes de seguir.

### Fase 2 — Motor de puntuación (plugin fútbol)
*Meta: scoring autoritativo en Postgres, idempotente, con leaderboard correcto.*
1. Funciones: `score_prediction` (dispatcher), `score_football_exact`.
2. Validadores por tipo: `validate_pool_config`, `validate_prediction` (trigger BEFORE), `validate_item_result`.
3. `recompute_item`, `recompute_pool` (con check de organizador).
4. Triggers de recompute on result y rescore on config; set `scoring_locked` tras 1er resultado.
5. Vistas `leaderboard` y `pool_stats` con `security_invoker=true`.
6. Tests: exacto, resultado con empate, miss, edición idempotente, cambio de config recalcula, payload inválido rechazado.

### Fase 3 — Frontend fútbol sobre el registry
*Meta: flujo completo organizador y participante en UI, con renderer por tipo.*
1. `POOL_TYPES` registry y `footballPlugin`.
2. CreatePoolPage → `create_pool`; JoinPoolPage → `join_pool`.
3. MyPredictionsPage por boleto con bloqueo por `lock_at`.
4. PoolDashboard: Leaderboard, PotBadge, conteos.
5. OrganizerAdminPage: toggle pagado + captura de resultados.
6. TanStack Query con invalidación tras RPCs.

### Fase 4 — Endurecimiento + validación de extensibilidad
*Meta: listo para usuarios reales y verificado que Coachella encaja.*
1. Auditar con `get_advisors` (lint RLS); asegurar `(select auth.uid())` en todas las políticas.
2. Pruebas E2E: dos participantes no ven predicciones ajenas antes del kickoff; nadie auto-marca pagado; nadie escribe result/item_scores.
3. Spike de extensibilidad (NO build): documentar `score_coachella_lineup` + validadores + plugin de front.
4. Formateo de dinero, copys en español, edge cases en UI; deploy del front (Vercel/Netlify).

---

## Tech stack
- Supabase Postgres (tablas, RLS, PL/pgSQL, vistas con `security_invoker`)
- Supabase Auth (magic link / OTP por email)
- PL/pgSQL para motor de scoring (trigger AFTER + RPCs SECURITY DEFINER); sin Edge Functions
- React + Vite + TypeScript
- `@supabase/supabase-js` (PostgREST + RPC + Auth)
- TanStack Query (cache de datos e invalidación)
- React Router
- Tailwind CSS
- `supabase gen types typescript` (tipos generados)
- Hosting de front: Vercel o Netlify
