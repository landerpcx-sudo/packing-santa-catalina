# 🚀 Guía de Despliegue: Packing Santa Catalina

Esta guía contiene todo lo que necesitas para lanzar la plataforma hoy mismo. He preparado el repositorio localmente para ti.

## Paso 1: Subir a GitHub
1. Ve a [GitHub.com](https://github.com/new) y crea un nuevo repositorio llamado `packing-santa-catalina`. **No selecciones** "Initialize with README".
2. Abre tu terminal en la carpeta `app` y pega estos comandos (reemplaza `TU_USUARIO`):
   ```bash
   git remote add origin https://github.com/TU_USUARIO/packing-santa-catalina.git
   git branch -M main
   git push -u origin main
   ```

## Paso 2: Conectar Vercel
1. Ve a [Vercel.com](https://vercel.com/new).
2. Importa el repositorio `packing-santa-catalina`.
3. En la sección **Environment Variables**, haz clic en "Paste JSON" o "Paste many" y pega este bloque:

```env
NEXT_PUBLIC_SUPABASE_URL=https://hbejiluvefmmyyuamlgs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiZWppbHV2ZWZtbXl5dWFtbGdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODc2MTIsImV4cCI6MjA5NDQ2MzYxMn0.3dl4o_O9L4GpvkLgjOxWxFcLuw_-isFv314fH0orQgs
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiZWppbHV2ZWZtbXl5dWFtbGdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODg4NzYxMiwiZXhwIjoyMDk0NDYzNjEyfQ.jNPqR4pItC42nPL-qBby6aqIH-uAkhjwiPebxflbR04
JWT_SECRET=PEGAR_AQUI_EL_JWT_SECRET
ROOT_DRIVE_FOLDER_ID=12YRXhHa8Ukv-UXljJCEAnLLLxyyDiQDw
GOOGLE_CLIENT_ID=110554997765-uheonjm9aijtd7aa7mg7fmu8b3igadj1.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=PEGAR_AQUI_EL_GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://CAMBIA_ESTO_DESPUES.vercel.app/api/auth/google/callback
```

## Paso 3: Configurar Google Cloud (El paso que pediste)
1. Una vez que Vercel termine, ve a la pestaña **Domains** en Vercel.
2. Copia tu dominio (ej: `packing-santa-catalina.vercel.app`).
3. Ve a [Google Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials).
4. Edita tu ID de cliente OAuth 2.0.
5. En **Authorized redirect URIs**, añade:
   `https://tu-dominio.vercel.app/api/auth/google/callback`
6. **MUY IMPORTANTE:** Vuelve a Vercel y actualiza la variable `GOOGLE_REDIRECT_URI` con esa misma URL y haz un **Redeploy**.

---
*Hecho con ❤️ por Antigravity*
