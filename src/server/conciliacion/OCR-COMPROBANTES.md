# OCR de comprobantes y cómo mantenerlo al día con cada banco

Cada foto de comprobante que llega al sistema se lee con OCR, se guarda lo que
se leyó y se cruza con el correo que manda el banco. Esto sirve para dos cosas:

1. **Doble check del pago** (comprobante + aviso del banco), y
2. **Tener registrado cómo luce el comprobante de cada banco**, para ajustar el
   lector cuando un banco cambie su app o aparezca uno nuevo.

## De dónde llegan las fotos

| Origen | Cuándo se lee | Quién lo dispara |
|---|---|---|
| `carrito` | Al confirmar el pedido en el checkout del carrito, **después** de responderle al comprador | `checkoutCarritoAction` → `procesarComprobanteCarrito` |
| `whatsapp` | Al recibir el mensaje en el webhook (cuando el número esté vinculado a Meta) | `procesarPayload` |

Los dos usan **exactamente lo mismo**: `ocrComprobante` (OCR.space, `OCR_API_KEY`),
`parsearComprobanteOcr`, `registrarComprobante` (pre-check y guardado) y
`cruzarComprobantesConAvisos` (cruce con el correo del banco). La única diferencia
es que en el carrito ya se sabe de qué compra es la foto; por WhatsApp hay que
buscarla por monto.

La compra directa de un evento (`FormularioCompra`) todavía **no** pasa por el OCR.

## Qué se guarda (tabla `comprobantes_whatsapp`)

El nombre es histórico: hoy guarda los comprobantes de ambos orígenes (`origen`).

| Columna | Qué es |
|---|---|
| `origen` | `carrito` o `whatsapp` |
| `archivo` | Nombre del archivo guardado |
| `texto_ocr` | **El texto crudo que devolvió el OCR.** Es la materia prima para ajustar el lector |
| `banco` | Banco emisor que reconoció el parser (`ueno`, `Itaú`, `Familiar`…) o `NULL` |
| `monto`, `nro_comprobante`, `concepto`, `pagador`, `beneficiario` | Lo que se extrajo |
| `cuenta_destino` | Cuenta que recibió la plata (`Cta. N° 81123742`) |
| `fecha_operacion` | `DD/MM/AAAA HH:MM` leído de la foto |
| `estado` | `pendiente_banco`, `confirmado`, `observado`, `duplicado`, `sin_datos` |
| `problemas` | Por qué quedó observado o sin datos |
| `aviso_id` | **El match con el correo del banco** (`avisos_banco.id`) |
| `coincidencias` | **Qué datos de la foto coincidieron con el correo**: `monto,pagador,comprobante,cuenta,fecha` |

El par "banco de la foto ↔ correo del banco" queda en `banco` + `aviso_id` +
`coincidencias`, junto con `texto_ocr`. Con eso se puede ver, banco por banco, qué
campos del comprobante se leen bien y cuáles no.

### Qué cuenta como coincidencia
`monto`, `pagador`, `comprobante` (Nº), `cuenta` (destino) y `fecha` (misma hora,
tolerancia de 3 minutos). Para **confirmar** el doble check hace falta el monto **y**
el pagador o el Nº de comprobante: la cuenta y la fecha solas no alcanzan (la cuenta
de Eike es pública y la fecha se puede copiar). Si el monto de la foto no es el de
la compra, el comprobante queda `observado`.

## Cómo mantener el OCR al día con cada banco

Cada banco (y cada app, p. ej. mango, ueno, Itaú) muestra el comprobante distinto,
y cambian el diseño de vez en cuando. El parser (`src/server/conciliacion/parser-comprobante.ts`)
usa expresiones regulares sobre el texto del OCR, así que hay que revisarlo cuando
aparezcan comprobantes que no se leen bien.

1. **Detectar qué no se leyó.** Los comprobantes con datos faltantes:

   ```sql
   -- Por banco: cuántos se leyeron completos y cuántos no
   SELECT coalesce(banco, '(no reconocido)') AS banco,
          count(*) AS total,
          count(*) FILTER (WHERE monto IS NULL)          AS sin_monto,
          count(*) FILTER (WHERE nro_comprobante IS NULL) AS sin_nro,
          count(*) FILTER (WHERE cuenta_destino IS NULL)  AS sin_cuenta,
          count(*) FILTER (WHERE fecha_operacion IS NULL) AS sin_fecha,
          count(*) FILTER (WHERE estado = 'confirmado')   AS confirmados
     FROM comprobantes_whatsapp
    GROUP BY 1 ORDER BY total DESC;

   -- Los textos concretos a revisar
   SELECT id, origen, banco, texto_ocr
     FROM comprobantes_whatsapp
    WHERE monto IS NULL OR banco IS NULL OR cuenta_destino IS NULL OR fecha_operacion IS NULL
    ORDER BY id DESC LIMIT 20;
   ```

2. **Ver qué campos coinciden con el correo** (cuáles se leen bien de verdad):

   ```sql
   SELECT banco, coincidencias, count(*)
     FROM comprobantes_whatsapp WHERE estado = 'confirmado'
    GROUP BY 1, 2 ORDER BY 1, 3 DESC;
   ```

3. **Ajustar el parser.** Abrir la foto (`/api/comprobantes/<ordenId>` para las del
   carrito), comparar con su `texto_ocr` y corregir la expresión regular que falla.
4. **Dejarlo como test.** Agregar el `texto_ocr` (con datos ficticios, sin nombres ni
   números reales) como caso en `parser-comprobante.test.ts`, con el banco y los
   campos esperados. Así el próximo cambio no rompe lo que ya funcionaba.
5. **Reprocesar si hace falta.** Los comprobantes viejos conservan su `texto_ocr`:
   se pueden volver a pasar por `parsearComprobanteOcr` sin repetir el OCR (que cuesta
   una llamada a la API).

Conviene hacer esta revisión cada vez que un comprobante real de un banco nuevo
quede `sin_datos`/`observado`, y de forma periódica (por ejemplo una vez al mes)
mirando la consulta del punto 1.

## Qué hacer si el OCR no está disponible
Si falta `OCR_API_KEY` o el servicio falla, el comprobante igual queda registrado como
`sin_datos` con el motivo en `problemas`, y el superadmin lo revisa a mano en
`/panel/admin/aprobaciones/compras`. El checkout del comprador no se ve afectado.
