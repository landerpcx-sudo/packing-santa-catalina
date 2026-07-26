# Pasos para poner en marcha las Fases 0 y 1

> ⚠️ **Orden obligatorio: primero el SQL, después el despliegue.**
> El código nuevo consulta columnas que todavía no existen en la base de datos.
> Si se despliega antes de ejecutar el SQL, los listados de documentos darán error.
> Ninguna de estas migraciones borra nada: solo agregan columnas y funciones.

---

## Paso 1 — Ejecutar el SQL en Supabase

Entra a [supabase.com](https://supabase.com) → proyecto `hbejiluvefmmyyuamlgs` → **SQL Editor** →
**New query**. Pega y ejecuta cada archivo, uno a la vez y en este orden:

1. `app/supabase/migration_fase0_blindaje.sql`
   Crea la papelera (`deleted_at`) y las funciones que permiten medir el
   almacenamiento y detectar archivos huérfanos.

2. `app/supabase/migration_fase1_liquidacion_completa.sql`
   Agrega a la liquidación la moneda de destino, la moneda de la factura FOB y su
   equivalencia. Hasta ahora esos tres datos se escribían en pantalla pero no se
   guardaban en ninguna parte.

Cada archivo termina con una consulta de verificación comentada; puedes
descomentarla y ejecutarla para confirmar que quedó todo bien.

---

## Paso 2 — Desplegar

```bash
git add -A && git commit -m "Fase 0: blindaje de documentos + Fase 1: informe financiero" && git push origin main
```

Vercel despliega solo a producción.

---

## Paso 3 — Comprobar en producción (5 minutos)

1. **Configuración → Salud de los Documentos.** Debe aparecer el panel nuevo con
   cuántos documentos hay, cuántos están respaldados en Drive y si hay archivos
   huérfanos. Si dice que falta ejecutar la migración, el Paso 1 no se completó.

2. **Pulsa "Revisar sin tocar nada"** en el rescate de subidas interrumpidas.
   Te dirá si hay archivos guardados sin registro. No modifica nada: solo informa.
   Si aparece alguno, el botón verde los reincorpora.

3. **Cron de Drive.** En Vercel → proyecto → *Logs*, filtra por `/api/cron/sync-drive`.
   Corre cada hora en punto. Antes de este cambio devolvía una redirección a
   `/login` y nunca llegaba a ejecutarse; ahora debe responder `ok: true`.

4. **Un despacho cualquiera.** Comprueba las tres pestañas nuevas
   (Documentos · Financiero · Informes) y que el menú "Acciones" tenga todo lo
   que antes eran nueve botones sueltos.

5. **El informe financiero.** En la pestaña Financiero, botón
   **"Ver Informe Financiero (PDF)"**: guarda el borrador y abre una pestaña con
   el PDF. Ahí están la vista previa, el botón de imprimir y el de descargar.
   El texto debe verse nítido y poder seleccionarse con el mouse — si se ve
   borroso o no se puede seleccionar, avísame.

6. **La papelera.** Elimina un documento de prueba, comprueba que desaparece de la
   ficha, ve a Configuración → Salud de los Documentos → Papelera, y restáuralo.
   Debe volver a su sitio intacto.

---

## Qué cambió, en corto

| Antes | Ahora |
|---|---|
| La limpieza podía borrar todas las copias de Supabase de una pasada | Descuenta el tamaño real de cada archivo y verifica en Drive antes de tocar nada |
| Cualquiera con la contraseña del código podía disparar la purga por URL | Solo administrador, desde la app, y por defecto solo simula |
| El cron horario de respaldo a Drive quedaba bloqueado por el proxy | Pasa; sigue protegido por su propio `CRON_SECRET` |
| Eliminar destruía el documento en los tres sitios a la vez | Va a una papelera de 30 días; se restaura con un clic |
| Una subida interrumpida dejaba un archivo invisible para siempre | Se detecta y se reincorpora desde el panel de salud |
| Imprimir el informe sacaba el despacho entero | Sale solo el informe financiero |
| "Descargar PDF" generaba fotos del HTML | PDF real, con texto nítido y seleccionable |
| 9 botones sueltos en la cabecera | 2 + un menú de acciones, con barra de progreso |
| Todo en un scroll único | Tres pestañas: Documentos · Financiero · Informes |
| Cinco copias del listado de documentos | Un solo componente compartido |
| Moneda de destino y FOB se perdían al recargar | Se guardan en la base de datos |
