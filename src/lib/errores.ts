/**
 * Error de negocio con mensaje seguro para mostrar tal cual al usuario.
 * Equivalente a las `RuntimeException` que el PHP atrapaba explícitamente y
 * devolvía como `jsonError($e->getMessage(), 409)` (ej. "Esa tanda está
 * agotada.", "Ese ticket ya fue usado."). Cualquier OTRO tipo de error se
 * trata como inesperado: se loguea completo y al usuario se le muestra un
 * mensaje genérico, para no filtrar detalles internos por accidente.
 */
export class ErrorNegocio extends Error {}
