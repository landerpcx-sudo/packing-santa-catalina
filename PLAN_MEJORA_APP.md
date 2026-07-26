# Plan de Mejora — Plataforma de Control Documental Santa Catalina

**Fecha:** 26 de julio de 2026
**Versión objetivo:** v2 — "Cómoda para todos, sin perder un solo papel"

---

## Regla de oro

> **Ningún documento ya subido se pierde, se sobrescribe ni se degrada.**

Todo lo que sigue está subordinado a esa regla. Antes de tocar una sola pantalla, la Fase 0
blinda los archivos que ya existen. Ninguna fase posterior borra, mueve ni reescribe archivos
almacenados: solo agrega capas de protección y cambia cómo se ven y se usan.

**Compromisos concretos durante todo el plan:**

1. Ninguna migración de base de datos elimina columnas ni tablas. Solo se **agregan** campos.
2. Ningún cambio renombra ni reubica archivos existentes en Supabase Storage ni en Google Drive.
3. Antes de cada fase se hace una exportación de respaldo de las tablas de documentos
   (`lot_documents`, `dispatch_documents`, `temperature_documents`, `client_documents`).
4. Cada fase se despliega por separado y se verifica en producción antes de empezar la siguiente.
5. El borrado definitivo deja de existir como acción directa: pasa a ser papelera con recuperación.

---

## Parte 1 — Diagnóstico: lo que encontré revisando la app completa

### 🔴 Riesgos para la regla de oro (atender primero)

**R1. La limpieza de almacenamiento puede borrar TODOS los archivos de Supabase de una vez.**
En `src/lib/storage-cleanup.ts:74-96` el bucle recorre los documentos borrándolos mientras
`currentSizeMB > TARGET_MB`, pero **`currentSizeMB` nunca se actualiza dentro del bucle**. Es decir:
si alguna vez se cruza el umbral de 50 GB, la condición de corte no se cumple nunca y el proceso
borra de Supabase **todos** los documentos que tengan `drive_file_id`, no solo los necesarios.
Además, no verifica que el archivo siga existiendo realmente en Drive: si alguien vació la papelera
de Drive, ese documento desaparece de los dos lados.
Hoy el uso es de ~182 MB, así que la mina no ha explotado. Pero está armada.

Agravante: `src/app/api/admin/cleanup-storage/route.ts:25-35` expone un `GET` que dispara la misma
purga con una contraseña escrita en el código fuente (`santa-catalina-clean-2026`).

**R2. El respaldo automático a Google Drive muy probablemente no se está ejecutando.**
El cron horario (`vercel.json` → `/api/cron/sync-drive`) es la red de seguridad que garantiza que
todo archivo llegue a Drive aunque falle la subida del momento. Pero `src/proxy.ts:5` solo deja
pasar sin sesión a `/login`, `/api/auth/login`, `/api/auth/google`, `/sw.js` y `/manifest.json`.
La llamada del cron **no trae cookie de sesión**, así que el proxy la redirige a `/login` antes de
que llegue a la ruta. La ruta ya se protege sola con `CRON_SECRET`, así que la corrección es de una
línea. Hay que confirmarlo mirando los logs de Vercel antes de darlo por hecho.

**R3. Una subida puede quedar "fantasma".**
La carga va en tres pasos: pedir permiso (`/api/upload/presign`) → subir el archivo directo a
Supabase → registrarlo (`/api/upload/confirm`). Si el tercer paso falla (se corta el internet, se
cierra la pestaña, se apaga el teléfono), **el archivo queda guardado pero sin registro**: no
aparece en la app, no se sincroniza a Drive y nadie sabe que existe. El usuario ve un error y vuelve
a subir; el archivo huérfano queda ocupando espacio invisible para siempre.

**R4. El borrado es definitivo y sin vuelta atrás.**
`src/app/api/documentos/[table]/[id]/route.ts` borra la fila de la base, borra el archivo de
Supabase Storage y manda el de Drive a la papelera. Un clic equivocado de un administrador
(el botón del basurero está justo al lado del ojito de "ver") y el documento se fue. Queda registro
en auditoría, pero recuperarlo exige entrar a la papelera de Drive a mano y recrear el registro.

