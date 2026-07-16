/* ============================================================================
   SUPABASE.JS — MODO REMOTO (compartido)
   Persistencia en Supabase (Postgres en la nube). Se activa automáticamente
   cuando APP.SUPABASE.url y APP.SUPABASE.anonKey están completos en
   config.js. Requiere haber creado antes las tablas con el script
   supabase/schema.sql (ver README, sección Supabase).
   ============================================================================ */

window.APP = window.APP || {};

const TABLA_REGISTROS = "registros";
const TABLA_META = "sedes_meta";
const TAMANO_LOTE = 500; // filas por request al insertar (evita payloads gigantes)

let _clienteSupabase = null;

APP.supabaseHabilitado = function () {
  return Boolean(APP.SUPABASE && APP.SUPABASE.url && APP.SUPABASE.anonKey);
};

function clienteSupabase() {
  if (!_clienteSupabase) {
    if (typeof window.supabase === "undefined") {
      throw new Error(
        "No se pudo cargar la librería de Supabase (revisa tu conexión a internet o que el script de Supabase esté incluido en index.html)."
      );
    }
    _clienteSupabase = window.supabase.createClient(APP.SUPABASE.url, APP.SUPABASE.anonKey);
  }
  return _clienteSupabase;
}

/** Convierte un registro interno (camelCase / español) al esquema de la tabla (snake_case) */
function aFilaSupabase(r, sedeId, clinicaId) {
  return {
    n_admi: String(r.n_admi ?? ""),
    f_admi: r.f_admi,
    n_clie: r.n_clie,
    v_admi: r.v_admi,
    n_fact: r.n_fact !== null && r.n_fact !== undefined ? String(r.n_fact) : null,
    vf_grantot: r.vf_grantot,
    vf_pago: r.vf_pago,
    e_admi: r.e_admi,
    n_cxc: r.n_cxc !== null && r.n_cxc !== undefined ? String(r.n_cxc) : null,
    n_cost: r.n_cost !== null && r.n_cost !== undefined ? String(r.n_cost) : null,
    n_ate01: r.n_ate01,
    fecha_radicacion: r.fecha_radicacion !== null && r.fecha_radicacion !== undefined ? String(r.fecha_radicacion) : null,
    n_paci: r.n_paci,
    tipo_atencion: r.tipo_atencion,
    clasificacion: r.clasificacion,
    observacion: r.observacion,
    categoria_cliente: r.categoria_cliente,
    anio: r.anio,
    mes: r.mes,
    facturada: r.facturada,
    sede: sedeId,
    clinica: clinicaId
  };
}

/** Convierte una fila de la tabla al formato interno que usa el resto de la app */
function aRegistroInterno(fila) {
  return { ...fila, id: fila.id };
}

APP.guardarDatosSedeRemoto = async function (sedeId, clinicaId, registros, infoArchivo, onProgreso) {
  const sb = clienteSupabase();

  // 1. Borrar registros previos de esta sede (reemplazo, no acumulación)
  const { error: errDelete } = await sb.from(TABLA_REGISTROS).delete().eq("sede", sedeId);
  if (errDelete) throw new Error("No se pudieron limpiar los datos previos de la sede: " + errDelete.message);

  // 2. Insertar los nuevos registros en lotes
  const filas = registros.map(r => aFilaSupabase(r, sedeId, clinicaId));
  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    const lote = filas.slice(i, i + TAMANO_LOTE);
    const { error } = await sb.from(TABLA_REGISTROS).insert(lote);
    if (error) throw new Error(`Error subiendo filas ${i}-${i + lote.length} a Supabase: ` + error.message);
    if (onProgreso) onProgreso(Math.min(i + lote.length, filas.length), filas.length);
  }

  // 3. Actualizar metadata de la sede
  const fechas = registros.map(r => r.f_admi).filter(Boolean).sort();
  const { error: errMeta } = await sb.from(TABLA_META).upsert({
    sede: sedeId,
    clinica: clinicaId,
    fecha_carga: new Date().toISOString(),
    nombre_archivo: infoArchivo?.nombreArchivo || "",
    total_filas: registros.length,
    fecha_min: fechas[0] || null,
    fecha_max: fechas[fechas.length - 1] || null
  });
  if (errMeta) throw new Error("No se pudo actualizar la metadata de la sede: " + errMeta.message);
};

APP.obtenerTodosLosRegistrosRemoto = async function () {
  const sb = clienteSupabase();
  const PAGINA = 1000;
  let desde = 0;
  let todos = [];
  while (true) {
    const { data, error } = await sb.from(TABLA_REGISTROS).select("*").range(desde, desde + PAGINA - 1);
    if (error) throw new Error("No se pudieron leer los registros de Supabase: " + error.message);
    todos = todos.concat(data.map(aRegistroInterno));
    if (!data.length || data.length < PAGINA) break;
    desde += PAGINA;
  }
  return todos;
};

APP.obtenerMetadataSedesRemoto = async function () {
  const sb = clienteSupabase();
  const { data, error } = await sb.from(TABLA_META).select("*");
  if (error) throw new Error("No se pudo leer la metadata de sedes: " + error.message);
  return (data || []).map(m => ({
    sede: m.sede,
    clinica: m.clinica,
    fechaCarga: m.fecha_carga,
    nombreArchivo: m.nombre_archivo,
    totalFilas: m.total_filas,
    fechaMin: m.fecha_min,
    fechaMax: m.fecha_max
  }));
};

APP.eliminarDatosSedeRemoto = async function (sedeId) {
  const sb = clienteSupabase();
  const { error: e1 } = await sb.from(TABLA_REGISTROS).delete().eq("sede", sedeId);
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await sb.from(TABLA_META).delete().eq("sede", sedeId);
  if (e2) throw new Error(e2.message);
};

APP.borrarTodoRemoto = async function () {
  const sb = clienteSupabase();
  const { error: e1 } = await sb.from(TABLA_REGISTROS).delete().neq("sede", "__ninguna__");
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await sb.from(TABLA_META).delete().neq("sede", "__ninguna__");
  if (e2) throw new Error(e2.message);
};
