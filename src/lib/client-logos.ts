/**
 * Helper para resolver el logo institucional de un cliente o usuario.
 */
export function getClientLogoUrl(displayName?: string | null, clientName?: string | null): string | null {
  const nameToTest = `${displayName || ''} ${clientName || ''}`.toLowerCase().trim()
  if (!nameToTest) return null

  if (nameToTest.includes('growers') || nameToTest.includes('the growers club')) {
    return '/the growers club.png'
  }

  return null
}
