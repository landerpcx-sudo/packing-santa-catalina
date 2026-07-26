# Plan Fase 6 — Buscador roto, PDF financiero con datos viejos, y rediseño completo

**Fecha:** 26 de julio de 2026
**Estado:** Puntos 1 y 2 **implementados y verificados** el 26/07/2026 (ver «Resultado» en cada punto).
El punto 3 (rediseño del PDF) sigue pendiente de la respuesta del usuario. El punto 4 (backlog) sigue intacto.

---

## 1. El buscador global no funciona — causa confirmada

### Qué se ve
Al abrir el buscador (clic o Ctrl+K), el cuadro de búsqueda aparece encogido, mal ubicado, sin el fondo oscuro que debería cubrir toda la pantalla — las tarjetas del Dashboard se ven perfectamente a través de donde debería haber un fondo oscuro semitransparente.

### Causa raíz (confirmada leyendo `globals.css`)
En [globals.css:451-471](app/src/app/globals.css:451) hay una regla que aplica `backdrop-filter: blur(20px)` al elemento `<aside>` (la barra lateral):

```css
[data-theme="dark"] aside {
  background: rgba(14, 21, 38, 0.82) !important;
  backdrop-filter: blur(20px) saturate(1.2) !important;
  ...
}
```

`GlobalSearch` (el componente del buscador) está montado **dentro** de ese `<aside>` ([Sidebar.tsx:119](app/src/components/layout/Sidebar.tsx:119)). Por especificación CSS, un elemento con `backdrop-filter` (igual que con `filter`, `transform` o `perspective`) crea un **nuevo contenedor de posicionamiento** para sus descendientes `position: fixed`. Esto significa que el modal `fixed inset-0` del buscador ([GlobalSearch.tsx:88](app/src/components/layout/GlobalSearch.tsx:88)) ya no se posiciona respecto a la ventana del navegador, sino respecto al `<aside>` — una caja de 256px de ancho. Por eso se ve encogido y mal ubicado en vez de cubrir toda la pantalla.

**Este mismo problema NO afecta** a `ConfirmDialog` (montado en la raíz de `app/layout.tsx`, fuera de cualquier `<aside>`) ni a `UploadQueueIndicator` (montado como hermano de `<Sidebar>` en el layout del panel, no dentro de él) — por eso esos sí funcionan bien.

### Bug adicional encontrado de paso: el buscador está montado DOS VECES
`Sidebar.tsx` define `SidebarContent` como una función interna y la usa dos veces — una para el `<aside>` de escritorio ([línea 225](app/src/components/layout/Sidebar.tsx:225)) y otra para el `<aside>` móvil ([línea 261](app/src/components/layout/Sidebar.tsx:261)), ambas visibles/ocultas solo por CSS (`hidden lg:flex` / `lg:hidden`), **no por renderizado condicional**. Como `<GlobalSearch />` vive dentro de `SidebarContent`, React crea **dos instancias independientes** del buscador, cada una con su propio `window.addEventListener('keydown', ...)` para Ctrl+K. Al presionar Ctrl+K se disparan **los dos** modales a la vez, uno de ellos siempre mal posicionado por el bug del punto anterior.

### Cómo arreglarlo (siguiente sesión)
1. **Sacar el modal del buscador del árbol del `<aside>`.** La forma más simple y robusta: que `GlobalSearch` renderice su overlay (`fixed inset-0 ...`) con `createPortal(..., document.body)`, igual que ya hace `Toast.tsx` ([Toast.tsx:151](app/src/components/layout/Toast.tsx:151)). El botón "Buscar..." se queda donde está (dentro del sidebar); solo el `<div className="fixed inset-0 ...">` con el modal se saca vía portal.
2. **Evitar el doble montaje.** Dos caminos, cualquiera sirve:
   - Mover `<GlobalSearch />` a que se monte **una sola vez** en `DashboardLayout` (junto a `UploadQueueIndicator`), en vez de dentro de `SidebarContent`. El botón "Buscar..." de la sidebar pasaría a ser solo un disparador (via un context/estado compartido, o simplemente moviendo el `useState(open)` a un contexto pequeño `GlobalSearchContext` para que el botón en la sidebar y el modal en el layout se coordinen).
   - O más simple: extraer solo el `useEffect` del atajo `Ctrl+K` (el `window.addEventListener`) a un solo lugar (por ejemplo el layout), y que `GlobalSearch` reciba `open`/`setOpen` por props en vez de manejar su propio estado — pero como sigue habiendo 2 instancias del componente completo mientras siga dentro de `SidebarContent`, el camino más limpio es el primero: un solo `GlobalSearch` en el layout, y que el botón de la sidebar solo dispare un evento/contexto.
