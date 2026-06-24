// Cascarita (random_scoreline): el organizador elige cuántos números repartir y
// de ahí se deriva el tope de gol por equipo. Cada opción llena justo una
// cuadrícula de marcadores (tope+1)²: 9→2-2, 16→3-3, 25→4-4, 36→5-5, 49→6-6, 100→9-9.
export const PLAYER_OPTS = [9, 16, 25, 36, 49, 100]

/** Menor tope (1..50) cuya cuadrícula (tope+1)² alcanza para `n` números. */
export function goalsForPlayers(n: number): number {
  const safe = Math.max(1, Math.floor(n) || 1)
  return Math.min(50, Math.max(1, Math.ceil(Math.sqrt(safe)) - 1))
}

/** Cantidad de marcadores posibles para un tope de gol dado. */
export function gridCount(maxGoals: number): number {
  return (maxGoals + 1) ** 2
}