**R5. Las fotos se comprimen de forma irreversible y no se guarda el original.**
`UploadZone.tsx:190-207` reduce toda imagen de más de 200 KB a máximo 1600 px y 0,5 MB.
`PalletUploadZone.tsx:79-93` es aún más agresivo: 1200 px y 0,4 MB. Para una foto de pallet está
bien. Para **un termógrafo o un documento fotografiado con letra chica, puede volverlo ilegible**, y
el original nunca se guarda en ninguna parte. Es pérdida de información, aunque el archivo exista.

**R6. La app no funciona sin señal.**
`public/sw.js` es un service worker vacío que solo reenvía peticiones — existe para que la app se
pueda "instalar" como aplicación, pero **no da nada de funcionamiento offline**. En un packing con
mala cobertura, quien sube fotos desde el teléfono pierde el trabajo cada vez que se cae la señal.

### 🟠 Fricciones de uso que hacen la app incómoda

**U1. Un archivo a la vez.** `UploadZone` y `PalletUploadZone` tienen `maxFiles: 1`. Para 18 fotos
de pallets son 18 ciclos completos de arrastrar-esperar-confirmar. La única pantalla que sí acepta
varios archivos es Clientes. Esta es, de lejos, la queja más cara en tiempo de la operación.

**U2. Avisos del navegador en vez de la interfaz.** Hay **58 `alert()` y 15 `confirm()`** en la app,
mientras existe un componente `Toast` bonito que solo usan 2 pantallas. Los `alert()` bloquean,
se ven feos, en móvil son ventanas del sistema y no se pueden estilar.

**U3. El modo claro es un parche.** Son ~200 líneas de `!important` en `globals.css:138-249` que
reescriben clases de Tailwind. La regla `[data-theme="light"] .text-white { color: #0f172a }`
pega a **todo** `text-white`, incluido el texto blanco dentro de botones de color sólido: en modo
claro, un botón índigo termina con letras azul marino casi ilegibles. Solo el Dashboard está escrito
con variables de tema; el resto de las pantallas son "modo oscuro con parches encima".

**U4. Código repetido = interfaz despareja.** El detalle de despacho (`despachos/[id]/page.tsx`,
1.115 líneas) tiene **cinco copias casi idénticas** del bloque de listado de documentos. Cada copia
se fue tocando por separado y por eso la pantalla se ve desordenada. Lo mismo, en menor medida, en
Lotes y Temperaturas (1.331 líneas).

**U5. Dos puertas al mismo módulo financiero.** Desde la lista de despachos el botón "Finanzas"
abre un modal; desde el detalle, la misma tarjeta va embebida en la página. Además el modal de la
lista **no pasa el `userId`**, así que las liquidaciones guardadas desde ahí quedan sin autor.

**U6. El informe financiero no se puede imprimir bien.** El botón "Imprimir" del informe imprime la
página completa del despacho detrás del modal, y el botón "Descargar PDF" usa una librería que
saca una **foto** del HTML: texto borroso, no seleccionable, cortes a mitad de tabla y dependencia
de una CDN externa.

**U7. Nadie sabe qué le toca hacer hoy.** La pantalla "Pendientes", que es la que responde esa
pregunta, **solo la ve el administrador**. El jefe de frío, calidad, cuadratura, SAG y despacho
entran al Dashboard y tienen que ir módulo por módulo a buscar qué les falta.

**U8. Sin buscador global.** Para encontrar el contenedor MSKU1234567 hay que adivinar en qué
módulo está y usar el filtro de esa pantalla.

**U9. Textos que se ven rotos.** Aparece `$\rightarrow$` (código LaTeX crudo) en tres lugares,
incluido el informe financiero que se imprime y se manda al cliente.

---

## Parte 2 — El plan, fase por fase

### FASE 0 — Blindaje de los documentos existentes
*Primero esto. Nada de lo demás se toca hasta que esté en producción.*

