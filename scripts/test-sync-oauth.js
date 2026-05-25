const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
}

const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const { Readable } = require('stream');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Faltan variables de Supabase.");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

async function getDriveClient() {
  const { data: settings, error } = await supabaseAdmin
    .from('system_settings')
    .select('value')
    .eq('key', 'google_drive_tokens')
    .single();

  if (error || !settings || !settings.value) {
    throw new Error('La sincronización de Google Drive no está configurada o no se encontraron los tokens.');
  }

  const tokens = settings.value;

  if (!tokens.access_token && !tokens.refresh_token) {
    throw new Error('Los tokens de Google Drive son inválidos.');
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  auth.setCredentials(tokens);

  return google.drive({ version: 'v3', auth });
}

async function uploadFile(buffer, fileName, mimeType, parentId) {
  const drive = await getDriveClient();
  
  const fileMetadata = {
    name: fileName,
    parents: [parentId],
  };

  const media = {
    mimeType,
    body: Readable.from(buffer),
  };

  console.log(`[DRIVE] Subiendo archivo: ${fileName} en carpeta ${parentId}...`);

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, webViewLink',
    supportsAllDrives: true, 
  });

  console.log(`[DRIVE] ✅ Subido con éxito. ID: ${file.data.id}`);

  return {
    id: file.data.id,
    url: file.data.webViewLink,
  };
}

async function testSync() {
  try {
    console.log("Iniciando prueba de sincronización OAuth de Drive...");
    
    // Obtener documentos pendientes de despachos
    const { data: docs, error } = await supabaseAdmin
      .from('dispatch_documents')
      .select('*')
      .is('drive_file_id', null);

    if (error) throw error;
    
    console.log(`Encontrados ${docs.length} documentos pendientes.`);

    for (const doc of docs) {
      console.log(`\n--- Procesando: ${doc.original_file_name} ---`);
      console.log(`Storage Path: ${doc.storage_path}`);
      
      // Descargar de Supabase Storage
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from('documentos')
        .download(doc.storage_path);

      if (downloadError) {
        console.error(`❌ Error al descargar de storage:`, downloadError);
        continue;
      }

      console.log(`Descargado de Storage con éxito. Tamaño: ${fileData.size} bytes`);
      
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Obtener carpeta de destino
      const { data: dispatch, error: dispatchError } = await supabaseAdmin
        .from('dispatches')
        .select('drive_folder_id')
        .eq('id', doc.dispatch_id)
        .single();

      if (dispatchError || !dispatch) {
        console.error(`❌ Error al obtener despacho:`, dispatchError);
        continue;
      }

      console.log(`Folder de destino en Drive: ${dispatch.drive_folder_id}`);

      if (!dispatch.drive_folder_id) {
        console.error("❌ El despacho no tiene carpeta asociada en Google Drive.");
        continue;
      }

      // Intentar subir a Drive
      try {
        const driveFileName = `v${doc.version_number}_${doc.original_file_name}`;
        const driveFile = await uploadFile(buffer, driveFileName, fileData.type, dispatch.drive_folder_id);
        console.log(`✅ Subida de prueba exitosa a Drive. ID: ${driveFile.id}`);
        
        // Actualizar base de datos
        const { error: updateError } = await supabaseAdmin
          .from('dispatch_documents')
          .update({
            drive_file_id: driveFile.id,
            drive_file_url: driveFile.url
          })
          .eq('id', doc.id);

        if (updateError) {
          console.error("❌ Error al actualizar registro en base de datos:", updateError);
        } else {
          console.log("🎉 Registro actualizado en la BD de Supabase!");
        }
      } catch (uploadError) {
        console.error("❌ ERROR DURANTE LA SUBIDA A DRIVE:", uploadError.message);
        if (uploadError.response) {
          console.error("Detalles de respuesta de Google API:", JSON.stringify(uploadError.response.data));
        }
      }
    }
  } catch (err) {
    console.error("❌ Error general:", err);
  }
}

testSync();