3. Después de aplicar el fix, probar en vivo: abrir con clic y con Ctrl+K, escribir un código de despacho/lote real, confirmar que aparecen resultados y que al hacer clic navega correctamente (la lógica de fetch y navegación en sí no se ha podido probar en vivo — el bug visual ya bastaba para no poder usar el buscador, pero conviene revisar igual `handleSearch`/`irA` en [GlobalSearch.tsx](app/src/components/layout/GlobalSearch.tsx) por si hay algo más).

### ✅ Resultado (26/07/2026) — ARREGLADO Y MEDIDO EN EL NAVEGADOR

`GlobalSearch.tsx` se reescribió siguiendo el mismo patrón que `Toast.tsx`: un
`GlobalSearchProvider` (montado una sola vez en `(dashboard)/layout.tsx`) que
guarda el estado, escucha Ctrl+K una única vez y dibuja el modal con
`createPortal(..., document.body)`. En el sidebar solo queda el botón disparador.

**La causa raíz era algo distinta de lo diagnosticado aquí**, y se comprobó midiendo
en el navegador en vez de deducirlo del CSS:

- El `backdrop-filter` del `<aside>` **no se estaba aplicando en absoluto**: Lightning
  CSS (el compilador de Tailwind 4) trata `backdrop-filter` y `-webkit-backdrop-filter`
  como la misma propiedad y se quedaba solo con la última escrita, la `-webkit-`, que
  Chrome moderno ya no reconoce. Comprobado sobre el CSS compilado: 0 apariciones de la
  propiedad estándar. Es decir, el efecto vidrio del sidebar y de las tarjetas llevaba
  tiempo muerto sin que nadie lo notara. Se corrigió borrando los duplicados `-webkit-`
  de `globals.css` (el compilador prefija solo); el build ya emite ambas versiones.
- El ancestro que de verdad rompía el modal era el **`<aside>` móvil**, que lleva
  `translate-x-0 / -translate-x-full`, o sea `transform` — que también crea contenedor
  de posicionamiento para hijos `fixed`. Y como el buscador estaba montado dos veces,
  Ctrl+K abría los dos modales, quedando encima el confinado a 288 px. Eso explica
  exactamente el «encogido y mal ubicado».

**Mediciones tras el fix** (probe temporal con un `<aside>` real, ya borrado):
- Un `fixed inset-0` **dentro** del aside con `backdrop-filter`: 256×720 px (confinado, el bug).
- El overlay del buscador tras el fix: **1280×720 px, `parentElement === document.body`**,
  fuera del aside; el modal centrado (x=384, ancho 512).
- **Un solo** `[role="dialog"]` en el DOM; Ctrl+K alterna abrir/cerrar; Escape cierra y
  libera el bloqueo de scroll del `body`.

Mejoras añadidas de paso: navegación con ↑ ↓ y Enter, colores por variables de tema
(antes el modal estaba fijo en oscuro y se veía mal en modo claro), guardia contra
respuestas lentas que pisaban resultados más nuevos, bloqueo del scroll de fondo,
etiqueta de tipo por resultado y `role="dialog"` + `aria-label`.

También se corrigió que `SidebarContent` estuviera definido como componente **dentro**
del render de `Sidebar`: React lo veía como un tipo nuevo en cada render y remontaba la
barra entera (perdiendo foco y estado) cada vez que cambiaba `mobileOpen` o `isOnline`.

**Queda por probar con sesión iniciada** (yo no puedo entrar): que al escribir un código
real aparezcan resultados y que al pulsarlos navegue bien.

---

## 2. El PDF muestra una utilidad distinta a la de la pantalla

### Qué se ve
En pantalla (`ContainerLiquidationCard`), la utilidad del negocio marca **$6.724,89 USD** (con un FOB facturado > 0 restado). El PDF del mismo despacho marca **$31.167,23 USD** — el número que da cuando el FOB facturado es **$0** (es decir, sin restar nada de FOB).

### Diagnóstico (con evidencia, no solo hipótesis)
Revisé el flujo completo de guardado (`handleOpenFinancialPDF` en [ContainerLiquidationCard.tsx:336](app/src/components/despachos/ContainerLiquidationCard.tsx:336)) y la ruta que persiste la liquidación ([liquidacion/route.ts](app/src/app/api/despachos/[id]/liquidacion/route.ts)): **el código en sí no tiene un bug de lógica** — el payload que se envía sí incluye `advance_amount` (el FOB) con el valor actual de pantalla, la ruta POST sí lo guarda en `dispatch_liquidations.advance_amount`, y el PDF sí lee ese mismo campo (`liq.advance_amount`) para restarlo.

