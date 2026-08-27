/* ============================================================================
   EXCELPARSER.JS
   Lee el archivo Excel de una sede con SheetJS, ubica las columnas por
   nombre de encabezado (robusto a que cambien de posición), aplica la
   fórmula de clasificación y devuelve un arreglo de registros normalizados
   listos para guardarse en IndexedDB.
   ============================================================================ */

window.APP = window.APP || {};

/**
 * Convierte cualquier valor de celda (Date, número de serie de Excel, o
 * texto en varios formatos comunes) en fecha ISO "YYYY-MM-DD", o null si
 * no se puede interpretar como fecha válida.
 */
function celdaAFechaISO(v) {
  if (v instanceof Date && !isNaN(v)) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    // Serial de fecha de Excel
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y > 1900) {
      const dt = new Date(Date.UTC(d.y, d.m - 1, d.d));
      return dt.toISOString().slice(0, 10);
    }
    return null;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;

    // yyyy-mm-dd (con o sin hora)
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return normalizarFechaISO(Number(m[1]), Number(m[2]), Number(m[3]));

    // dd/mm/yyyy o dd-mm-yyyy (con o sin hora) — formato típico de estos reportes
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return normalizarFechaISO(Number(m[3]), Number(m[2]), Number(m[1]));

    return null; // texto no reconocible como fecha (ej. "  -   -  : :")
  }
  return null;
}

/** Valida rangos básicos antes de devolver la fecha en formato ISO */
function normalizarFechaISO(anio, mes, dia) {
  if (anio < 1990 || anio > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const dt = new Date(Date.UTC(anio, mes - 1, dia));
  return dt.toISOString().slice(0, 10);
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
        let sinNumeroAdmision = 0;
        let sinFechaValida = 0;

        for (let i = 1; i < filas.length; i++) {
          const fila = filas[i];
          if (!fila || fila[mapaCol.n_admi] === null || fila[mapaCol.n_admi] === undefined || fila[mapaCol.n_admi] === "") {
            continue; // fila totalmente vacía, se ignora sin contar como error
          }
          const get = (campo) => (mapaCol[campo] !== -1 ? fila[mapaCol[campo]] : null);

          // El número de admisión es obligatorio y debe tener contenido real
          const nAdmiRaw = get("n_admi");
          if (nAdmiRaw === null || nAdmiRaw === undefined || String(nAdmiRaw).trim() === "") {
            sinNumeroAdmision++;
            continue;
          }

          // La fecha de admisión es obligatoria: TODO el informe se basa en
          // n_admi + f_admi, así que una fila sin fecha válida no puede
          // aparecer en unas secciones sí y en otras no — se excluye entera.
          const fAdmiISO = celdaAFechaISO(get("f_admi"));
          if (!fAdmiISO) {
            sinFechaValida++;
            continue;
          }

          const base = {
            n_admi: nAdmiRaw,
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

          const [y, m] = fAdmiISO.split("-");
          base.anio = Number(y);
          base.mes = Number(m);
          base.facturada = toNumber(base.n_fact) > 0 || (typeof base.n_fact === "string" && base.n_fact.trim() !== "" && base.n_fact !== "0");

          registros.push(base);
        }

        const { registrosLimpios, duplicadosColapsados } = colapsarLineasDuplicadas(registros);

        resolve({
          registros: registrosLimpios,
          faltantes,
          totalFilasLeidas: filas.length - 1,
          sinNumeroAdmision,
          sinFechaValida,
          duplicadosColapsados,
          sheetName
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Colapsa líneas que son, en realidad, la MISMA línea de servicio exportada
 * dos veces por el sistema de origen: antes y después de facturarse (mismo
 * número de admisión, misma fecha, mismo valor admisionado y mismo tipo de
 * atención, pero una fila con n_fact=0 y otra ya con número de factura).
 *
 * Si se sumaran ambas, esa admisión quedaría contada dos veces en "valor
 * admisionado" — por eso todo el informe se ancla a n_admi + f_admi: dentro
 * de cada combinación única se conserva solo la línea en su estado más
 * avanzado (facturada > sin facturar; entre dos facturadas, la de mayor
 * número de cuenta de cobro/factura, asumida como la más reciente).
 */
function colapsarLineasDuplicadas(registros) {
  const grupos = new Map();
  registros.forEach(r => {
    const clave = [r.n_admi, r.f_admi, r.v_admi, r.n_ate01].join("||");
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(r);
  });

  function prioridad(r) {
    const puntajeFacturada = r.facturada ? 1000000000 : 0;
    const numFact = Number(r.n_fact) || 0;
    const numCxc = Number(r.n_cxc) || 0;
    return puntajeFacturada + Math.max(numFact, numCxc);
  }

  let duplicadosColapsados = 0;
  const registrosLimpios = [];
  grupos.forEach(filasGrupo => {
    if (filasGrupo.length === 1) {
      registrosLimpios.push(filasGrupo[0]);
      return;
    }
    duplicadosColapsados += filasGrupo.length - 1;
    let mejor = filasGrupo[0];
    for (let i = 1; i < filasGrupo.length; i++) {
      if (prioridad(filasGrupo[i]) > prioridad(mejor)) mejor = filasGrupo[i];
    }
    registrosLimpios.push(mejor);
  });

  return { registrosLimpios, duplicadosColapsados };
}
