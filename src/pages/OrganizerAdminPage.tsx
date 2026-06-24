import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  usePool,
  usePoolItems,
  useLeaderboard,
  useDrawResults,
  useSetTicketPaid,
  useSetItemResult,
  useAssignScorelines,
  useUpdatePoolSettings,
  useDeletePool,
  useMembers,
  useRenameMember,
  useRemoveMember,
} from '@/lib/api'
import { useAuth } from '@/auth/AuthProvider'
import { pluginFor } from '@/pools/types/registry'
import { MatchCard } from '@/components/MatchCard'
import { PLAYER_OPTS, goalsForPlayers, gridCount } from '@/lib/cascarita'
import type { DrawResultRow, FootballScore, LeaderboardRow, MemberRow, Pool } from '@/lib/types'

export function OrganizerAdminPage() {
  const { poolId } = useParams<{ poolId: string }>()
  const { session } = useAuth()
  const uid = session?.user.id

  const { data: pool, isLoading: poolLoading, error: poolError } = usePool(poolId)
  const { data: items, isLoading: itemsLoading } = usePoolItems(poolId)
  const { data: leaderboard, isLoading: lbLoading } = useLeaderboard(poolId)

  const setTicketPaid = useSetTicketPaid(poolId ?? '')
  const setItemResult = useSetItemResult(poolId ?? '')

  const [drafts, setDrafts] = useState<Record<string, FootballScore | null>>({})

  if (poolLoading) {
    return (
      <div className="mx-auto max-w-md px-6 py-10 text-center text-gray-500">Cargando…</div>
    )
  }

  if (poolError || !pool) {
    return (
      <div className="mx-auto max-w-md px-6 py-10">
        <p className="text-center text-red-600">Error al cargar la quiniela.</p>
        <div className="mt-4 text-center">
          <Link to={'/q/' + poolId} className="text-brand-dark underline">
            Volver
          </Link>
        </div>
      </div>
    )
  }

  if (pool.organizer_id !== uid) {
    return (
      <div className="mx-auto max-w-md px-6 py-10 text-center">
        <p className="text-gray-700">No autorizado</p>
        <div className="mt-4">
          <Link to={'/q/' + poolId} className="text-brand-dark underline">
            Volver a la quiniela
          </Link>
        </div>
      </div>
    )
  }

  const plugin = pluginFor(pool.type)

  const getDraft = (itemId: string, fallback: FootballScore | null): FootballScore | null => {
    return itemId in drafts ? drafts[itemId] : fallback
  }

  const updateDraft = (itemId: string, value: FootballScore | null) => {
    setDrafts((prev) => ({ ...prev, [itemId]: value }))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-md px-6 py-10"
    >
      <Link to={'/q/' + poolId} className="text-sm text-brand-dark underline">
        ← Volver a la quiniela
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-gray-900">Administración</h1>
      <p className="mt-1 text-sm text-gray-500">{pool.title}</p>

      {/* Configuración editable */}
      <PoolSettingsSection pool={pool} />

      {/* Jugadores: corregir nombre o sacar a alguien */}
      <PlayersSection poolId={poolId!} />

      {/* Sorteo (solo cascarita) */}
      {pool.type === 'random_scoreline' && (
        <DrawSection poolId={poolId!} leaderboard={leaderboard} />
      )}

      {/* Sección Pagos */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Pagos</h2>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white">
          {lbLoading ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">Cargando…</p>
          ) : !leaderboard || leaderboard.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">Aún no hay boletos.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {leaderboard.map((row) => (
                <li key={row.ticket_id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{row.display_name}</p>
                    <p className="text-xs text-gray-500">Boleto #{row.ticket_number}</p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    type="button"
                    disabled={setTicketPaid.isPending}
                    onClick={() =>
                      setTicketPaid.mutateAsync({ ticketId: row.ticket_id, paid: !row.paid })
                    }
                    className="ml-3 flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-50"
                  >
                    <span aria-hidden>{row.paid ? '✅' : '⬜'}</span>
                    <span>{row.paid ? 'Pagado' : 'Pendiente'}</span>
                  </motion.button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Sección Resultados */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Resultados</h2>
        <div className="mt-3 space-y-4">
          {itemsLoading ? (
            <p className="text-center text-sm text-gray-500">Cargando…</p>
          ) : !items || items.length === 0 ? (
            <p className="text-center text-sm text-gray-500">No hay partidos.</p>
          ) : (
            items.map((item, i) => {
              const draftValue = getDraft(item.id, item.result)
              return (
                <MatchCard key={item.id} item={item} index={i}>
                  <div className="mt-3 space-y-3">
                    <plugin.ResultInput
                      item={item}
                      value={draftValue}
                      onChange={(v) => updateDraft(item.id, v)}
                    />

                    {item.result && (
                      <p className="text-xs text-gray-500">
                        Resultado guardado: {item.result.home} - {item.result.away}
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        type="button"
                        disabled={setItemResult.isPending || draftValue == null}
                        onClick={() =>
                          setItemResult.mutateAsync({ itemId: item.id, result: draftValue })
                        }
                        className="flex-1 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Guardar resultado
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        type="button"
                        disabled={setItemResult.isPending || item.result == null}
                        onClick={() => {
                          updateDraft(item.id, null)
                          setItemResult.mutateAsync({ itemId: item.id, result: null })
                        }}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 disabled:opacity-50"
                      >
                        Borrar
                      </motion.button>
                    </div>
                  </div>
                </MatchCard>
              )
            })
          )}
        </div>
      </section>

      {/* Zona de peligro */}
      <DangerZone pool={pool} />
    </motion.div>
  )
}

function PlayersSection({ poolId }: { poolId: string }) {
  const { data: members, isLoading } = useMembers(poolId)

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900">Jugadores 👥</h2>
      <p className="mt-1 text-sm text-gray-500">
        Corrige el nombre de alguien o sácalo de la quiniela. Útil si una persona se
        equivocó al entrar o entró varias veces.
      </p>
      <div className="mt-3 rounded-xl border border-gray-200 bg-white">
        {isLoading ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">Cargando…</p>
        ) : !members || members.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">Aún no hay jugadores.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {members.map((m) => (
              <PlayerRow key={m.user_id} poolId={poolId} member={m} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function PlayerRow({ poolId, member }: { poolId: string; member: MemberRow }) {
  const rename = useRenameMember(poolId)
  const remove = useRemoveMember(poolId)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [name, setName] = useState(member.display_name)

  async function saveName() {
    const clean = name.trim()
    if (!clean || clean === member.display_name) {
      setEditing(false)
      return
    }
    await rename.mutateAsync({ userId: member.user_id, name: clean }).catch(() => {})
    setEditing(false)
  }

  const numbersLabel =
    member.ticket_count === 0
      ? 'Sin números'
      : `${member.ticket_count} ${member.ticket_count === 1 ? 'número' : 'números'}`

  return (
    <li className="px-4 py-3">
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveName()
              if (e.key === 'Escape') {
                setName(member.display_name)
                setEditing(false)
              }
            }}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            disabled={rename.isPending}
            onClick={() => void saveName()}
            className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {rename.isPending ? '…' : 'Guardar'}
          </motion.button>
          <button
            type="button"
            onClick={() => {
              setName(member.display_name)
              setEditing(false)
            }}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">
              {member.display_name}
              {member.is_organizer && (
                <span className="ml-2 text-xs font-normal text-gray-400">(organizador)</span>
              )}
            </p>
            <p className="text-xs text-gray-500">{numbersLabel}</p>
          </div>
          {!member.is_organizer && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Renombrar
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Quitar
              </button>
            </div>
          )}
        </div>
      )}

      {confirming && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">
            ¿Sacar a <strong>{member.display_name}</strong> de la quiniela? Se borran sus
            números y predicciones. No se puede deshacer.
          </p>
          <div className="mt-2 flex gap-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              disabled={remove.isPending}
              onClick={async () => {
                await remove.mutateAsync(member.user_id).catch(() => {})
                setConfirming(false)
              }}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {remove.isPending ? 'Sacando…' : 'Sí, quitar'}
            </motion.button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {(rename.error || remove.error) && (
        <p className="mt-2 text-sm text-red-600">
          {((rename.error || remove.error) as Error).message}
        </p>
      )}
    </li>
  )
}

function DrawSection({
  poolId,
  leaderboard,
}: {
  poolId: string
  leaderboard: LeaderboardRow[] | undefined
}) {
  const assign = useAssignScorelines(poolId)
  const { data: drawResults } = useDrawResults(poolId)
  const [confirming, setConfirming] = useState(false)

  const rows = leaderboard ?? []
  const total = rows.length
  const pending = rows.filter((r) => !r.paid).length

  // Agrupa el sorteo por número (boleto): un renglón por boleto con sus marcadores.
  const byTicket = useMemo(() => {
    type Group = { number: number; name: string; paid: boolean; items: DrawResultRow[] }
    const map = new Map<string, Group>()
    for (const r of drawResults ?? []) {
      const g: Group =
        map.get(r.ticket_id) ?? { number: r.ticket_number, name: r.display_name, paid: r.paid, items: [] }
      g.items.push(r)
      map.set(r.ticket_id, g)
    }
    return Array.from(map.values()).sort((a, b) => a.number - b.number)
  }, [drawResults])

  async function doDraw() {
    setConfirming(false)
    await assign.mutateAsync().catch(() => {})
  }

  function handleClick() {
    if (pending > 0) setConfirming(true)
    else void doDraw()
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900">Sorteo de marcadores 🎲</h2>
      <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">
          Reparte un marcador al azar a cada número. Hazlo cuando todos hayan comprado, antes del
          partido. Si lo repites, se vuelven a barajar.
        </p>

        {total === 0 ? (
          <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-500">
            Aún no hay números comprados.
          </p>
        ) : (
          <p className="mt-2 text-xs text-gray-500">
            {pending === 0
              ? `Los ${total} números están pagados.`
              : `Faltan ${pending} de ${total} números por pagar.`}
          </p>
        )}

        {!confirming && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            disabled={assign.isPending || total === 0}
            onClick={handleClick}
            className="mt-3 w-full rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white disabled:opacity-60"
          >
            {assign.isPending ? 'Sorteando…' : 'Sortear marcadores'}
          </motion.button>
        )}

        {confirming && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">
              Faltan <strong>{pending}</strong> de {total} números por pagar. Si sorteas ahora, esos
              números igual reciben marcador. ¿Continuar?
            </p>
            <div className="mt-2 flex gap-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                disabled={assign.isPending}
                onClick={doDraw}
                className="flex-1 rounded-lg bg-brand-dark px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {assign.isPending ? 'Sorteando…' : 'Sortear de todos modos'}
              </motion.button>
              <button
                type="button"
                disabled={assign.isPending}
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {assign.data != null && !assign.isPending && (
          <p className="mt-2 text-sm text-brand-dark">✓ {assign.data} marcadores asignados.</p>
        )}
        {assign.error && (
          <p className="mt-2 text-sm text-red-600">{(assign.error as Error).message}</p>
        )}

        {byTicket.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700">Cómo quedó el sorteo</p>
            <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {byTicket.map((g) => (
                <li key={g.number} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">
                      #{g.number} · {g.name}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">
                      {g.paid ? '✅ Pagado' : '⬜ Pendiente'}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {g.items.map((it) => (
                      <span key={it.pool_item_id} className="text-sm tabular-nums text-brand-dark">
                        {it.item_payload.home}{' '}
                        <strong>
                          {it.payload.home}–{it.payload.away}
                        </strong>{' '}
                        {it.item_payload.away}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

function DangerZone({ pool }: { pool: Pool }) {
  const navigate = useNavigate()
  const del = useDeletePool()
  const [confirming, setConfirming] = useState(false)

  async function handleDelete() {
    try {
      await del.mutateAsync(pool.id)
      navigate('/')
    } catch {
      /* error mostrado abajo via del.error */
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-red-700">Zona de peligro</h2>
      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">
          Borra la quiniela por completo. Solo se puede mientras no haya iniciado ningún partido.
          Se eliminan todos los números, predicciones y pagos. No se puede deshacer.
        </p>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-3 w-full rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
          >
            Borrar quiniela
          </button>
        ) : (
          <div className="mt-3">
            <p className="text-sm font-medium text-red-800">¿Seguro? Esta acción no se puede deshacer.</p>
            <div className="mt-2 flex gap-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                disabled={del.isPending}
                onClick={handleDelete}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {del.isPending ? 'Borrando…' : 'Sí, borrar'}
              </motion.button>
              <button
                type="button"
                disabled={del.isPending}
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        {del.error && <p className="mt-2 text-sm text-red-600">{(del.error as Error).message}</p>}
      </div>
    </section>
  )
}

function PoolSettingsSection({ pool }: { pool: Pool }) {
  const isCascarita = pool.type === 'random_scoreline'
  const update = useUpdatePoolSettings(pool.id)

  const [maxTickets, setMaxTickets] = useState(pool.max_tickets_per_user)
  const [targetPlayers, setTargetPlayers] = useState(() => gridCount(pool.config.max_goals ?? 3))
  const [unique, setUnique] = useState(!!pool.config.unique)
  const [saved, setSaved] = useState(false)

  const maxGoals = goalsForPlayers(targetPlayers)
  const grid = gridCount(maxGoals)

  async function handleSave() {
    setSaved(false)
    await update.mutateAsync({
      max_tickets: maxTickets,
      config: isCascarita ? { ...pool.config, max_goals: maxGoals, unique } : undefined,
    })
    setSaved(true)
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900">Configuración ⚙️</h2>
      <div className="mt-3 space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        {isCascarita && (
          <>
            <div>
              <span className="block text-sm font-medium text-gray-700">¿Cuántos números quieres repartir?</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {PLAYER_OPTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setTargetPlayers(n)
                      setSaved(false)
                    }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      targetPlayers === n ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Tope 0-{maxGoals}: {grid} marcadores posibles (0-0 a {maxGoals}-{maxGoals}).
              </p>
            </div>
            <div>
              <span className="block text-sm font-medium text-gray-700">Repartición de números</span>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUnique(false)
                    setSaved(false)
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    !unique ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Repetibles
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUnique(true)
                    setSaved(false)
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    unique ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Únicos
                </button>
              </div>
            </div>
          </>
        )}
        <div>
          <label htmlFor="editMaxTickets" className="block text-sm font-medium text-gray-700">
            {isCascarita ? 'Máx. números por persona' : 'Máx. boletos por persona'}
          </label>
          <input
            id="editMaxTickets"
            type="number"
            min={1}
            step="1"
            value={maxTickets}
            onChange={(e) => {
              setMaxTickets(Math.max(1, Math.floor(Number(e.target.value)) || 1))
              setSaved(false)
            }}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          disabled={update.isPending}
          onClick={handleSave}
          className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {update.isPending ? 'Guardando…' : 'Guardar configuración'}
        </motion.button>

        {saved && !update.isPending && (
          <p className="text-sm text-brand-dark">✓ Configuración guardada.</p>
        )}
        {update.error && <p className="text-sm text-red-600">{(update.error as Error).message}</p>}

        {isCascarita && (
          <p className="text-xs text-gray-500">
            Si cambias el tope de marcadores después de sortear, vuelve a sortear para reasignar.
          </p>
        )}
      </div>
    </section>
  )
}