El número exacto del PDF ($31.167,23) coincide EXACTAMENTE con los PDF de prueba que generé yo mismo la sesión anterior, cuando el FOB guardado en la base de datos todavía era $0 (antes de que se cargara un valor real de factura FOB para este despacho). Esto apunta fuerte a que:

> **El PDF que se vio es una pestaña vieja, generada ANTES de que se ingresara/guardara el valor real de FOB**, y no se volvió a pulsar "Ver Informe Financiero (PDF)" después de cargar ese dato. Como el PDF se descarga/abre una vez y queda estático en su propia pestaña, no se actualiza solo si después cambian los números en pantalla.

Esto **no descarta del todo** una condición de carrera real (que el PDF a veces se abra con datos de una fracción de segundo antes de que el guardado termine), así que en la próxima sesión hay que **verificarlo en vivo**, no solo confiar en el análisis de código:

### Cómo verificarlo y blindarlo (siguiente sesión)
1. **Reproducir en vivo**: cargar un FOB real, guardar, y de inmediato pulsar "Ver Informe Financiero (PDF)" **en una pestaña recién abierta** (no reusar una vieja). Confirmar que el número coincide con pantalla.
2. Si coincide → el bug era la pestaña vieja. Igual vale la pena un ajuste de UX: mostrar un aviso claro tipo *"Este PDF se generó con la última liquidación guardada — si cambiaste algo, vuelve a pulsar el botón"*, o (mejor) deshabilitar visualmente el botón mientras `generatingPdf` es true y mostrar un mensaje de éxito claro tras guardar.
3. Si **no** coincide (hay de verdad una condición de carrera) → revisar si Supabase con PgBouncer en modo transacción puede servir una lectura inmediatamente posterior a una escritura desde una conexión distinta con latencia de propagación — solución: que la ruta del PDF, en vez de leer por `dispatch_id` con `.maybeSingle()`, agregue un pequeño reintento (leer, si no coincide con lo recién guardado esperar 300ms y releer) o que el propio botón pase el `liquidation.id` recién devuelto por el POST como query param al PDF y la ruta lo use para pedir esa fila específica en vez de "la última por dispatch_id".
4. Revisar también: ¿qué pasa si el usuario tiene el PDF abierto en una pestaña y edita la liquidación después? Nada — es esperado, un PDF es una foto fija. Pero convendría un mensaje visible en la pantalla de liquidación tipo *"Cambios sin guardar desde la última vez que viste el PDF"* para que nadie mande por error un informe desactualizado a un cliente.

### ✅ Resultado (26/07/2026) — BLINDADO (falta la comprobación en vivo, que necesita sesión)

No se pudo reproducir en vivo porque hace falta entrar con sesión, así que en vez de
esperar se cerró la puerta a las dos causas posibles a la vez:

- **Contra la condición de carrera:** el POST ya devolvía la fila guardada; ahora la
  pantalla toma su `id` y llama al informe como
  `.../reporte-pdf?liq=<id>&v=<hora>`. La ruta del PDF, si recibe `liq`, lee **esa fila
  exacta** en vez de «la última de este despacho» (manteniendo siempre el filtro por
  `dispatch_id`, para que un id ajeno no devuelva datos de otro despacho). El `v` con la
  hora hace además que cada generación sea una URL distinta, para que ningún navegador
  reutilice un PDF ya descargado. (`Cache-Control: no-store` ya estaba.)
- **Contra la pestaña vieja —que sigue siendo la explicación más probable:** la pantalla
  ahora guarda una huella de las cifras con las que generó el último PDF. Si después se
  cambia cualquier valor que salga impreso, aparece un aviso ámbar bien visible
  («el PDF que tienes abierto muestra los números anteriores») y el botón cambia a
  «Regenerar Informe (PDF)» en ámbar. Así nadie envía por error a un cliente un informe
  con la utilidad anterior.

---

## 3. Rediseño visual completo del informe financiero PDF

El usuario pidió explícitamente: *"un rediseño visualmente completo del PDF, que sea interactivo y visualmente fácil, para la toma de decisiones de un exportador."*

### ⚠️ Antes de diseñar: una pregunta que hay que hacerle al usuario
Un PDF **no puede ser interactivo** en el sentido de una app web (no hay React, no hay clics que ejecuten JavaScript ni gráficos que respondan al mouse). Lo que SÍ es técnicamente viable dentro de un PDF generado con PDFKit:

