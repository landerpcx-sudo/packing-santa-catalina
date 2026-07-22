/**
 * Deduce o sanea el tipo MIME de un archivo basándose en su nombre y tipo proporcionado.
 * Esto evita rechazos por 'mime type not allowed' en Supabase Storage cuando los navegadores
 * móviles o escáneres envían types vacíos o genéricos (ej. 'application/octet-stream').
 */
export function resolveMimeType(fileName: string, providedType?: string | null): string {
  const cleanType = (providedType || '').trim().toLowerCase()
  if (cleanType && cleanType !== 'application/octet-stream' && cleanType !== 'binary/octet-stream') {
    return providedType!
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || ''

  switch (ext) {
    case 'pdf':
      return 'application/pdf'
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'xls':
      return 'application/vnd.ms-excel'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'heic':
      return 'image/heic'
    case 'heif':
      return 'image/heif'
    case 'csv':
      return 'text/csv'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    default:
      return cleanType || 'application/pdf'
  }
}
