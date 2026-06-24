import { useState } from 'react'

/**
 * Caja para invitar: muestra el código, el link /unirse/CODE, botones de copiar
 * y un botón directo para compartir por WhatsApp.
 */
export function ShareBox({ code, title }: { code: string; title?: string }) {
  const url = `${window.location.origin}/unirse/${code}`
  const msg = `¡Te invito a la quiniela${title ? ` "${title}"` : ''}! 🏆\nEntra con este link: ${url}\n(o usa el código: ${code})`
  const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`

  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  async function copy(text: string, what: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      /* clipboard no disponible */
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-1 text-sm font-semibold text-gray-700">Invita a tus amigos</h3>
      <p className="mb-3 text-xs text-gray-500">Comparte el link o el código por WhatsApp.</p>

      <div className="mb-3 flex items-center gap-2">
        <code className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-center text-lg font-bold tracking-widest">
          {code}
        </code>
        <button
          onClick={() => copy(code, 'code')}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          {copied === 'code' ? '✓' : 'Copiar'}
        </button>
      </div>

      <div className="flex gap-2">
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 font-semibold text-white transition hover:brightness-95"
        >
          <span>WhatsApp</span>
        </a>
        <button
          onClick={() => copy(url, 'link')}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          {copied === 'link' ? '✓ Copiado' : 'Copiar link'}
        </button>
      </div>
    </div>
  )
}
