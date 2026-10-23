# Samadhi Style · tienda online

Tienda propia para **samadhistyle.com.ar**: vidriera con la identidad de Samadhi, panel de administración, cobros con **Mercado Pago** y envíos con **Andreani**. Viene cargada con el catálogo exportado de Tiendanube (201 prendas publicadas, 322 en total) y las fotos de cada producto.

## Qué incluye

**Vidriera** (`/`)
- Banners a pantalla completa que se recorren en vertical (flechas, números, teclado y gesto en el celular), con parallax en la foto al cambiar y al hacer scroll. Se editan desde el panel.
- Categorías con foto, filtros por colección (SS'27 / AW'26), búsqueda, orden y "Sale".
- Ficha con galería, colores y talles según el stock real de cada variante.
- Bolsa y checkout: datos, cotización de Andreani por código postal (domicilio o sucursal), retiro en el local, cupones y pago con Mercado Pago.
- Página de pedido (`/pedido.html`) con el estado y el seguimiento del envío.

**Panel** (`/admin`)
- Resumen: ventas del día, 7 y 30 días, gráfico diario, más vendidos, variantes por agotarse y pedidos para despachar.
- Pedidos: estados, búsqueda, planilla descargable, alta del envío en Andreani, etiqueta para imprimir, seguimiento, devoluciones por Mercado Pago y nota interna.
- Productos: alta y edición con variantes, precio, promoción, stock, SKU, fotos (link o subida), categorías y medidas del paquete. Acciones en bloque (publicar, ocultar, destacar, aplicar % de descuento).
- Stock y precios en planilla, categorías, clientes, cupones, banners, importación desde Tiendanube, configuración y usuarios del panel.

**Ingreso y roles**
- Un solo botón **Ingresar** en la tienda: el equipo entra al panel y las clientas a **Mi cuenta** (sus pedidos con estado y seguimiento, y sus datos). Las clientas también pueden crear su cuenta, y si están ingresadas el checkout se completa solo.
- **Administrador:** todo el panel.
- **Gerente de tienda:** pedidos (estados, envíos, notas), productos, stock, categorías, clientes, cupones y banners. No ve configuración, importación ni usuarios, y no puede devolver dinero ni eliminar productos.
- Los usuarios del equipo y su rol se manejan en *Usuarios*.

**Automático**
- El stock se descuenta cuando Mercado Pago aprueba el pago (una sola vez, aunque el aviso llegue repetido) y se repone si se cancela o se devuelve.
- Los pedidos que no se pagan en 72 horas se cancelan solos.
- 20 emails automáticos: bienvenida, contraseña, pedido recibido, datos de transferencia, pago acreditado o rechazado, preparación, envío con seguimiento, listo para retirar, entregado, cancelado, devolución y avisos al equipo (ver **Emails**).
- “Tenés un carrito esperándote”: 1 hora después de dejar la bolsa y un último aviso a las 48 horas, con el enlace que arma la bolsa tal como estaba.
- Stock sincronizado con Lince / Dragonfish (ver **Conectar Lince**).
- Probador virtual propio: la clienta sube una foto (o usa la cámara) y ve la prenda puesta, sin que la foto salga de su celular (ver **Probador virtual**).
- Seguir mi pedido (número + email), reseñas de Google, preguntas frecuentes en la home, términos y condiciones, política de cambios y Botón de arrepentimiento.
- Estadísticas con filtro de fecha: ventas, ticket promedio, clientas nuevas, lo más vendido, categorías, medios de pago, envíos, provincias y cupones.

## Probarla en tu compu