- **Marcadores/índice navegable** (outline): un panel lateral en el lector de PDF con enlaces a cada sección (I, II, III, IV, V) — clic y salta ahí.
- **Hipervínculos internos**: por ejemplo, cada calibre del ranking podría enlazar a su tarjeta en la matriz 2x2.
- **Hipervínculo externo**: un link "Ver esta liquidación en la plataforma" que abra el despacho en la app (útil si el PDF se imprime o se reenvía).
- **Campos de formulario rellenables** (muy inusual para un reporte, probablemente no aplica aquí).

Lo que **no es viable**: gráficos que se puedan interactuar (zoom, hover con tooltip), filtros, ordenar tablas, or actualización en vivo — eso solo existe en la vista de pantalla (`LiquidationReportModal.tsx`), no en el PDF.

**Antes de invertir tiempo en el rediseño, preguntarle al usuario en la próxima sesión**: ¿"interactivo" se refería a marcadores/enlaces dentro del PDF (lo único posible), o en realidad la prioridad es que la **vista en pantalla** (que sí puede ser 100% interactiva) tenga más protagonismo y el PDF sea "solo" el export bonito para imprimir/enviar? Esto cambia bastante el enfoque de la sesión.

### Brief de diseño (asumiendo PDF de alta calidad visual + navegable, no interactivo en el sentido de app)

**Principio rector**: el lector es un exportador o gerente comercial que tiene 30 segundos para decidir algo. La primera página debe responder solo: *¿ganamos o perdimos plata, y por qué calibre?* El resto es detalle de respaldo.

**Página 1 — Portada ejecutiva (rediseñar desde cero)**
- Encabezado igual al actual (logo, folio, estado borrador/finalizado) — eso ya funciona bien.
- Debajo, un **panel de 3-4 métricas grandes en tarjetas** (como un dashboard, no una tabla): Venta Bruta · Utilidad Final · Utilidad/Caja Promedio · Estado de la Factura FOB (pagada/pendiente) — cada una con su color e ícono, tamaño de letra grande (18-24pt), pensado para leerse de un vistazo.
- Un **semáforo visual** (barra de color verde/ámbar/rojo) indicando si el contenedor fue rentable, ajustado, o con pérdida.
- Mini gráfico de barras horizontal comparando los 3-5 mejores calibres, ya en esta página (no esperar a la página 2/3).

**Página 2 — El desglose de venta y gastos** (secciones I y II actuales, con mejor jerarquía tipográfica y más aire entre bloques).

**Página 3 — La cascada financiera** (sección III rediseñada como un **diagrama de cascada (waterfall chart)** real, dibujado con rectángulos de distinta altura y color que van "bajando" desde Venta Bruta hasta Utilidad Final, en vez de solo texto en filas). Esto es lo que más se parece a un "gráfico" de verdad y es el estándar en reportes financieros de exportación.

**Página 4 — Ranking por calibre**, manteniendo la barra ya agregada, pero considerar:
- Agregar una pequeña **columna de semáforo** (punto verde/ámbar/rojo) por fila, además de la barra.
- Marcador/bookmark del PDF apuntando aquí.

**Página 5 — Matriz 2x2 + Dictamen ejecutivo**, manteniendo las cajas de color ya agregadas, con:
- Un **eje visual** (líneas divisorias con flechas y etiquetas "Volumen →" / "Margen ↑") que hoy no está, para que la matriz se lea como gráfico y no como 4 cajas sueltas.

**Sistema tipográfico/color a definir explícitamente** (hoy está bien pero puede refinarse):
- Jerarquía clara de 4 niveles de tamaño (títulos de sección, subtítulos, cifras destacadas, texto de apoyo) — ya existe, formalizarlo en constantes reutilizables.
- Paleta ya alineada con la pantalla (verde=positivo, rojo=negativo/gastos, ámbar=pendiente, índigo=neutro) — mantener.

**Navegación (lo "interactivo" real y viable)**:
- Agregar `doc.outline` (bookmarks) de PDFKit para las 5 secciones.
- Un link en el encabezado "Ver en la plataforma →" apuntando a `https://<dominio>/despachos/{id}?tab=financiero`.

### ✅ Resultado (26/07/2026) — REDISEÑADO Y REVISADO PÁGINA A PÁGINA

El usuario aclaró el alcance: quería **«que se vea espectacular al imprimirlo»**, no
enlaces dentro del PDF. Hecho:

- **Portada ejecutiva nueva** (página 1): cuatro tarjetas de métricas con cifra grande
  (Venta Bruta · Utilidad Final · Utilidad media por caja · Saldo de la factura FOB),
  semáforo de rentabilidad de tres tramos con el que aplica resaltado, la **cascada
  financiera**, las cinco barras de calibres que más aportaron y el dictamen ejecutivo
  (que antes llegaba en la página 3, tarde para quien solo mira la primera).
