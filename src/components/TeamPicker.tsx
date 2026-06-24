import { useId } from 'react'
import { COUNTRIES } from '@/lib/countries'
import { Flag } from '@/components/Flag'

/**
 * Input de equipo con autocompletado de países (con bandera). Acepta texto libre
 * para equipos que no son selecciones nacionales (ligas, etc.).
 */
export function TeamPicker({
  value,
  onChange,
  placeholder = 'Equipo / país',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const listId = useId()
  return (
    <div className="flex items-center gap-2">
      <Flag team={value} size={20} placeholder />
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
      <datalist id={listId}>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.name} />
        ))}
      </datalist>
    </div>
  )
}
