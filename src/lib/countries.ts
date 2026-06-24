// Selecciones de fútbol más comunes (nombre en español → código ISO-3166 alpha-2).
// Se usa para mostrar banderas (flagcdn) y para el selector de equipos al crear.

export interface Country {
  name: string
  code: string // ISO2, minúsculas (flagcdn)
}

export const COUNTRIES: Country[] = [
  { name: 'México', code: 'mx' },
  { name: 'Argentina', code: 'ar' },
  { name: 'Brasil', code: 'br' },
  { name: 'Francia', code: 'fr' },
  { name: 'Alemania', code: 'de' },
  { name: 'España', code: 'es' },
  { name: 'Inglaterra', code: 'gb-eng' },
  { name: 'Portugal', code: 'pt' },
  { name: 'Países Bajos', code: 'nl' },
  { name: 'Italia', code: 'it' },
  { name: 'Bélgica', code: 'be' },
  { name: 'Croacia', code: 'hr' },
  { name: 'Chequia', code: 'cz' },
  { name: 'República Checa', code: 'cz' },
  { name: 'Uruguay', code: 'uy' },
  { name: 'Colombia', code: 'co' },
  { name: 'Estados Unidos', code: 'us' },
  { name: 'Canadá', code: 'ca' },
  { name: 'Japón', code: 'jp' },
  { name: 'Corea del Sur', code: 'kr' },
  { name: 'Marruecos', code: 'ma' },
  { name: 'Senegal', code: 'sn' },
  { name: 'Ghana', code: 'gh' },
  { name: 'Nigeria', code: 'ng' },
  { name: 'Camerún', code: 'cm' },
  { name: 'Chile', code: 'cl' },
  { name: 'Perú', code: 'pe' },
  { name: 'Ecuador', code: 'ec' },
  { name: 'Paraguay', code: 'py' },
  { name: 'Costa Rica', code: 'cr' },
  { name: 'Suiza', code: 'ch' },
  { name: 'Polonia', code: 'pl' },
  { name: 'Dinamarca', code: 'dk' },
  { name: 'Suecia', code: 'se' },
  { name: 'Noruega', code: 'no' },
  { name: 'Serbia', code: 'rs' },
  { name: 'Australia', code: 'au' },
  { name: 'Arabia Saudita', code: 'sa' },
  { name: 'Qatar', code: 'qa' },
  { name: 'Irán', code: 'ir' },
  { name: 'Escocia', code: 'gb-sct' },
  { name: 'Gales', code: 'gb-wls' },
  { name: 'Austria', code: 'at' },
  { name: 'Turquía', code: 'tr' },
  { name: 'Ucrania', code: 'ua' },
  { name: 'Grecia', code: 'gr' },
  { name: 'Túnez', code: 'tn' },
  { name: 'Egipto', code: 'eg' },
  { name: 'Sudáfrica', code: 'za' },
  { name: 'Bolivia', code: 'bo' },
  { name: 'Venezuela', code: 've' },
  { name: 'Panamá', code: 'pa' },
  { name: 'Honduras', code: 'hn' },
]

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
}

const BY_NAME = new Map<string, string>(COUNTRIES.map((c) => [normalize(c.name), c.code]))

/** Devuelve el código ISO2 (flagcdn) de un nombre de equipo, o null si no es país conocido. */
export function flagCodeFor(teamName: string | undefined | null): string | null {
  if (!teamName) return null
  return BY_NAME.get(normalize(teamName)) ?? null
}