- **Cascada financiera real**: bloques que bajan desde Venta Bruta hasta Utilidad Final
  pasando por Deducciones y Costo FOB, con línea del cero y guías punteadas. Funciona
  también cuando el contenedor pierde plata (las barras bajan del cero).
- **Marcadores/índice navegable** por sección (I a V) en el lector de PDF.
- **Ejes en la matriz 2x2**: flecha de margen a la izquierda y de volumen abajo, para que
  se lea como matriz y no como cuatro cajas sueltas. Ojo: la columna izquierda es la de
  MAYOR volumen, no al revés.
- Porcentajes con coma decimal (31,6% y no 31.6%), como el resto de cifras del documento.

**Cómo se verificó** — el dibujo del PDF se sacó de la ruta HTTP a `src/lib/informe-financiero-pdf.ts`
(la ruta pasó de 883 a 81 líneas) precisamente para poder generarlo sin base de datos ni
sesión. Con `scripts/previsualizar-informe-financiero.mjs` se generaron y se miraron
página a página cuatro escenarios: normal, **contenedor en pérdida**, **liquidación vacía**
y **34 calibres**. Defectos encontrados y corregidos así:
- la cifra de la barra más alta de la cascada se montaba sobre el borde (se reservaron 14pt de aire arriba);
- la primera fila del ranking se partía en dos líneas (columna «Cajas (%)» de 56 a 62pt);
- la tarjeta de FOB decía «Pendiente de X» mostrando el total facturado, no el saldo;
- el saldo pendiente de factura quedaba descolgado una línea respecto de los abonos;
- los nombres de embalaje del ranking salían alineados a la derecha.

### Alcance sugerido para la sesión de rediseño (referencia previa)
Dado que esto es un cambio grande, sugerido dividir en:
1. Confirmar con el usuario el alcance real de "interactivo" (la pregunta de arriba).
2. Implementar el waterfall visual de la Sección III (el cambio de mayor impacto visual).
3. Agregar bookmarks/outline y el link a la plataforma.
4. Rediseñar la portada con las tarjetas de métricas + semáforo.
5. Ajustes finos de tipografía/espaciado en el resto.
6. **Probar de nuevo descargando el PDF real y leyéndolo byte a byte**, como se hizo esta sesión — no dar por bueno un rediseño sin verlo generado de verdad.

---

## 4. Backlog pendiente de sesiones anteriores (recordatorio, no changes nuevos)

Quedó pendiente y sin tocar, declarado explícitamente al cierre de la sesión de Fases 2-5:

- **~15 diálogos nativos** (`alert`/`confirm`) sin convertir, concentrados en `DocumentScannerModal.tsx` (errores de cámara) y algunas confirmaciones menores.
- **Temperaturas** (`temperaturas/page.tsx`, 1.331 líneas) sin refactorizar — sigue siendo el archivo más pesado de la app.
- **Auditoría**: se agregaron filtros funcionales, pero no se tocó nada más (por ejemplo, un link directo desde cada evento al documento/entidad afectada).

Ninguno de estos es urgente frente a los dos bugs de arriba, pero quedan anotados para no perderlos.

---

## 5. Orden sugerido para la próxima sesión

1. ~~**Arreglar el buscador**~~ — ✅ hecho y verificado el 26/07/2026.
2. ~~**Verificar en vivo el bug del PDF** y aplicar el blindaje~~ — ✅ blindado el 26/07/2026;
   falta solo confirmarlo con sesión iniciada.
3. ~~**Preguntar al usuario** qué entiende por "interactivo"~~ — ✅ respondido: «que se vea
   espectacular al imprimirlo».
4. ~~**Rediseño del PDF**~~ — ✅ hecho y revisado página a página el 26/07/2026.
5. **Backlog de la sección 4** ← **siguiente paso**: los ~15 `alert`/`confirm` nativos que
   quedan (sobre todo en `DocumentScannerModal.tsx`), el refactor de `temperaturas/page.tsx`
   (1.331 líneas) y los enlaces directos desde Auditoría a la entidad afectada.

### Encontrado de paso, sin arreglar (no forma parte de este plan)
- **`login/page.tsx` da error de hidratación en cada carga**: las partículas decorativas
  se posicionan con `Math.random()` durante el render, así que el servidor y el navegador
  generan valores distintos. Es ruido en consola, no rompe nada, pero conviene generarlas
  en un `useEffect` (o con posiciones fijas) para dejar la consola limpia.