| # | Qué se hace | Por qué |
|---|---|---|
| 0.1 | Corregir el bucle de purga: descontar el tamaño real de cada archivo y verificar en Drive que la copia existe **antes** de borrar de Supabase | Desarma el riesgo de borrado masivo (R1) |
| 0.2 | Eliminar el `GET` con contraseña escrita en el código y dejar la limpieza solo como acción manual de administrador, con resumen previo de qué se va a purgar y confirmación | Nadie dispara una purga por accidente ni desde fuera |
| 0.3 | Dejar pasar `/api/cron/*` en el proxy (la ruta ya valida su propio `CRON_SECRET`) y verificar en los logs de Vercel que la sincronización horaria vuelve a correr | Reactiva la red de seguridad hacia Drive (R2) |
| 0.4 | **Papelera de 30 días**: se agrega el campo `deleted_at`. Eliminar deja de borrar: oculta el documento y lo manda a una papelera desde la que se restaura con un clic. El archivo físico no se toca hasta que pasan 30 días | Un clic equivocado deja de ser catastrófico (R4) |
| 0.5 | **Rescate de subidas fantasma**: tarea que compara los archivos de Supabase Storage contra los registros de la base, y reincorpora automáticamente los archivos que quedaron sin registro | Recupera lo que ya se haya perdido y evita perder más (R3) |
| 0.6 | Panel de administrador "Salud de los documentos": cuántos archivos hay, cuántos ya están en Drive, cuántos pendientes, cuántos huérfanos, con botón de reintento | Deja de ser invisible si algo se está quedando atrás |

**Riesgo de esta fase:** bajo. No modifica archivos existentes, solo agrega columnas y protecciones.

---

### FASE 1 — Despachos: el informe financiero y el orden de la sección
*Ya está decidida y es la que resuelve tu problema inmediato.*

| # | Qué se hace |
|---|---|
| 1.1 | Nueva generación del **informe financiero como PDF real** en el servidor (mismo motor PDFKit y fuentes que ya usa el dossier). El botón guarda el borrador y abre el PDF en una pestaña: vista previa, imprimir y descargar del propio navegador |
| 1.2 | Se retira `html2pdf` y la dependencia de la CDN externa. Se corrige la impresión para que jamás salga la página completa detrás del modal |
| 1.3 | Corregir los `$\rightarrow$` |
| 1.4 | Cabecera del despacho: de 9 botones sueltos a 2 principales + menú "Acciones", más una **barra de progreso** ("8 de 10 requisitos completos") |
| 1.5 | Nombres claros: *Dossier del despacho (fotos + packlist)* · *Informe financiero (PDF)* · *Todos los archivos (.zip)* |
| 1.6 | Tres pestañas: **Documentos · Financiero · Informes**. Los montos de Factura y Abonos suben a una franja propia en Financiero, en vez de estar enterrados dentro de tarjetas de documento |
| 1.7 | Unificar las 5 copias del listado en un solo componente `DocumentList` (de ~1.115 a ~400 líneas) |
| 1.8 | Una sola puerta al módulo financiero: el botón "Finanzas" de la lista lleva a la pestaña, y se corrige el `userId` faltante |

---

### FASE 2 — Subir documentos: que sea cómodo de verdad
*La fase que más tiempo le devuelve a la operación.*

| # | Qué se hace | Impacto |
|---|---|---|
| 2.1 | **Subida múltiple**: arrastrar 18 fotos y que se suban solas, en cola, con barra de progreso individual y reintento por archivo | De 18 ciclos manuales a uno |
| 2.2 | **Cola offline**: si no hay señal, el archivo queda en el teléfono y se sube solo al recuperar conexión. Aviso claro de "3 archivos esperando red" | Se acaba el trabajo perdido en el packing (R6) |
| 2.3 | **Guardar el original**: la copia comprimida se usa para mostrar y para el PDF; el archivo original sube a Drive sin tocar. Y subir el límite de compresión para documentos y termógrafos | Deja de haber pérdida de calidad irreversible (R5) |
| 2.4 | **Zona única inteligente**: una sola caja de arrastre por pestaña, con selector de tipo, en vez de 5 cajas siempre abiertas | Menos scroll, menos error de destino |
| 2.5 | **Confirmación robusta**: si el registro falla, se reintenta solo 3 veces y, si aun así falla, queda en la cola local en vez de perderse | Cierra el hueco de las subidas fantasma (R3) |
| 2.6 | Fotos como **miniaturas en grilla**, no como lista de nombres de archivo | Para verificar fotos, hay que ver las fotos |

---

