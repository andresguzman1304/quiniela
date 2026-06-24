/** Formatea centavos a moneda legible (es-MX por defecto). */
export function formatMoney(cents: number, currency = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
  }).format((cents ?? 0) / 100)
}
