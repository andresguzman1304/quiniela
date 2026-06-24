import { flagCodeFor } from '@/lib/countries'

/**
 * Bandera de un equipo si es un país conocido (vía flagcdn, se ve en todos lados).
 * Si no es país, no muestra nada (o un balón si `placeholder`).
 */
export function Flag({
  team,
  size = 20,
  placeholder = false,
  className = '',
}: {
  team: string | null | undefined
  size?: number
  placeholder?: boolean
  className?: string
}) {
  const code = flagCodeFor(team)
  if (!code) {
    return placeholder ? <span className={className} style={{ fontSize: size * 0.9 }}>⚽</span> : null
  }
  const h = Math.round(size * 0.75)
  return (
    <img
      src={`https://flagcdn.com/${code}.svg`}
      width={size}
      height={h}
      alt={team ?? ''}
      loading="lazy"
      className={`inline-block rounded-sm object-cover shadow-sm ${className}`}
      style={{ width: size, height: h }}
    />
  )
}
