/**
 * Mapeo inteligente de Banderas de País y Especies de Fruta
 */

export const COUNTRY_FLAGS: Record<string, { flag: string; name: string }> = {
  eu: { flag: '🇪🇺', name: 'Unión Europea' },
  europa: { flag: '🇪🇺', name: 'Unión Europea' },
  europe: { flag: '🇪🇺', name: 'Unión Europea' },
  holanda: { flag: '🇳🇱', name: 'Holanda / Países Bajos' },
  rotterdam: { flag: '🇳🇱', name: 'Holanda / Rotterdam' },
  netherlands: { flag: '🇳🇱', name: 'Holanda' },
  usa: { flag: '🇺🇸', name: 'Estados Unidos' },
  eeuu: { flag: '🇺🇸', name: 'Estados Unidos' },
  'estados unidos': { flag: '🇺🇸', name: 'Estados Unidos' },
  us: { flag: '🇺🇸', name: 'Estados Unidos' },
  ecuador: { flag: '🇪🇨', name: 'Ecuador' },
  guayaquil: { flag: '🇪🇨', name: 'Ecuador' },
  'guayaquil-ecuador': { flag: '🇪🇨', name: 'Ecuador' },
  venezuela: { flag: '🇻🇪', name: 'Venezuela' },
  china: { flag: '🇨🇳', name: 'China' },
  chile: { flag: '🇨🇱', name: 'Chile' },
  colombia: { flag: '🇨🇴', name: 'Colombia' },
  mexico: { flag: '🇲🇽', name: 'México' },
  espana: { flag: '🇪🇸', name: 'España' },
  spain: { flag: '🇪🇸', name: 'España' },
  uk: { flag: '🇬🇧', name: 'Reino Unido' },
}

export function getCountryFlag(destination?: string | null): { flag: string; label: string } {
  if (!destination) return { flag: '🌐', label: 'Sin especificar' }
  const normalized = destination.toLowerCase().trim()

  for (const [key, item] of Object.entries(COUNTRY_FLAGS)) {
    if (normalized === key || normalized.includes(key)) {
      return { flag: item.flag, label: destination }
    }
  }

  // Check if destination contains "EU" as standalone word
  if (/\b(eu|europa|europe)\b/i.test(normalized)) {
    return { flag: '🇪🇺', label: destination }
  }

  return { flag: '🌐', label: destination }
}

export const FRUIT_SPECIES: Record<string, { icon: string; label: string }> = {
  limones: { icon: '🍋', label: 'Limones' },
  limon: { icon: '🍋', label: 'Limón' },
  manzanas: { icon: '🍎', label: 'Manzanas' },
  manzana: { icon: '🍎', label: 'Manzana' },
  cerezas: { icon: '🍒', label: 'Cerezas' },
  cereza: { icon: '🍒', label: 'Cereza' },
  uvas: { icon: '🍇', label: 'Uvas' },
  uva: { icon: '🍇', label: 'Uva' },
  naranjas: { icon: '🍊', label: 'Naranjas' },
  naranja: { icon: '🍊', label: 'Naranja' },
  paltas: { icon: '🥑', label: 'Paltas' },
  palta: { icon: '🥑', label: 'Palta' },
  kiwis: { icon: '🥝', label: 'Kiwis' },
  kiwi: { icon: '🥝', label: 'Kiwi' },
  duraznos: { icon: '🍑', label: 'Duraznos' },
  arandanos: { icon: '🫐', label: 'Arándanos' }
}

export function getFruitInfo(species?: string | null, clientName?: string | null): { icon: string; label: string } {
  if (species && species.trim() !== '') {
    const normalized = species.toLowerCase().trim()
    for (const [key, item] of Object.entries(FRUIT_SPECIES)) {
      if (normalized.includes(key)) {
        return { icon: item.icon, label: species }
      }
    }
    return { icon: '📦', label: species }
  }

  // Fallback según cliente si no tiene especie definida
  const clientLower = (clientName || '').toLowerCase()
  if (clientLower.includes('growers')) {
    return { icon: '🍋', label: 'Limones' }
  }
  if (clientLower.includes('agrocomercial')) {
    return { icon: '🍎', label: 'Manzanas' }
  }

  return { icon: '📦', label: 'Fruta General' }
}
