/* ============================================================================
   STATE.JS
   Cache en memoria de todos los registros (cargados desde el almacenamiento
   activo), filtros activos compartidos por todas las vistas, y funciones de
   agregación / análisis vertical-horizontal.

   REGLA DE VALORES (corrección de negocio):
   - Valor ADMISIONADO  = siempre v_admi (columna M), para TODAS las filas.
   - Valor FACTURADO    = v_admi (columna M) SOLO en las filas marcadas como
     facturadas (n_fact con número de factura). No se usa vf_tota ni
     vf_grantot para esto — la única fuente de valor es v_admi.
   - Valor RADICADO     = v_admi de las filas cuya clasificación final es
     "Radicado entidad" (ya se envió y quedó registrada la fecha real de
     radicación ante la entidad).
   - Valor PENDIENTE (por radicar) = Facturado - Radicado, es decir, lo que
     ya se facturó pero todavía no se ha radicado ante la entidad.
   ============================================================================ */

window.APP = window.APP || {};

APP.state = {
  registros: [],       // cache completo en memoria
  metaSedes: [],        // metadata por sede (fecha de carga, etc.)
  filtros: {
    clinicas: [],        // vacío = todas
    sedes: [],           // vacío = todas
    anios: [],           // vacío = todos
    meses: [],           // vacío = todos (1-12)
    fechaDesde: null,     // "YYYY-MM-DD"
    fechaHasta: null,
    categoriasCliente: [], // vacío = todas
    clasificaciones: []    // vacío = todas
  }
};

APP.recargarCache = async function () {
  APP.state.registros = await APP.obtenerTodosLosRegistros();
  APP.state.metaSedes = await APP.obtenerMetadataSedes();
  return APP.state.registros;
};

/**
 * Devuelve los registros aplicando los filtros activos.
 * @param {object} opciones - { ignorarSede: true } para secciones que deben
 *        comparar TODAS las sedes entre sí aunque el filtro global de sede
 *        esté acotado a una sola (ej. resumen por cliente).
 */
APP.registrosFiltrados = function (opciones) {
  const opts = opciones || {};
  const f = APP.state.filtros;
  return APP.state.registros.filter(r => {
    if (f.clinicas.length && !f.clinicas.includes(r.clinica)) return false;
    if (!opts.ignorarSede && f.sedes.length && !f.sedes.includes(r.sede)) return false;
    if (f.anios.length && !f.anios.includes(r.anio)) return false;
    if (f.meses.length && !f.meses.includes(r.mes)) return false;
    if (f.fechaDesde && (!r.f_admi || r.f_admi < f.fechaDesde)) return false;
    if (f.fechaHasta && (!r.f_admi || r.f_admi > f.fechaHasta)) return false;
    if (f.categoriasCliente.length && !f.categoriasCliente.includes(r.categoria_cliente)) return false;
    if (f.clasificaciones.length && !f.clasificaciones.includes(r.clasificacion)) return false;
    return true;
  });
};

/** Años disponibles en el dataset completo (para poblar selectores) */
APP.aniosDisponibles = function () {
  const set = new Set(APP.state.registros.map(r => r.anio).filter(Boolean));
  return Array.from(set).sort();
};

/** Valor facturado de una fila individual (0 si no está facturada) */
function valorFacturadoFila(r) {
  return r.facturada ? (r.v_admi || 0) : 0;
}
/** Valor radicado de una fila individual */
function valorRadicadoFila(r) {
  return r.clasificacion === APP.CLASIFICACIONES.RADICADO_ENTIDAD ? (r.v_admi || 0) : 0;
}

/**
 * KPIs agregados de un conjunto de registros.
 */
