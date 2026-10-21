// Textos editables de la tienda: preguntas frecuentes, términos y condiciones y política de cambios.
// Sin dependencias: lo usa el servidor y también la vista previa.
// Los textos legales son un punto de partida: conviene que los revise quien asesora a la tienda.
// Formato simple: "## Título", "### Subtítulo", "- ítem de lista", **negrita** y párrafos separados por una línea en blanco.

export const DEFAULT_FAQ = [
  { q: '¿Cuánto tarda en llegar mi pedido?', a: 'Despachamos en 24 a 48 horas hábiles desde que se acredita el pago. Andreani tarda entre 2 y 4 días hábiles en La Plata, CABA y GBA, y entre 3 y 7 días hábiles en el resto del país. Cuando sale, te mandamos el número de seguimiento por email.' },
  { q: '¿Cómo sigo mi pedido?', a: 'En el pie de la página tocá **Seguir mi pedido** y escribí tu número de pedido (por ejemplo S-1042) y tu email. Ves en qué estado está y, si ya salió, el recorrido del envío de Andreani.' },
  { q: '¿Puedo retirar en el local?', a: 'Sí. Elegí **Retiro en el local** al finalizar la compra y es sin cargo. Te avisamos por email cuando esté listo para pasar a buscarlo.' },
  { q: '¿Qué medios de pago aceptan?', a: 'Pagás con Mercado Pago: tarjetas de crédito y débito, dinero en cuenta y efectivo en puntos de pago. Hay **3 cuotas sin interés** con tarjetas de crédito. También podés pagar por **transferencia bancaria con 10% OFF**.' },
  { q: '¿Cómo funciona el pago por transferencia?', a: 'Al confirmar la compra te mostramos los datos de la cuenta y te los mandamos por email. Reservamos las prendas por 48 horas. Cuando recibimos la transferencia te avisamos y preparamos el pedido. Si querés, mandanos el comprobante por WhatsApp para agilizarlo.' },
  { q: '¿Cómo sé cuál es mi talle?', a: 'Cada prenda indica los talles disponibles. Si tenés dudas, escribinos por WhatsApp al (0221) 5046554 con tus medidas o con un talle que te quede bien de otra marca y te ayudamos a elegir.' },
  { q: '¿Puedo cambiar una prenda?', a: 'Sí, tenés **30 días** desde que la recibís. La prenda tiene que estar sin uso y con sus etiquetas. Podés cambiarla por otro talle, color o prenda, o por un crédito para usar en la tienda. Más detalles en la Política de cambios y devoluciones.' },
  { q: '¿Y si me arrepiento de la compra?', a: 'Tenés **10 días corridos** desde que recibís el pedido para arrepentirte, sin dar explicaciones. Usá el **Botón de arrepentimiento** al pie de la página; te devolvemos el total, incluido el envío.' },
];

