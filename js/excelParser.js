/* ============================================================================
   EXCELPARSER.JS
   Lee el archivo Excel de una sede con SheetJS, ubica las columnas por
   nombre de encabezado (robusto a que cambien de posición), aplica la
   fórmula de clasificación y devuelve un arreglo de registros normalizados
   listos para guardarse en IndexedDB.
   ============================================================================ */

window.APP = window.APP || {};

/**
 * Convierte cualquier valor de celda (Date, número, string) en fecha ISO
 * "YYYY-MM-DD" o null si no es una fecha válida.
 */
function celdaAFechaISO(v) {
  if (v instanceof Date && !isNaN(v)) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    // Serial de fecha de Excel
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      const dt = new Date(Date.UTC(d.y, d.m - 1, d.d));
      return dt.toISOString().slice(0, 10);
    }
  }
  return null;
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

/**
 * Ubica el índice de cada columna requerida a partir de la fila de
 * encabezados. Compara con trim + case-sensitive exacto primero y luego
 * insensible a mayúsculas como respaldo.
 */
function construirMapaColumnas(headerRow) {
  const headers = headerRow.map(h => (h === null || h === undefined ? "" : String(h).trim()));
  const mapa = {};
  Object.entries(APP.COLUMNS).forEach(([campo, nombreCol]) => {
    let idx = headers.indexOf(nombreCol);
    if (idx === -1) {
      idx = headers.findIndex(h => h.toLowerCase() === nombreCol.toLowerCase());
    }
    mapa[campo] = idx; // -1 si no se encuentra
  });
  return mapa;
}

/**
 * Lee un File (input type=file) y devuelve el arreglo de registros
 * normalizados + un resumen de columnas no encontradas (para avisar al
 * usuario si el archivo no coincide con el formato esperado).
 */
APP.leerArchivoExcel = function (file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const filas = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: false });

        if (!filas || filas.length < 2) {
          return reject(new Error("El archivo no tiene datos (se esperaba al menos una fila de encabezados y una de datos)."));
        }

        const mapaCol = construirMapaColumnas(filas[0]);
        const faltantes = Object.entries(mapaCol)
          .filter(([, idx]) => idx === -1)
          .map(([campo]) => APP.COLUMNS[campo]);

        // n_admi es indispensable; sin ella no se puede procesar el archivo
        if (mapaCol.n_admi === -1) {
          return reject(new Error(
            'No se encontró la columna "n_admi" (Número de admisión) en el archivo. ' +
            "Verifica que la fila 1 tenga los encabezados originales del sistema de facturación."
          ));
        }

        const registros = [];
        for (let i = 1; i < filas.length; i++) {
          const fila = filas[i];
          if (!fila || fila[mapaCol.n_admi] === null || fila[mapaCol.n_admi] === undefined || fila[mapaCol.n_admi] === "") {
            continue; // fila vacía
          }
          const get = (campo) => (mapaCol[campo] !== -1 ? fila[mapaCol[campo]] : null);

          const fAdmiISO = celdaAFechaISO(get("f_admi"));
          const base = {
            n_admi: get("n_admi"),
            f_admi: fAdmiISO,
            n_clie: (get("n_clie") ?? "").toString().trim(),
            v_admi: toNumber(get("v_admi")),
            n_fact: get("n_fact"),
            vf_grantot: toNumber(get("vf_grantot")),
            vf_pago: toNumber(get("vf_pago")),
            e_admi: get("e_admi"),
            n_cxc: get("n_cxc"),
            n_cost: get("n_cost"),
            n_ate01: (get("n_ate01") ?? "").toString().trim(),
            fecha_radicacion: get("fecha_radicacion"),
            n_paci: (get("n_paci") ?? "").toString().trim(),
            tipo_atencion: (get("tipo_atencion") ?? "").toString().trim()
          };

          base.clasificacion = APP.clasificar(base);
          base.observacion = APP.observacion(base.n_clie);
          base.categoria_cliente = APP.categorizarCliente(base.n_clie);

          if (fAdmiISO) {
            const [y, m] = fAdmiISO.split("-");
            base.anio = Number(y);
            base.mes = Number(m);
          } else {
            base.anio = null;
            base.mes = null;
          }
          base.facturada = toNumber(base.n_fact) > 0 || (typeof base.n_fact === "string" && base.n_fact.trim() !== "" && base.n_fact !== "0");

          registros.push(base);
        }

        resolve({ registros, faltantes, totalFilasLeidas: filas.length - 1, sheetName });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
};