APP.calcularKPIs = function (registros) {
  const admisionesUnicas = new Set();
  let valorAdmisionado = 0;
  let valorFacturado = 0;
  let valorRadicado = 0;
  let filasFacturadas = 0;

  registros.forEach(r => {
    admisionesUnicas.add(r.sede + "|" + r.n_admi);
    valorAdmisionado += r.v_admi || 0;
    valorFacturado += valorFacturadoFila(r);
    valorRadicado += valorRadicadoFila(r);
    if (r.facturada) filasFacturadas++;
  });

  const pendientePorFacturar = Math.max(0, valorAdmisionado - valorFacturado);
  const pendientePorRadicar = Math.max(0, valorFacturado - valorRadicado);
  const pctFacturacion = valorAdmisionado > 0 ? (valorFacturado / valorAdmisionado) * 100 : 0;

  return {
    totalAdmisiones: admisionesUnicas.size,
    totalLineas: registros.length,
    valorAdmisionado,
    valorFacturado,
    valorRadicado,
    pendientePorFacturar,
    pendientePorRadicar,
    pctFacturacion,
    filasFacturadas
  };
};

/** Agrupa registros por sede y devuelve KPIs por sede */
APP.agruparPorSede = function (registros) {
  const grupos = {};
  registros.forEach(r => {
    if (!grupos[r.sede]) grupos[r.sede] = [];
    grupos[r.sede].push(r);
  });
  return Object.entries(grupos).map(([sedeId, regs]) => {
    const sedeInfo = APP.getSede(sedeId) || { id: sedeId, nombre: sedeId, clinicaId: "?", clinicaNombre: "?" };
    return { sede: sedeInfo, kpis: APP.calcularKPIs(regs) };
  }).sort((a, b) => b.kpis.valorAdmisionado - a.kpis.valorAdmisionado);
};

/** Agrupa registros por clínica (Dolormed vs Redes Imat) */
APP.agruparPorClinica = function (registros) {
  const grupos = {};
  registros.forEach(r => {
    if (!grupos[r.clinica]) grupos[r.clinica] = [];
    grupos[r.clinica].push(r);
  });
  return Object.entries(grupos).map(([clinicaId, regs]) => {
    const clinicaInfo = APP.getClinica(clinicaId) || { id: clinicaId, nombre: clinicaId };
    return { clinica: clinicaInfo, kpis: APP.calcularKPIs(regs) };
  });
};

/** Serie mensual global (para tendencias) "YYYY-MM" -> KPIs */
APP.serieMensual = function (registros) {
  const grupos = {};
  registros.forEach(r => {
    if (!r.f_admi) return;
    const key = r.f_admi.slice(0, 7); // YYYY-MM
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(r);
  });
  return Object.keys(grupos).sort().map(key => ({
    periodo: key,
    kpis: APP.calcularKPIs(grupos[key])
  }));
};

/**
 * Serie mensual agrupada por un campo (sede o clinica) — cada grupo tiene
 * su propia serie de periodos independiente. Devuelve:
 * { grupos: [{id, nombre, color, serie:[{periodo,kpis}] }], periodosOrdenados: [...] }
 */
APP.serieMensualPorGrupo = function (registros, campo) {
  const porGrupo = {};
  registros.forEach(r => {
    if (!r.f_admi) return;
    const grupoId = r[campo];
    const periodo = r.f_admi.slice(0, 7);
    if (!porGrupo[grupoId]) porGrupo[grupoId] = {};
    if (!porGrupo[grupoId][periodo]) porGrupo[grupoId][periodo] = [];
    porGrupo[grupoId][periodo].push(r);
  });

  const todosPeriodos = new Set();
  const grupos = Object.entries(porGrupo).map(([grupoId, periodos]) => {
    Object.keys(periodos).forEach(p => todosPeriodos.add(p));
    const serie = Object.keys(periodos).sort().map(periodo => ({
      periodo, kpis: APP.calcularKPIs(periodos[periodo])
    }));
    const info = campo === "sede"
      ? (APP.getSede(grupoId) || { id: grupoId, nombre: grupoId })
      : (APP.getClinica(grupoId) || { id: grupoId, nombre: grupoId });
    return { id: grupoId, nombre: info.nombre, color: info.color || null, serie };
  });

  return { grupos, periodosOrdenados: Array.from(todosPeriodos).sort() };
};

