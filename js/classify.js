/* ============================================================================
   CLASSIFY.JS
   Traducción exacta de la fórmula de clasificación de Excel:

   =SI(ESERROR(AW2);
        SI(Y(AE2=1;R2=0;M2=0);$BA$6;
        SI(Y(AE2=1;R2=0;M2>0);$BA$7;
        SI(Y(AE2=2;R2=0;M2=0);$BA$8;
        SI(Y(AE2=2;R2=0;M2>0);$BA$9;
        SI(Y(AE2<=2;R2>=0;AK2="NO APLICA");$BA$14;
        SI(Y(AE2=2; R2>0;AK2=0);$BA$12;
        SI(AE2=3;$BA$10;$BA$12)))))));
        SI(AW2="No radica";$BA$13;
        SI(AW2="Pendiente";$BA$11;$BA$5)))

   AE = e_admi | R = n_fact | M = v_admi | AK = n_cxc | AW = Fecha radicacion

   Esta fórmula se re-ejecuta SIEMPRE que se cargan datos nuevos (no se
   confía en la columna "Clasificacion" cacheada del Excel de origen),
   exactamente como lo pidió el negocio.
   ============================================================================ */

window.APP = window.APP || {};

/**
 * Determina si un valor de celda representa un error de Excel
 * (#N/A, #REF!, #VALUE!, etc.) o está vacío -> equivalente a ESERROR().
 */
APP.esError = function (valor) {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === "string") {
    const v = valor.trim();
    if (v === "") return true;
    if (v.startsWith("#")) return true; // #N/A, #REF!, #VALUE!, #DIV/0!, etc.
  }
  return false;
};

/**
 * Normaliza el valor de "Fecha radicacion" para las comparaciones de texto
 * ("No radica" / "Pendiente") sin importar mayúsculas/espacios.
 */
function normalizarTexto(v) {
  return String(v ?? "").trim().toUpperCase();
}

/**
 * Núcleo de la fórmula de clasificación.
 * @param {object} r registro con campos: e_admi, n_fact, v_admi, n_cxc, fecha_radicacion
 * @returns {string} una de las etiquetas de APP.CLASIFICACIONES
 */
APP.clasificar = function (r) {
  const AE = Number(r.e_admi);
  const R = Number(r.n_fact) || 0;
  const M = Number(r.v_admi) || 0;
  const AK = r.n_cxc;
  const AW = r.fecha_radicacion;

  const AK_txt = normalizarTexto(AK);
  const AK_num = Number(AK);

  if (APP.esError(AW)) {
    if (AE === 1 && R === 0 && M === 0) return APP.CLASIFICACIONES.ADM_ABIERTAS_EN_CERO;
    if (AE === 1 && R === 0 && M > 0) return APP.CLASIFICACIONES.ADM_ABIERTAS_SIN_FACTURAR;
    if (AE === 2 && R === 0 && M === 0) return APP.CLASIFICACIONES.ADM_CERRADAS_EN_CERO;
    if (AE === 2 && R === 0 && M > 0) return APP.CLASIFICACIONES.ADM_CERRADAS_CON_VALOR_SIN_FACTURAR;
    if (AE <= 2 && R >= 0 && AK_txt === "NO APLICA") return APP.CLASIFICACIONES.PARTICULAR;
    if (AE === 2 && R > 0 && (AK_num === 0 || AK_txt === "0" || AK === 0)) return APP.CLASIFICACIONES.FACTURADO_SIN_CXC;
    if (AE === 3) return APP.CLASIFICACIONES.ANULADAS;
    return APP.CLASIFICACIONES.FACTURADO_SIN_CXC;
  } else {
    const awTxt = normalizarTexto(AW);
    if (awTxt === "NO RADICA") return APP.CLASIFICACIONES.NO_RADICA;
    if (awTxt === "PENDIENTE") return APP.CLASIFICACIONES.FACTURADO_CON_CXC;
    return APP.CLASIFICACIONES.RADICADO_ENTIDAD;
  }
};

/**
 * OBSERVACION: Aseguradora vs Particular, según columna n_clie (J).
 * Réplica exacta de la fórmula original (lista de textos exactos).
 */
APP.observacion = function (n_clie) {
  const v = normalizarTexto(n_clie);
  const esParticularExacto = APP.CLIENTES_PARTICULARES_EXACTOS
    .some(p => normalizarTexto(p) === v);
  return esParticularExacto ? "PARTICULAR" : "ASEGURADORA";
};

/**
 * Categoría comercial de negocio (ARL / SOAT / MEDICINA PREPAGADA /
 * POLIZAS DE SALUD / PARTICULARES / CONVENIOS-EMPRESAS).
 * Se infiere por palabras clave del texto de n_clie, ya que el archivo no
 * trae una columna de categoría explícita. Es una heurística documentada
 * en el README; puede ajustarse en config.js si una entidad se clasifica mal.
 */
APP.categorizarCliente = function (n_clie) {
  const v = normalizarTexto(n_clie);

  const esParticularExacto = APP.CLIENTES_PARTICULARES_EXACTOS
    .some(p => normalizarTexto(p) === v);
  if (esParticularExacto) return "PARTICULARES";

  if (/\bARL\b/.test(v)) return "ARL";
  if (/\bSOAT\b/.test(v)) return "SOAT";
  if (/PREPAG/.test(v)) return "MEDICINA PREPAGADA";
  if (/P[OÓ]LIZA/.test(v) || /\[SALUD\]/.test(v) || /SALUD\)/.test(v)) return "POLIZAS DE SALUD";

  return APP.CATEGORIA_CLIENTE_OTROS;
};