export const DEFAULT_TERMS = `## Términos y condiciones

Estos términos regulan las compras en la tienda online de **Samadhi Style** (en adelante, "la tienda"). Al comprar, aceptás estas condiciones. Si tenés alguna duda, escribinos antes de comprar.

### Quiénes somos
Samadhi Style · [Razón social] · CUIT [completar] · [Domicilio del local], La Plata, Provincia de Buenos Aires. WhatsApp (0221) 5046554 · [email de contacto].

### Productos, precios y stock
- Los precios están expresados en pesos argentinos e incluyen IVA.
- Las fotos son ilustrativas; los colores pueden variar levemente según la pantalla.
- Las prendas se venden hasta agotar stock. Si por un error de stock no pudiéramos entregar una prenda ya pagada, te avisamos y te devolvemos el importe completo de esa prenda.
- Las promociones y los cupones tienen las condiciones y la vigencia que se indican en cada caso y no son acumulables, salvo que se aclare lo contrario.

### Medios de pago
- **Mercado Pago:** tarjetas de crédito y débito, dinero en cuenta y otros medios que ofrezca Mercado Pago. Las cuotas sin interés valen para las tarjetas y bancos que indique Mercado Pago al pagar.
- **Transferencia bancaria:** tiene 10% de descuento sobre las prendas. Las prendas se reservan durante 48 horas; si en ese plazo no se acredita la transferencia, el pedido se cancela y el stock se libera.
- El pedido se confirma cuando el pago queda acreditado.

### Envíos y retiro
- Enviamos a todo el país con Andreani, a domicilio o a sucursal. El costo se calcula según el código postal y se muestra antes de pagar.
- Los plazos de entrega son estimados y los informa Andreani. Te mandamos el número de seguimiento por email.
- Revisá que los datos de entrega sean correctos. Si el envío vuelve por un dato erróneo o por ausencia reiterada, el nuevo envío corre por cuenta de quien compra.
- Retiro en el local sin cargo, una vez que te avisamos que el pedido está listo.

### Cambios, devoluciones y derecho de arrepentimiento
Se rigen por nuestra **Política de cambios y devoluciones**, que forma parte de estos términos. Tenés derecho a revocar la compra dentro de los 10 días corridos desde que recibís el producto (artículo 34 de la Ley 24.240 y artículo 1110 del Código Civil y Comercial), usando el Botón de arrepentimiento.

### Cuenta y datos personales
- Usamos tus datos sólo para procesar tus pedidos, enviarte avisos sobre ellos y, si no te diste de baja, recordatorios de tu bolsa. No vendemos ni cedemos tus datos.
- Podés pedir acceso, corrección o eliminación de tus datos escribiéndonos.
- El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326.
- La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.

### Propiedad intelectual
Las fotos, textos, marca y diseño del sitio son de Samadhi Style. No se pueden usar sin autorización.

### Defensa del consumidor
Ante cualquier reclamo podés escribirnos y te respondemos a la brevedad. También podés acudir a la autoridad de Defensa del Consumidor desde el enlace "Defensa de las y los consumidores" que está al pie del sitio.

### Ley aplicable
Estos términos se rigen por las leyes de la República Argentina.`;

export const DEFAULT_RETURNS = `## Política de cambios y devoluciones

Queremos que cada prenda te quede como la imaginaste. Si no es así, tenés estas opciones.

### Cambios
- Tenés **30 días corridos** desde que recibís el pedido para cambiar una prenda.
- La prenda tiene que estar **sin uso, sin lavar y con todas sus etiquetas**.
- Podés cambiarla por otro talle o color, por otra prenda (pagando o recibiendo la diferencia) o por un crédito para usar en la tienda.
- Las prendas en Sale también tienen cambio.
- **Cómo hacerlo:** escribinos por WhatsApp al (0221) 5046554 con tu número de pedido. Podés traer la prenda al local sin cargo o mandarla por Andreani; en ese caso, el envío de ida y vuelta del cambio corre por tu cuenta.

### Derecho de arrepentimiento
- Tenés **10 días corridos** desde que recibís el pedido para arrepentirte de la compra, sin dar explicaciones y sin costo (artículo 34 de la Ley 24.240 y artículo 1110 del Código Civil y Comercial).
- Pedilo con el **Botón de arrepentimiento** que está al pie de la página. Dentro de las 24 horas te mandamos por email un código de identificación del trámite.
- La prenda tiene que volver en las mismas condiciones en que la recibiste. Te indicamos cómo mandarla; el envío de devolución es sin cargo para vos.
- Te devolvemos **el total pagado, incluido el envío**, por el mismo medio de pago, apenas recibimos la prenda. Los plazos de acreditación dependen de Mercado Pago o de tu banco.

### Prendas con falla
Si una prenda llegó con una falla o no es la que pediste, avisanos dentro de los 30 días. Te la cambiamos o te devolvemos el dinero, y nos hacemos cargo del envío.

### Reintegros
- Pagos con Mercado Pago: el reintegro se hace en el mismo medio. En tarjetas de crédito puede verse en el resumen siguiente.
- Pagos por transferencia: te transferimos a una cuenta a nombre de quien hizo la compra.`;

export const CONTENT_DEFAULTS = { faq: DEFAULT_FAQ, terms: DEFAULT_TERMS, returns: DEFAULT_RETURNS, reviewsEnabled: true, reviewsMinRating: 0 };