/** Distribución por clasificación (para gráfico de dona) */
APP.distribucionClasificacion = function (registros) {
  const grupos = {};
  registros.forEach(r => {
    grupos[r.clasificacion] = (grupos[r.clasificacion] || 0) + 1;
  });
  return Object.entries(grupos)
    .map(([clasificacion, cantidad]) => ({ clasificacion, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
};

/** Distribución por categoría de cliente (para gráfico de barras/torta) */
APP.distribucionCategoriaCliente = function (registros) {
  const grupos = {};
  registros.forEach(r => {
    if (!grupos[r.categoria_cliente]) grupos[r.categoria_cliente] = { cantidad: 0, valorAdmisionado: 0, valorFacturado: 0 };
    grupos[r.categoria_cliente].cantidad++;
    grupos[r.categoria_cliente].valorAdmisionado += r.v_admi || 0;
    grupos[r.categoria_cliente].valorFacturado += valorFacturadoFila(r);
  });
  return Object.entries(grupos).map(([categoria, v]) => ({ categoria, ...v }))
    .sort((a, b) => b.valorAdmisionado - a.valorAdmisionado);
};

/**
 * Distribución por categoría de cliente, desglosada por sede (para comparar
 * las sedes filtradas entre sí en vez de acumular todo en un solo total).
 * Devuelve: { categorias: string[], sedes: [{id,nombre,color}], porSedeCategoria: { sedeId: { categoria: {admisionado, facturado} } } }
 */
APP.distribucionCategoriaClientePorSede = function (registros) {
  const categoriasSet = new Set();
  const sedesVistas = new Map();
  const porSedeCategoria = {};

  registros.forEach(r => {
    categoriasSet.add(r.categoria_cliente);
    if (!sedesVistas.has(r.sede)) {
      const info = APP.getSede(r.sede) || { id: r.sede, nombre: r.sede };
      sedesVistas.set(r.sede, { id: r.sede, nombre: info.nombre, color: info.color || null });
    }
    if (!porSedeCategoria[r.sede]) porSedeCategoria[r.sede] = {};
    if (!porSedeCategoria[r.sede][r.categoria_cliente]) porSedeCategoria[r.sede][r.categoria_cliente] = { admisionado: 0, facturado: 0 };
    porSedeCategoria[r.sede][r.categoria_cliente].admisionado += r.v_admi || 0;
    porSedeCategoria[r.sede][r.categoria_cliente].facturado += valorFacturadoFila(r);
  });

  // Orden de categorías por valor admisionado total (más relevantes primero)
  const totalPorCategoria = {};
  Object.values(porSedeCategoria).forEach(porCat => {
    Object.entries(porCat).forEach(([cat, v]) => {
      totalPorCategoria[cat] = (totalPorCategoria[cat] || 0) + v.admisionado;
    });
  });
  const categorias = Array.from(categoriasSet).sort((a, b) => (totalPorCategoria[b] || 0) - (totalPorCategoria[a] || 0));
  const sedes = Array.from(sedesVistas.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

  return { categorias, sedes, porSedeCategoria };
};

/**
 * Resumen por cliente (n_clie), desglosado por sede para poder comparar
 * el mismo cliente entre distintas sedes. Ignora el filtro de sede (para
 * que la comparación entre sedes siempre esté disponible) pero respeta los
 * demás filtros activos (clínica, año, mes, fechas, categoría, clasificación).
 */
/**
 * Resumen por cliente (n_clie), desglosado por sede para poder comparar
 * el mismo cliente entre distintas sedes. Respeta TODOS los filtros activos,
 * incluido el de sede — si se filtran una o varias sedes, solo esas se
 * comparan; si no hay filtro de sede, se comparan todas las que tengan datos.
 *
 * IMPORTANTE: cada cliente muestra SIEMPRE todas las sedes presentes en el
 * conjunto de registros recibido (no solo las sedes donde ese cliente
 * puntual tuvo movimiento) — si una sede no atendió a ese cliente, aparece
 * igual con $0, para que la comparación entre sedes sea completa y no
 * queden sedes "invisibles".
 */
APP.resumenPorClienteYSede = function (registros) {
  // 1. Todas las sedes con actividad dentro de los filtros aplicados (sin filtrar por sede)
  const sedesActivas = new Map();
  registros.forEach(r => {
    if (!sedesActivas.has(r.sede)) {
      const info = APP.getSede(r.sede) || { id: r.sede, nombre: r.sede, clinicaNombre: "" };
      sedesActivas.set(r.sede, { id: r.sede, nombre: info.nombre, clinicaNombre: info.clinicaNombre || "" });
    }
  });
  const listaSedes = Array.from(sedesActivas.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));

  // 2. Acumular admisionado/facturado/radicado por cliente + sede
  const grupos = {};
  registros.forEach(r => {
    const key = r.n_clie + "||" + r.sede;
    if (!grupos[key]) {
      grupos[key] = { cliente: r.n_clie, sedeId: r.sede, admisionado: 0, facturado: 0, radicado: 0 };
    }
    grupos[key].admisionado += r.v_admi || 0;
    grupos[key].facturado += valorFacturadoFila(r);
    grupos[key].radicado += valorRadicadoFila(r);
  });

  // 3. Agrupar por cliente
  const porCliente = {};
  Object.values(grupos).forEach(g => {
    if (!porCliente[g.cliente]) porCliente[g.cliente] = {};
    porCliente[g.cliente][g.sedeId] = g;
  });

  // 4. Para cada cliente, completar CON TODAS las sedes activas (0 si no tuvo movimiento)
  return Object.entries(porCliente).map(([cliente, porSede]) => {
    const filasSede = listaSedes.map(sedeInfo => {
      const g = porSede[sedeInfo.id];
      const admisionado = g ? g.admisionado : 0;
      const facturado = g ? g.facturado : 0;
      const radicado = g ? g.radicado : 0;
      return {
        cliente,
        sedeId: sedeInfo.id,
        sedeNombre: sedeInfo.nombre,
        clinicaNombre: sedeInfo.clinicaNombre,
        admisionado, facturado, radicado,
        pendienteFacturar: Math.max(0, admisionado - facturado),
        pendienteRadicar: Math.max(0, facturado - radicado)
      };
    });

    const total = filasSede.reduce((acc, f) => ({
      admisionado: acc.admisionado + f.admisionado,
      facturado: acc.facturado + f.facturado,
      radicado: acc.radicado + f.radicado,
      pendienteFacturar: acc.pendienteFacturar + f.pendienteFacturar,
      pendienteRadicar: acc.pendienteRadicar + f.pendienteRadicar
    }), { admisionado: 0, facturado: 0, radicado: 0, pendienteFacturar: 0, pendienteRadicar: 0 });

    return { cliente, filasSede, total };
  }).sort((a, b) => b.total.admisionado - a.total.admisionado);
};

/**
 * Distribución por tipo de atención (n_ate01), desglosada por sede en
 * formato pivote: una fila por tipo de atención, con columnas por sede.
 * Se usa como aproximación de "centro de costo" ya que n_cost viene vacío
 * en el export de origen.
 */
APP.distribucionAtencionPorSede = function (registros) {
  const sedesPresentes = [];
  const sedesVistas = new Set();
  const porAtencion = {};

  registros.forEach(r => {
    const atencion = r.n_ate01 || "(sin dato)";
    if (!sedesVistas.has(r.sede)) {
      sedesVistas.add(r.sede);
      const info = APP.getSede(r.sede) || { id: r.sede, nombre: r.sede };
      sedesPresentes.push({ id: r.sede, nombre: info.nombre });
    }
    if (!porAtencion[atencion]) porAtencion[atencion] = {};
    if (!porAtencion[atencion][r.sede]) porAtencion[atencion][r.sede] = { admisionado: 0, facturado: 0, cantidad: 0 };
    porAtencion[atencion][r.sede].admisionado += r.v_admi || 0;
    porAtencion[atencion][r.sede].facturado += valorFacturadoFila(r);
    porAtencion[atencion][r.sede].cantidad++;
  });

  sedesPresentes.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const filas = Object.entries(porAtencion).map(([atencion, porSede]) => {
    let totalAdm = 0, totalFact = 0;
    Object.values(porSede).forEach(v => { totalAdm += v.admisionado; totalFact += v.facturado; });
    return { atencion, porSede, totalAdm, totalFact };
  }).sort((a, b) => b.totalAdm - a.totalAdm);

  return { sedes: sedesPresentes, filas };
};

/**
 * Análisis vertical: participación (%) de cada sede sobre el total del
 * grupo filtrado, tanto para el valor admisionado como para el facturado.
 */
APP.analisisVerticalPorSede = function (registros) {
  const porSede = APP.agruparPorSede(registros);
  const totalAdmisionado = porSede.reduce((s, x) => s + x.kpis.valorAdmisionado, 0);
  const totalFacturado = porSede.reduce((s, x) => s + x.kpis.valorFacturado, 0);
  return porSede.map(x => ({
    ...x,
    participacion: totalAdmisionado > 0 ? (x.kpis.valorAdmisionado / totalAdmisionado) * 100 : 0,
    participacionFacturado: totalFacturado > 0 ? (x.kpis.valorFacturado / totalFacturado) * 100 : 0
  }));
};

/**
 * Análisis horizontal: variación % de un periodo respecto al anterior,
 * sobre una serie mensual ya calculada (de un solo grupo).
 */
APP.analisisHorizontal = function (serieMensual) {
  return serieMensual.map((punto, i) => {
    if (i === 0) return { ...punto, variacionAdmisionado: null, variacionFacturado: null };
    const prev = serieMensual[i - 1].kpis;
    const variacionAdmisionado = prev.valorAdmisionado > 0
      ? ((punto.kpis.valorAdmisionado - prev.valorAdmisionado) / prev.valorAdmisionado) * 100
      : null;
    const variacionFacturado = prev.valorFacturado > 0
      ? ((punto.kpis.valorFacturado - prev.valorFacturado) / prev.valorFacturado) * 100
      : null;
    return { ...punto, variacionAdmisionado, variacionFacturado };
  });
};

/**
 * Análisis horizontal calculado POR SEDE de forma independiente (cada sede
 * compara sus propios meses contra sus propios meses anteriores, sin
 * mezclarse con las demás sedes).
 * Devuelve: [{ sede, filas: [...analisisHorizontal de esa sede] }]
 */
APP.analisisHorizontalPorSede = function (registros) {
  const { grupos } = APP.serieMensualPorGrupo(registros, "sede");
  return grupos
    .map(g => ({
      sede: APP.getSede(g.id) || { id: g.id, nombre: g.nombre },
      filas: APP.analisisHorizontal(g.serie)
    }))
    .sort((a, b) => a.sede.nombre.localeCompare(b.sede.nombre));
};

/**
 * Análisis horizontal en formato PARALELO: una fila por periodo (mes), con
 * columnas agrupadas por sede una junto a la otra, para poder comparar el
 * mismo mes entre todas las sedes de un vistazo (en vez de listas separadas
 * una debajo de la otra). El cálculo de variación sigue siendo independiente
 * por sede (cada sede contra su propio mes anterior).
 * Devuelve: { periodosOrdenados: string[], sedes: [{id,nombre}], porSede: { sedeId: { periodo: {kpis, variacionAdmisionado, variacionFacturado} } } }
 */
APP.analisisHorizontalParaleloPorSede = function (registros) {
  const { grupos, periodosOrdenados } = APP.serieMensualPorGrupo(registros, "sede");
  const sedes = grupos.map(g => ({ id: g.id, nombre: g.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const porSede = {};
  grupos.forEach(g => {
    const conVariacion = APP.analisisHorizontal(g.serie);
    porSede[g.id] = {};
    conVariacion.forEach(p => { porSede[g.id][p.periodo] = p; });
  });
  return { periodosOrdenados, sedes, porSede };
};