### FASE 3 — Que la app ayude a decidir, no solo a archivar

| # | Qué se hace |
|---|---|
| 3.1 | **"Mis pendientes" para todos los roles**, no solo administrador: cada persona entra y ve exactamente lo que le toca, con su plazo. La lógica de plazos ya existe en `pendientes/page.tsx`, solo hay que abrirla por rol |
| 3.2 | **Dashboard por rol**: el jefe de frío ve temperaturas y fotos; gerencia ve dinero y despachos en riesgo; SAG ve packlists. Hoy todos ven lo mismo |
| 3.3 | **Buscador global** (una sola caja arriba): busca contenedor, código, cliente o nombre de archivo en todos los módulos |
| 3.4 | **Semáforos con texto**: en vez de tres puntitos de colores, "Faltan 4 fotos de pallet". La información que hoy obliga a abrir cada ficha |
| 3.5 | **Panel de gerencia**: rentabilidad por cliente, por destino y por calibre acumulando las liquidaciones ya cargadas. La app ya tiene los datos; hoy solo los muestra contenedor por contenedor |

---

### FASE 4 — Consistencia visual y de comportamiento

| # | Qué se hace |
|---|---|
| 4.1 | **Modo claro de verdad**: reemplazar los ~200 `!important` por variables de tema, empezando por las pantallas más usadas. Se corrige el texto ilegible dentro de los botones de color |
| 4.2 | **Adiós a `alert()` y `confirm()`**: los 73 avisos del navegador pasan al sistema de Toast y a diálogos propios. Los destructivos piden confirmación escrita |
| 4.3 | **Estados deshabilitados visibles**: en un despacho cerrado los botones se ven apagados con el motivo, en vez de dejarte hacer clic y tirarte un aviso |
| 4.4 | **Permisos en un solo lugar**: hoy las listas de roles están copiadas en decenas de sitios. Un solo helper `puede(usuario, acción)` para toda la app |
| 4.5 | Componentes compartidos (listado de documentos, tarjeta de estado, cabecera de ficha) usados por Lotes, Despachos y Temperaturas |

---

### FASE 5 — Los módulos que quedan

| # | Qué se hace |
|---|---|
| 5.1 | **Temperaturas** (1.331 líneas, la pantalla más pesada): separar calendario, gráfico y listado; el gráfico dibujado a mano pasa a componente reutilizable |
| 5.2 | **Lotes**: mismo tratamiento de pestañas y checklist que Despachos, para que la app se sienta una sola cosa |
| 5.3 | **Clientes**: aprovechar que ya soporta varios archivos y unificarlo con el nuevo sistema de subida |
| 5.4 | **Auditoría**: filtros por persona, acción y fecha, y enlace directo al documento afectado. Hoy es una lista plana |

---

## Parte 3 — Orden sugerido y por qué

```
  FASE 0  ██████  Blindaje          ← primero, sin excepción
  FASE 1  ██████  Despachos + PDF   ← tu problema inmediato
  FASE 2  ██████  Subida cómoda     ← el mayor ahorro de tiempo diario
  FASE 3  ████    Decisiones
  FASE 4  ████    Consistencia
  FASE 5  ███     Resto de módulos
```

- **0 antes que todo** porque cada día que pasa con la purga rota y el cron caído es un día de
  exposición. Son correcciones chicas y de bajo riesgo.
- **2 antes que 3** porque quien sufre a diario es el que sube archivos, no el que consulta.
- **4 puede intercalarse**: cada pantalla que se toque en las fases 1, 2 y 5 se deja ya con el modo
  claro y los avisos corregidos, en vez de hacer una pasada aparte.

---

## Parte 4 — Lo que NO se va a tocar

- La idea de la app: Supabase como almacenamiento operativo, **Google Drive como archivo
  permanente**, y la app como capa de control y trazabilidad. Eso se mantiene y se refuerza.
- La estructura de carpetas de Drive ya creada, ni los nombres de los archivos ya subidos.
- Los códigos internos de lotes, despachos y reportes.
- Las tablas y columnas existentes (solo se agregan campos nuevos).
- El sistema de versiones de documentos ni el detector de duplicados por huella SHA-256 — están
  bien resueltos y son parte de lo que protege la regla de oro.