Necesitás [Node.js](https://nodejs.org) 22.13 o más nuevo.

```bash
npm install
cp .env.example .env        # completá ADMIN_EMAIL y ADMIN_PASSWORD
npm start
```

Abrí http://localhost:3000 para la tienda y http://localhost:3000/admin para el panel.

Sin credenciales, todo funciona en **modo prueba**: Andreani cotiza con una tabla de ejemplo y el pago se reemplaza por una pantalla de "pago simulado". Así podés recorrer una compra entera y despacharla desde el panel sin cobrar nada.

Para recorrer la tienda con cada rol, creá los usuarios de prueba:

```bash
npm run demo-users
```

| Rol | Email | Contraseña |
|---|---|---|
| Administrador | admin@samadhistyle.com.ar | SamadhiAdmin2026 |
| Gerente de tienda | gerente@samadhistyle.com.ar | SamadhiGerente2026 |
| Cliente | cliente@samadhistyle.com.ar | SamadhiCliente2026 |

**Antes de publicar la tienda, borralos** con `npm run demo-users -- --borrar` y creá los usuarios reales desde *Usuarios* en el panel.

`npm test` corre una compra de punta a punta contra una base temporal.

## Conectar Mercado Pago

1. Entrá a [Tus integraciones](https://www.mercadopago.com.ar/developers/panel/app), creá una aplicación de **Checkout Pro** y copiá el **Access Token de producción** en `MP_ACCESS_TOKEN`.
2. En la misma aplicación, en **Webhooks**, pegá la dirección que te muestra el panel en *Configuración → Integraciones* (es `https://tu-dominio/api/webhooks/mercadopago`), elegí el evento **Pagos** y copiá la **clave secreta** en `MP_WEBHOOK_SECRET`.
3. Reiniciá la tienda. En *Configuración* tiene que decir "conectado".

## Conectar Andreani

1. Pedile a tu ejecutivo de cuenta de Andreani el **usuario y contraseña de la API**, tu **número de cliente** y los **contratos** de envío a domicilio y a sucursal. Completalos en `ANDREANI_*`.
2. En el panel, *Configuración → Origen de los envíos*, cargá la dirección desde donde despachás y los datos del remitente (Andreani los pide en cada alta).
3. Usá **Probar cotización** para confirmar que responde.

Para despachar: en el pedido pagado tocá **Crear envío en Andreani**, después **Imprimir etiqueta** y, cuando lo entregues, **Marcar despachado** (le llega el mail con el seguimiento a la clienta).

> Si Andreani te dio credenciales del entorno de pruebas, poné `ANDREANI_ENV=qa` mientras probás.

## Demo en Vercel (dominio temporal)

El repositorio trae `vercel.json`: Vercel corre `npm run build:demo`, que importa el catálogo y arma la **versión demo** (la misma de la vista previa) en `dist/demo`. Tienda, panel con los tres usuarios de prueba y probador en modo prueba funcionan con datos de ejemplo guardados en el navegador de cada visitante; no cobra ni guarda pedidos reales. Las fotos se cargan desde el CDN de Tiendanube.

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importá este repositorio de GitHub.
2. Dejá todo como viene (Vercel lee `vercel.json`) y tocá **Deploy**. Queda en `https://<proyecto>.vercel.app`.
3. Cada push a `main` vuelve a publicar la demo.

Para la tienda real (cobros, pedidos, stock) hace falta un servidor con disco o una base en la nube: ver **Publicarla en samadhistyle.com.ar**.

## Publicarla en samadhistyle.com.ar

Es una app de Node con la base de datos en un archivo (`data/samadhi.db`). Sirve cualquier servicio que corra Node y tenga **disco persistente**: Railway, Render, Fly.io o un servidor propio.

1. Subí esta carpeta (sin `node_modules` ni `.env`).
2. Comando de inicio: `npm start`. Configurá las variables del `.env` en el panel del servicio, con `PUBLIC_URL=https://www.samadhistyle.com.ar` y `NODE_ENV=production`.
3. Montá un disco en la carpeta `data/` (o apuntá `DATA_DIR` a ese disco) para que los pedidos y las fotos subidas no se pierdan en cada actualización.
4. Apuntá el dominio al servicio desde tu proveedor de DNS. Hasta que hagas el cambio, tu tienda de Tiendanube sigue funcionando.
5. Antes de dar de baja Tiendanube, corré `npm run download-images` para copiar las fotos a tu servidor.

**Copias de seguridad:** guardá periódicamente `data/samadhi.db` y la carpeta `data/uploads`.

## Emails

Se configuran en el panel → **Emails**: activar o desactivar cada uno, verlos, mandarte una prueba y ajustar los tiempos. Para que salgan de verdad, completá `SMTP_URL` en `.env` (sin eso quedan generados en el historial).

Recordatorios (revisados cada 10 minutos):

| Email | Cuándo |
|---|---|
| Tenés un carrito esperándote | 1 h después de dejar la bolsa sin comprar |
| Último aviso del carrito | 48 h después de dejar la bolsa |
| Pago pendiente (Mercado Pago) | 24 h después de crear el pedido |
| Reserva por transferencia por vencer | 12 h antes de que venza |
| Pedido listo sin retirar | 3 días después |

Los dos emails de carrito traen el botón **Volver a mi bolsa** y el enlace visible: abre la tienda con las mismas prendas en la bolsa. La bolsa se guarda cuando la clienta inició sesión o escribió su email en el checkout. Si compra, si vacía la bolsa o si se da de baja con el link del pie, no le llegan más.

## Conectar Lince (Dragonfish, de Zoo Logic)

El local manda: la tienda toma stock (y si querés, precios) de Dragonfish y lo cruza por **Artículo + Color + Talle** con el campo *Artículo* de cada producto (ya viene cargado desde Tiendanube, ej. `S27VE66`). Las ventas web pagadas se descuentan hasta que se marcan como cargadas en Lince, para no vender dos veces la misma prenda.

1. Pedile a Zoo Logic que active el **Servicio REST API** de Dragonfish y te pase el **IdCliente** y el **token**. Confirmá con ellos el nombre del servicio de stock (por defecto `ConsultaStockYPrecios`) y si existe uno para cargar pedidos.
2. Elegí cómo se conecta:
   - **Agente en el local (lo más común):** la API de Dragonfish suele quedar sólo en la PC del local. Inventá una clave larga, ponela en `LINCE_SYNC_SECRET` del `.env` y seguí `lince/LEEME.txt` para instalar el programita en esa PC.
   - **Directo:** si Dragonfish es accesible desde internet, completá `DRAGONFISH_URL`, `DRAGONFISH_ID_CLIENTE` y `DRAGONFISH_TOKEN`. La tienda lo lee sola cada 30 minutos.
3. En el panel → **Lince** ves cada lectura, lo que no se pudo cruzar y los pedidos web para cargar.

Sin claves queda en modo prueba: “Sincronizar ahora” simula una lectura con el stock actual.

## Probador virtual

### Google Gemini (el que viene elegido)
La clienta sube su foto, elige la prenda y Gemini genera una foto nueva de ella con la prenda puesta (pliegues, luz y cuerpo reales), en unos 10–20 segundos. Cuesta entre USD 0,03 y 0,07 por imagen según el modelo; no hay uso gratis para imágenes.

1. Entrá a [Google AI Studio](https://aistudio.google.com) con la cuenta de la tienda → **Get API key** → **Create API key**, y activá la facturación del proyecto (sin facturación no genera imágenes).
2. **Tienda real:** poné la clave en `GEMINI_API_KEY` del `.env` y reiniciá.
3. **Demo de Vercel:** en el proyecto de Vercel → **Settings → Environment Variables** → agregá `GEMINI_API_KEY` y volvé a publicar (Deployments → ⋯ → Redeploy). La demo usa la función `api/probador.js`.
4. Sin clave, o si Gemini no responde, la tienda usa sola el motor propio (el de abajo) y lo avisa.

La foto de la clienta viaja a Google sólo para generar la imagen; la tienda no la guarda. Con facturación activa, Google no usa ese contenido para mejorar sus productos. El modelo se puede cambiar con `GEMINI_IMAGE_MODEL` (por defecto `gemini-2.5-flash-image`).


En cada prenda aparece **Probátelo** y en el menú, **Probador**. Hay dos motores; se elige en Panel → Probador → Ajustes.

### Motor Samadhi (propio, el que viene activado)
Funciona entero en el navegador de la clienta: **la foto nunca sale de su celular**, no hay costo por prueba ni servicios externos.

1. **Prendas preparadas.** Cada prenda se recorta de la foto del producto (la modelo con la prenda puesta): se detecta el cuerpo, se queda con la zona de la prenda según su tipo (arriba, abajo o entera) y saca cabeza, manos, pelo y piel. Se guarda el recorte con transparencia y los puntos del cuerpo de la modelo (hombros, codos, cadera, rodillas, tobillos).
2. **La clienta sube su foto** de cuerpo entero (o usa la cámara como espejo en vivo). Se detectan sus puntos del cuerpo.
3. **La prenda se calza** deformándola con una malla (thin-plate spline) que lleva los puntos de la modelo a los de la clienta, con sombra y con la cara y las manos por delante.
4. Puede **ajustar** tamaño, largo y posición, **armar un look** (por ejemplo, blusa + jean: una prenda entera reemplaza a las de arriba y abajo), comparar con su foto original y pasar directo a la bolsa con el talle.

Usa MediaPipe Pose (Google, Apache-2.0), servido desde la tienda en `public/vendor/mediapipe-pose`. El catálogo viene con 159 prendas recortadas en `public/probador` (85 revisadas y visibles). En **Panel → Probador → Prendas** ves cada recorte, lo ocultás o mostrás, corregís el tipo, lo rehacés eligiendo otra foto o preparás de una vez las prendas nuevas (el recorte se hace en el navegador de quien administra y se guarda en la tienda). Accesorios, calzado y fotos sin modelo no se pueden probar.

Es una simulación 2D: muestra bien combinaciones, colores y largos; el calce fino depende del talle. Funciona mejor con fotos de frente, buena luz, fondo liso y ropa ajustada.

### Motor FASHN (opcional, IA generativa)
Imagen fotorrealista en unos 8 segundos, 1 crédito por prueba. Creá una cuenta en [FASHN](https://fashn.ai), cargá créditos y poné la clave en `FASHN_API_KEY`. La foto viaja al servicio sólo para generar la imagen; FASHN la borra al terminar y no la usa para entrenar. Hay límite diario y por persona para controlar el gasto.

## Seguir mi pedido, reseñas y textos legales

- **Seguir mi pedido** (pie de página, preguntas frecuentes y Mi cuenta): con número de pedido y email muestra el estado paso a paso y el recorrido de Andreani.
- **Reseñas de Google**: completá `GOOGLE_PLACES_API_KEY` y `GOOGLE_PLACE_ID` (el ID de la ficha de Google del local). Se muestran en la home con la nota promedio y el botón para dejar una reseña. Sin esos datos la sección no aparece.
- **Panel → Contenido**: editás las preguntas frecuentes, los términos y condiciones y la política de cambios. Completá los datos entre corchetes (razón social, CUIT, domicilio) y que los revise quien asesora a la tienda.
- **Botón de arrepentimiento** (Res. 424/2020): en el pie de todas las páginas. La clienta recibe al instante su código de trámite por email y el pedido aparece en **Panel → Arrepentimientos**.

## Actualizar el catálogo desde Tiendanube

Mientras sigas cargando productos en Tiendanube, exportá el CSV (*Productos → Exportar*) y subilo en el panel en **Importar**. Se actualizan precios, promociones y stock por variante y se agregan los productos nuevos.

## Estructura

```
server/            API, base de datos e integraciones
  integrations/    mercadopago.js · andreani.js · dragonfish.js (Lince) · fashn.js (probador FASHN)
  routes/          store.js (tienda) · admin.js (panel) · webhooks.js
public/            vidriera (index.html, pedido.html)
admin/             panel de administración
lince/             agente para la PC del local (Windows)
scripts/           importar, crear usuario, copiar fotos
data/import/       CSV de Tiendanube y lista de fotos por producto
test/              prueba de punta a punta
```
