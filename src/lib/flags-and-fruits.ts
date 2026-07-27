/**
 * Mapeo inteligente de Banderas de País y Especies de Fruta
 */

export const COUNTRY_FLAGS: Record<string, { flag: string; isoCode: string; name: string }> = {
  eu: { flag: '🇪🇺', isoCode: 'eu', name: 'Unión Europea' },
  europa: { flag: '🇪🇺', isoCode: 'eu', name: 'Unión Europea' },
  europe: { flag: '🇪🇺', isoCode: 'eu', name: 'Unión Europea' },
  holanda: { flag: '🇳🇱', isoCode: 'nl', name: 'Holanda / Países Bajos' },
  rotterdam: { flag: '🇳🇱', isoCode: 'nl', name: 'Holanda / Rotterdam' },
  netherlands: { flag: '🇳🇱', isoCode: 'nl', name: 'Holanda' },
  usa: { flag: '🇺🇸', isoCode: 'us', name: 'Estados Unidos' },
  eeuu: { flag: '🇺🇸', isoCode: 'us', name: 'Estados Unidos' },
  'estados unidos': { flag: '🇺🇸', isoCode: 'us', name: 'Estados Unidos' },
  us: { flag: '🇺🇸', isoCode: 'us', name: 'Estados Unidos' },
  ecuador: { flag: '🇪🇨', isoCode: 'ec', name: 'Ecuador' },
  guayaquil: { flag: '🇪🇨', isoCode: 'ec', name: 'Ecuador' },
  'guayaquil-ecuador': { flag: '🇪🇨', isoCode: 'ec', name: 'Ecuador' },
  venezuela: { flag: '🇻🇪', isoCode: 've', name: 'Venezuela' },
  china: { flag: '🇨🇳', isoCode: 'cn', name: 'China' },
  chile: { flag: '🇨🇱', isoCode: 'cl', name: 'Chile' },
  colombia: { flag: '🇨🇴', isoCode: 'co', name: 'Colombia' },
  mexico: { flag: '🇲🇽', isoCode: 'mx', name: 'México' },
  espana: { flag: '🇪🇸', isoCode: 'es', name: 'España' },
  spain: { flag: '🇪🇸', isoCode: 'es', name: 'España' },
  uk: { flag: '🇬🇧', isoCode: 'gb', name: 'Reino Unido' },
}

export function getCountryFlag(destination?: string | null): { 
  flag: string; 
  isoCode: string; 
  flagUrl: string | null; 
  label: string 
} {
  if (!destination) return { flag: '🌐', isoCode: '', flagUrl: null, label: 'Sin especificar' }
  const normalized = destination.toLowerCase().trim()

  for (const [key, item] of Object.entries(COUNTRY_FLAGS)) {
    if (normalized === key || normalized.includes(key)) {
      return { 
        flag: item.flag, 
        isoCode: item.isoCode,
        flagUrl: `https://flagcdn.com/w40/${item.isoCode}.png`,
        label: destination 
      }
    }
  }

  if (/\b(eu|europa|europe)\b/i.test(normalized)) {
    return { 
      flag: '🇪🇺', 
      isoCode: 'eu', 
      flagUrl: 'https://flagcdn.com/w40/eu.png', 
      label: destination 
    }
  }

  return { flag: '🌐', isoCode: '', flagUrl: null, label: destination }
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
