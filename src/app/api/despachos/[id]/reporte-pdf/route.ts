import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import PDFDocument from 'pdfkit'
import { PDFDocument as PDFLibDocument } from 'pdf-lib'
import path from 'path'
import fs from 'fs'

export const maxDuration = 60

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string
  try {
    const resolvedParams = await params
    id = resolvedParams.id
  } catch (e) {
    id = (params as any).id
  }

  try {
    // 1. Obtener información del despacho y todos sus documentos
    const { data: dispatch, error: dispatchError } = await supabaseAdmin
      .from('dispatches')
      .select(`
        id,
        internal_code,
        dispatch_code,
        client,
        destination,
        dispatch_date,
        expected_pallets,
        overall_status,
        dispatch_documents (
          id,
          storage_path,
          original_file_name,
          document_type,
          version_number,
          created_at,
          deleted_at
        )
      `)
      .eq('id', id)
      .single()

    if (dispatchError || !dispatch) {
      return NextResponse.json({ error: 'Despacho no encontrado' }, { status: 404 })
    }

    const documents = (dispatch.dispatch_documents || []).filter((d: any) => !d.deleted_at)

    // 2. Clasificar documentos
    // Filtrar Pack List más reciente (mayor versión) que sea un archivo .pdf
    const packListDocs = documents
      .filter(doc => doc.document_type === 'pack_list' && doc.storage_path)
      .sort((a, b) => b.version_number - a.version_number)
    const activePackList = packListDocs.length > 0 ? packListDocs[0] : null

    // Fotos de Pata a Pata
    const pataPataDocs = documents
      .filter(doc => doc.document_type === 'pata_pata_photo' && doc.storage_path)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    // Fotos de Termógrafos
    const thermographDocs = documents
      .filter(doc => doc.document_type === 'thermograph_photo' && doc.storage_path)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    // Otros / Respaldos
    const backupDocs = documents
      .filter(doc => doc.document_type === 'backup' && doc.storage_path)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    // 3. Descargar imágenes y documentos desde Supabase Storage en paralelo (Promise.all)
    const downloadFile = async (storagePath: string): Promise<Buffer | null> => {
      try {
        const { data, error } = await supabaseAdmin.storage
          .from('documentos')
          .download(storagePath)
        if (error || !data) return null
        const arrayBuffer = await data.arrayBuffer()
        return Buffer.from(arrayBuffer)
      } catch (err) {
        console.error(`Error descargando archivo ${storagePath}:`, err)
        return null
      }
    }

    // Descargar en paralelo todas las imágenes de Pata a Pata
    const pataPataPromises = pataPataDocs.map(async doc => {
      const buffer = await downloadFile(doc.storage_path!)
      if (!buffer) return null
      return {
        name: doc.original_file_name,
        buffer,
        date: new Date(doc.created_at).toLocaleDateString('es-CL', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      }
    })

    // Descargar en paralelo imágenes de Termógrafos
    const thermographPromises = thermographDocs.map(async doc => {
      const buffer = await downloadFile(doc.storage_path!)
      if (!buffer) return null
      return {
        name: doc.original_file_name,
        buffer,
        date: new Date(doc.created_at).toLocaleDateString('es-CL', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      }
    })

    // Descargar en paralelo imágenes de Respaldos (solo formatos de imagen soportados)
    const backupPromises = backupDocs
      .filter(doc => /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.original_file_name))
      .map(async doc => {
        const buffer = await downloadFile(doc.storage_path!)
        if (!buffer) return null
        return {
          name: doc.original_file_name,
          buffer,
          date: new Date(doc.created_at).toLocaleDateString('es-CL', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })
        }
      })

    const packListPromise = (activePackList && activePackList.original_file_name.toLowerCase().endsWith('.pdf'))
      ? downloadFile(activePackList.storage_path!)
      : Promise.resolve(null)

    const [pataPataRes, thermographRes, backupRes, packListBuffer] = await Promise.all([
      Promise.all(pataPataPromises),
      Promise.all(thermographPromises),
      Promise.all(backupPromises),
      packListPromise,
    ])

    const pataPataImages = pataPataRes.filter(Boolean) as { name: string; buffer: Buffer; date: string }[]
    const thermographImages = thermographRes.filter(Boolean) as { name: string; buffer: Buffer; date: string }[]
    const backupImages = backupRes.filter(Boolean) as { name: string; buffer: Buffer; date: string }[]

    // 4. Generar el PDF base del reporte usando PDFKit
    const generateReportBuffer = (): Promise<Buffer> => {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          bufferPages: true,
          autoFirstPage: false
        })

        const chunks: any[] = []
        doc.on('data', chunk => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', err => reject(err))

        // Registrar fuentes locales para evitar error ENOENT (Helvetica.afm) en Vercel
        const regularFontPath = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf')
        const boldFontPath = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Bold.ttf')
        
        try {
          doc.registerFont('Roboto', regularFontPath)
          doc.registerFont('Roboto-Bold', boldFontPath)
          doc.font('Roboto')
        } catch (fontErr) {
          console.error('Error registrando fuentes locales:', fontErr)
          // Si por alguna razón falla, PDFKit intentará usar sus fuentes internas
        }

        // Agregar la primera página de forma manual asegurando que herede la fuente Roboto configurada
        doc.addPage()

        // --- PÁGINA 1: PORTADA ---
        // Intentar cargar logo local
        const logoPath = path.join(process.cwd(), 'public', 'logo.png')
        let logoExists = false
        try {
          logoExists = fs.existsSync(logoPath)
        } catch (_) {}

        // Encabezado
        if (logoExists) {
          doc.image(logoPath, 40, 40, { width: 100 })
          doc.fillColor('#1e3a8a')
            .fontSize(16)
            .font('Roboto-Bold')
            .text('PACKING SANTA CATALINA', 160, 42)
        } else {
          doc.fillColor('#1e3a8a')
            .fontSize(18)
            .font('Roboto-Bold')
            .text('PACKING SANTA CATALINA', 40, 42)
        }

        doc.fillColor('#475569')
          .fontSize(10)
          .font('Roboto-Bold')
          .text('INFORME CONSOLIDADO DE DESPACHO / DISPATCH REPORT', logoExists ? 160 : 40, 65)

        // Línea divisoria superior
        doc.moveTo(40, 115).lineTo(555, 115).lineWidth(2).strokeColor('#4f46e5').stroke()

        // Título de Ficha Técnica
        doc.fillColor('#1e293b')
          .fontSize(12)
          .font('Roboto-Bold')
          .text('DATOS DE CONTROL DE DESPACHO', 40, 135)

        // Tabla / Grid de datos técnicos (Cajas grises elegantes)
        const drawDataBox = (label: string, value: string, x: number, y: number, w: number, h: number) => {
          doc.rect(x, y, w, h).fill('#f8fafc')
          doc.rect(x, y, w, h).lineWidth(0.5).strokeColor('#e2e8f0').stroke()
          
          doc.fillColor('#64748b')
            .fontSize(8)
            .font('Roboto-Bold')
            .text(label.toUpperCase(), x + 8, y + 8)

          doc.fillColor('#0f172a')
            .fontSize(10)
            .font('Roboto')
            .text(value || '—', x + 8, y + 20, { width: w - 16, lineBreak: false })
        }

        const formatDate = (dateStr: string | null) => {
          if (!dateStr) return '—'
          const parts = dateStr.split('T')[0].split('-')
          if (parts.length !== 3) return dateStr
          return `${parts[2]}/${parts[1]}/${parts[0]}`
        }

        // Fila 1 de datos
        drawDataBox('Código Despacho', dispatch.dispatch_code, 40, 160, 250, 40)
        drawDataBox('Código Interno', dispatch.internal_code, 305, 160, 250, 40)

        // Fila 2 de datos
        drawDataBox('Cliente / Exportadora', dispatch.client || '—', 40, 210, 250, 40)
        drawDataBox('Mercado / Destino', dispatch.destination || '—', 305, 210, 250, 40)

        // Fila 3 de datos
        drawDataBox('Fecha de Despacho', formatDate(dispatch.dispatch_date), 40, 260, 250, 40)
        drawDataBox('Pallets Esperados', `${dispatch.expected_pallets || '—'} un.`, 305, 260, 250, 40)

        // Estado destacado
        const isComplete = dispatch.overall_status === 'complete' || dispatch.overall_status === 'validated' || dispatch.overall_status === 'closed'
        const statusText = isComplete ? 'CONTROL COMPLETADO Y VALIDADO' : 'CONTROL EN PROCESO'
        const statusBg = isComplete ? '#dcfce7' : '#dbeafe'
        const statusTextCol = isComplete ? '#15803d' : '#1d4ed8'
        const statusBorder = isComplete ? '#bbf7d0' : '#bfdbfe'

        doc.rect(40, 320, 515, 35).fill(statusBg)
        doc.rect(40, 320, 515, 35).lineWidth(0.5).strokeColor(statusBorder).stroke()
        doc.fillColor(statusTextCol)
          .fontSize(10)
          .font('Roboto-Bold')
          .text(statusText, 40, 332, { align: 'center', width: 515 })

        // Información de auditoría o firmas
        doc.fillColor('#1e293b')
          .fontSize(11)
          .font('Roboto-Bold')
          .text('SELLO DE CONTROL Y CONFORMIDAD', 40, 385)

        doc.fillColor('#475569')
          .fontSize(9)
          .font('Roboto')
          .text('Este documento certifica la correcta ejecución del protocolo de trazabilidad de despacho establecido por Packing Santa Catalina. Las firmas y/o el sello del sistema que figuran a continuación garantizan el registro fotográfico y documental almacenado digitalmente.', 40, 405, { width: 515, align: 'justify' })

        // Líneas para firma (abajo en la portada)
        const drawSignatureLine = (label: string, x: number, y: number) => {
          doc.moveTo(x, y).lineTo(x + 180, y).lineWidth(0.5).strokeColor('#94a3b8').stroke()
          doc.fillColor('#475569')
            .fontSize(8)
            .font('Roboto-Bold')
            .text(label, x, y + 8, { width: 180, align: 'center' })
          doc.fillColor('#94a3b8')
            .fontSize(7)
            .font('Roboto')
            .text('Firma y Aclaración', x, y + 18, { width: 180, align: 'center' })
        }

        drawSignatureLine('SUPERVISOR CONTROL CALIDAD', 70, 550)
        drawSignatureLine('SUPERVISOR DESPACHO / FRÍO', 345, 550)

        // Nota legal pequeña al final de la portada
        doc.fillColor('#94a3b8')
          .fontSize(7)
          .font('Roboto')
          .text('Documento generado automáticamente por la Plataforma de Trazabilidad Documental de Packing Santa Catalina. Prohibida su modificación externa.', 40, 720, { width: 515, align: 'center' })


        // --- PÁGINAS DE FOTOS PATA A PATA (6 POR PÁGINA: GRID 2x3) ---
        if (pataPataImages.length > 0) {
          let currentPhotoIndex = 0

          while (currentPhotoIndex < pataPataImages.length) {
            doc.addPage()

            // Cabecera de la página de fotos
            doc.fillColor('#1e3a8a')
              .fontSize(12)
              .font('Roboto-Bold')
              .text('REGISTRO FOTOGRÁFICO: PATA A PATA / PALLETS', 40, 40)
            
            doc.moveTo(40, 55).lineTo(555, 55).lineWidth(1).strokeColor('#cbd5e1').stroke()

            // Grid de 2 columnas y 3 filas (6 fotos por página, ocupando muy bien la hoja)
            const cols = 2
            const rows = 3
            const cellW = 240
            const cellH = 160
            const gapX = 35
            const gapY = 65
            const startX = 40
            const startY = 75

            for (let r = 0; r < rows && currentPhotoIndex < pataPataImages.length; r++) {
              for (let c = 0; c < cols && currentPhotoIndex < pataPataImages.length; c++) {
                const photo = pataPataImages[currentPhotoIndex]
                const x = startX + c * (cellW + gapX)
                const y = startY + r * (cellH + gapY)

                // Marco de la celda de la imagen
                doc.rect(x - 2, y - 2, cellW + 4, cellH + 4).lineWidth(0.5).strokeColor('#e2e8f0').stroke()

                // Insertar imagen usando fit para conservar aspect ratio sin deformar
                try {
                  doc.image(photo.buffer, x, y, {
                    fit: [cellW, cellH],
                    align: 'center',
                    valign: 'center'
                  })
                } catch (imgErr) {
                  doc.rect(x, y, cellW, cellH).fill('#f1f5f9')
                  doc.fillColor('#ef4444')
                    .fontSize(8)
                    .font('Roboto-Bold')
                    .text('[Error al cargar imagen]', x, y + cellH / 2 - 4, { align: 'center', width: cellW })
                }

                // Metadata de la imagen debajo
                doc.fillColor('#475569')
                  .fontSize(7)
                  .font('Roboto-Bold')
                  .text(`Pallet: ${photo.name.replace(/\.[^/.]+$/, "").substring(0, 28)}`, x, y + cellH + 6, { width: cellW, lineBreak: false })
                
                doc.fillColor('#94a3b8')
                  .fontSize(6)
                  .font('Roboto')
                  .text(`Fecha: ${photo.date}`, x, y + cellH + 16, { width: cellW })

                currentPhotoIndex++
              }
            }
          }
        }


        // --- PÁGINA DE FOTOS DE TERMÓGRAFOS ---
        if (thermographImages.length > 0) {
          doc.addPage()

          // Cabecera
          doc.fillColor('#1e3a8a')
            .fontSize(12)
            .font('Roboto-Bold')
            .text('REGISTRO FOTOGRÁFICO: TERMÓGRAFOS / TEMPERATURE LOG', 40, 40)
          
          doc.moveTo(40, 55).lineTo(555, 55).lineWidth(1).strokeColor('#cbd5e1').stroke()

          // Renderizar termógrafos uno al lado del otro
          const cellW = 240
          const cellH = 180
          const startY = 85

          let idx = 0
          for (const photo of thermographImages.slice(0, 2)) {
            const x = idx === 0 ? 40 : 315

            // Marco
            doc.rect(x - 2, startY - 2, cellW + 4, cellH + 4).lineWidth(0.5).strokeColor('#e2e8f0').stroke()

            try {
              doc.image(photo.buffer, x, startY, {
                fit: [cellW, cellH],
                align: 'center',
                valign: 'center'
              })
            } catch (imgErr) {
              doc.rect(x, startY, cellW, cellH).fill('#f1f5f9')
              doc.fillColor('#ef4444')
                .fontSize(8)
                .font('Roboto-Bold')
                .text('[Error al cargar imagen]', x, startY + cellH / 2 - 4, { align: 'center', width: cellW })
            }

            doc.fillColor('#475569')
              .fontSize(8)
              .font('Roboto-Bold')
              .text(photo.name.replace(/\.[^/.]+$/, "").substring(0, 32), x, startY + cellH + 8, { width: cellW, lineBreak: false })
            
            doc.fillColor('#94a3b8')
              .fontSize(7)
              .font('Roboto')
              .text(`Registrado: ${photo.date}`, x, startY + cellH + 20, { width: cellW })

            idx++
          }
        }


        // --- PÁGINAS DE OTROS RESPALDOS (SI SON IMÁGENES: GRID 2x2) ---
        if (backupImages.length > 0) {
          doc.addPage()

          // Cabecera
          doc.fillColor('#1e3a8a')
            .fontSize(12)
            .font('Roboto-Bold')
            .text('REGISTRO FOTOGRÁFICO: OTROS / RESPALDOS ADICIONALES', 40, 40)
          
          doc.moveTo(40, 55).lineTo(555, 55).lineWidth(1).strokeColor('#cbd5e1').stroke()

          let currentBackPhotoIndex = 0
          const cols = 2
          const rows = 2
          const cellW = 240
          const cellH = 160
          const gapX = 35
          const gapY = 65
          const startX = 40
          const startY = 85

          for (let r = 0; r < rows && currentBackPhotoIndex < backupImages.length; r++) {
            for (let c = 0; c < cols && currentBackPhotoIndex < backupImages.length; c++) {
              const photo = backupImages[currentBackPhotoIndex]
              const x = startX + c * (cellW + gapX)
              const y = startY + r * (cellH + gapY)

              // Marco
              doc.rect(x - 2, y - 2, cellW + 4, cellH + 4).lineWidth(0.5).strokeColor('#e2e8f0').stroke()

              try {
                doc.image(photo.buffer, x, y, {
                  fit: [cellW, cellH],
                  align: 'center',
                  valign: 'center'
                })
              } catch (imgErr) {
                doc.rect(x, y, cellW, cellH).fill('#f1f5f9')
                doc.fillColor('#ef4444')
                  .fontSize(8)
                  .font('Roboto-Bold')
                  .text('[Error al cargar imagen]', x, y + cellH / 2 - 4, { align: 'center', width: cellW })
              }

              doc.fillColor('#475569')
                .fontSize(8)
                .font('Roboto-Bold')
                .text(photo.name.replace(/\.[^/.]+$/, "").substring(0, 32), x, y + cellH + 8, { width: cellW, lineBreak: false })
              
              doc.fillColor('#94a3b8')
                .fontSize(7)
                .font('Roboto')
                .text(`Cargado: ${photo.date}`, x, y + cellH + 20, { width: cellW })

              currentBackPhotoIndex++
            }
          }
        }


        // --- PIE DE PÁGINA DINÁMICO EN TODAS LAS PÁGINAS ---
        const range = doc.bufferedPageRange()
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i)
          
          // Guardar margen anterior y reducirlo temporalmente a 10 pt para
          // que PDFKit no haga salto automático de página al escribir en y: 812
          const oldBottomMargin = doc.page.margins.bottom
          doc.page.margins.bottom = 10

          // Línea divisoria del pie
          doc.moveTo(40, 805).lineTo(555, 805).lineWidth(0.5).strokeColor('#cbd5e1').stroke()

          doc.fillColor('#94a3b8')
            .fontSize(7)
            .font('Roboto')
            .text(
              `Dossier Consolidado Despacho - Packing Santa Catalina - Código: ${dispatch.dispatch_code}`,
              40,
              812,
              { align: 'left', width: 400 }
            )

          doc.fillColor('#94a3b8')
            .fontSize(7)
            .font('Roboto')
            .text(
              `Página ${i + 1} de ${range.count}`,
              40,
              812,
              { align: 'right', width: 515 }
            )
          
          // Restaurar margen para que el documento no altere su comportamiento general
          doc.page.margins.bottom = oldBottomMargin
        }

        doc.end()
      })
    }

    // Generar el PDF con PDFKit
    const reportPdfBuffer = await generateReportBuffer()

    // 5. Fusionar con el PDF del Pack List (si existe) usando pdf-lib
    let finalPdfBuffer = reportPdfBuffer

    if (packListBuffer) {
      try {
        const mergedPdf = await PDFLibDocument.create()
        
        // Cargar PDF del reporte visual
        const reportPdfDoc = await PDFLibDocument.load(reportPdfBuffer)
        const reportPages = await mergedPdf.copyPages(reportPdfDoc, reportPdfDoc.getPageIndices())
        reportPages.forEach(page => mergedPdf.addPage(page))

        // Cargar PDF de la lista de empaque
        const packListPdfDoc = await PDFLibDocument.load(packListBuffer)
        const packListPages = await mergedPdf.copyPages(packListPdfDoc, packListPdfDoc.getPageIndices())
        packListPages.forEach(page => mergedPdf.addPage(page))

        const mergedPdfBytes = await mergedPdf.save()
        finalPdfBuffer = Buffer.from(mergedPdfBytes)
      } catch (mergeError) {
        console.error('Error al fusionar el PDF del Pack List:', mergeError)
        // Si la fusión falla (ej. Pack List corrupto o formato no compatible), 
        // devolvemos el PDF del reporte visual de forma segura para no romper la experiencia
      }
    }

    // 6. Enviar respuesta binaria con cabeceras de PDF (inline para previsualización en navegador)
    return new NextResponse(new Uint8Array(finalPdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Reporte_Despacho_${dispatch.dispatch_code || dispatch.internal_code}.pdf"`,
        'Content-Length': finalPdfBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      }
    })

  } catch (error: any) {
    console.error('[REPORT-PDF-DISPATCH] Error Crítico:', error)
    return NextResponse.json({
      error: 'Error interno al generar el reporte en PDF',
      details: error.message
    }, { status: 500 })
  }
}
