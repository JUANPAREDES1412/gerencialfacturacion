/* ============================================================================
   APP.JS
   Orquestación de la aplicación: navegación entre vistas, filtros globales,
   renderizado de cada sección y flujo de carga de archivos por sede.
   ============================================================================ */

(function () {
  const CATEGORIAS_CLIENTE = ["ARL", "SOAT", "MEDICINA PREPAGADA", "POLIZAS DE SALUD", "PARTICULARES", APP.CATEGORIA_CLIENTE_OTROS];
  const CLASIFICACIONES_LISTA = Object.values(APP.CLASIFICACIONES);

  let clientePagina = 0;
  const CLIENTE_PAGE_SIZE = 25;
  let clienteBusqueda = "";

  /* ------------------------------------------------------------------------
     UTILIDADES DE COLOR — separación visual entre sedes en tablas pivote
     ------------------------------------------------------------------------ */
  function hexARgba(hex, alpha) {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /** Envuelve celdas <th> con el color de fondo tenue de la sede */
  function coloreaTh(sedeRef, html) {
    const sede = APP.getSede(sedeRef.id) || sedeRef;
    const color = sede.color || "#999";
    return html.replace(/<th /g, `<th style="background:${hexARgba(color, 0.16)};border-bottom-color:${color}" `);
  }

  /** Envuelve celdas <td> con el color de fondo tenue de la sede */
  function coloreaTd(sedeRef, html) {
    const sede = APP.getSede(sedeRef.id) || sedeRef;
    const color = sede.color || "#999";
    return html.replace(/<td /g, `<td style="background:${hexARgba(color, 0.06)}" `);
  }

  /* ------------------------------------------------------------------------
     TOAST
     ------------------------------------------------------------------------ */
  function toast(msg, tipo) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className = "toast show" + (tipo === "error" ? " error" : "");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 4200);
  }

  /* ------------------------------------------------------------------------
     NAVEGACIÓN
     ------------------------------------------------------------------------ */
  function activarVista(nombre) {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById("view-" + nombre).classList.remove("hidden");
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === nombre));
    renderVistaActiva(nombre);
  }

  function renderVistaActiva(nombre) {
    if (nombre === "dashboard") renderDashboard();
    else if (nombre === "comparativo") { clientePagina = 0; renderComparativo(); }
    else if (nombre === "detalle") renderDetalle();
    else if (nombre === "cargar") renderCargar();
  }

  function vistaActivaNombre() {
    const activo = document.querySelector(".nav-item.active");
    return activo ? activo.dataset.view : "dashboard";
  }

  /* ------------------------------------------------------------------------
     FILTROS (dropdowns con checkboxes — ver js/multiselect.js)
     ------------------------------------------------------------------------ */
  const msel = {}; // instancias de los widgets multiselect, por id de filtro

  function inicializarFiltros() {
    msel.fClinica = APP.crearMultiSelect(
      document.getElementById("fClinica"),
      APP.ORG.clinicas.map(c => ({ value: c.id, label: c.nombre })),
      { placeholder: "Todas", onChange: leerFiltrosYRenderizar }
    );
    msel.fSede = APP.crearMultiSelect(
      document.getElementById("fSede"),
      APP.ALL_SEDES.map(s => ({ value: s.id, label: `${s.nombre} (${s.clinicaNombre})` })),
      { placeholder: "Todas", onChange: leerFiltrosYRenderizar }
    );
    msel.fAnio = APP.crearMultiSelect(
      document.getElementById("fAnio"), [],
      { placeholder: "Todos", onChange: leerFiltrosYRenderizar }
    );
    msel.fMes = APP.crearMultiSelect(
      document.getElementById("fMes"),
      APP.MES_NOMBRES.map((m, i) => ({ value: String(i + 1), label: m })),
      { placeholder: "Todos", onChange: leerFiltrosYRenderizar }
    );
    msel.fCategoria = APP.crearMultiSelect(
      document.getElementById("fCategoria"),
      CATEGORIAS_CLIENTE.map(c => ({ value: c, label: c })),
      { placeholder: "Todos", onChange: leerFiltrosYRenderizar }
    );
    msel.fClasificacion = APP.crearMultiSelect(
      document.getElementById("fClasificacion"),
      CLASIFICACIONES_LISTA.map(c => ({ value: c, label: c })),
      { placeholder: "Todas", onChange: leerFiltrosYRenderizar }
    );
    refrescarAniosDisponibles();

    document.getElementById("fDesde").addEventListener("change", leerFiltrosYRenderizar);
    document.getElementById("fHasta").addEventListener("change", leerFiltrosYRenderizar);
    document.getElementById("btnLimpiarFiltros").addEventListener("click", () => {
      Object.values(msel).forEach(m => m.limpiar());
      document.getElementById("fDesde").value = "";
      document.getElementById("fHasta").value = "";
      leerFiltrosYRenderizar();
    });
  }

  function refrescarAniosDisponibles() {
    const anios = APP.aniosDisponibles();
    msel.fAnio.setOpciones(anios.map(a => ({ value: String(a), label: String(a) })));
  }

  function leerFiltrosYRenderizar() {
    const f = APP.state.filtros;
    f.clinicas = msel.fClinica.getValues();
    f.sedes = msel.fSede.getValues();
    f.anios = msel.fAnio.getValues().map(Number);
    f.meses = msel.fMes.getValues().map(Number);
    f.categoriasCliente = msel.fCategoria.getValues();
    f.clasificaciones = msel.fClasificacion.getValues();
    f.fechaDesde = document.getElementById("fDesde").value || null;
    f.fechaHasta = document.getElementById("fHasta").value || null;
    clientePagina = 0;
    renderVistaActiva(vistaActivaNombre());
  }

  function renderIndicadorAlmacenamiento() {
    const el = document.getElementById("storageModeIndicator");
    const remoto = APP.modoAlmacenamiento() === "remoto";
    el.className = "storage-mode " + (remoto ? "remoto" : "local");
    el.innerHTML = remoto
      ? `<span class="dot"></span> Supabase (compartido)`
      : `<span class="dot"></span> Local (solo este navegador)`;
  }

  /* ------------------------------------------------------------------------
     SIDEBAR — estado de sedes cargadas
     ------------------------------------------------------------------------ */
  function renderOrgTree() {
    const cont = document.getElementById("orgTreeStatus");
    cont.innerHTML = "";
    APP.ORG.clinicas.forEach(c => {
      const row = document.createElement("div");
      row.className = "clinica-row";
      const nombre = document.createElement("div");
      nombre.className = "clinica-nombre";
      nombre.textContent = c.nombre;
      row.appendChild(nombre);
      c.sedes.forEach(s => {
        const meta = APP.state.metaSedes.find(m => m.sede === s.id);
        const sr = document.createElement("div");
        sr.className = "sede-row";
        sr.innerHTML = `<span>${s.nombre}</span><span class="sede-estado ${meta ? "estado-ok" : "estado-vacio"}">${meta ? APP.formatoNumero(meta.totalFilas) + " filas" : "sin datos"}</span>`;
        row.appendChild(sr);
      });
      cont.appendChild(row);
    });
  }

  /* ------------------------------------------------------------------------
     VISTA: DASHBOARD
     ------------------------------------------------------------------------ */
  function renderKPIs(kpis) {
    const cont = document.getElementById("kpiRow");
    const items = [
      { label: "Admisiones", value: APP.formatoNumero(kpis.totalAdmisiones), sub: `${APP.formatoNumero(kpis.totalLineas)} líneas de servicio` },
      { label: "Valor admisionado", value: APP.formatoCOP(kpis.valorAdmisionado), sub: "" },
      { label: "Valor facturado", value: APP.formatoCOP(kpis.valorFacturado), sub: "" },
      { label: "Valor radicado", value: APP.formatoCOP(kpis.valorRadicado), sub: "" },
      { label: "% Facturación", value: APP.formatoPct(kpis.pctFacturacion), sub: "sobre lo admisionado" },
      { label: "Pendiente por facturar", value: APP.formatoCOP(kpis.pendientePorFacturar), sub: "admisionado − facturado", warn: true },
      { label: "Pendiente por radicar", value: APP.formatoCOP(kpis.pendientePorRadicar), sub: "facturado sin radicar", warn: true }
    ];
    cont.innerHTML = items.map(i => `
      <div class="kpi-card ${i.warn ? "warn" : ""}">
        <div class="kpi-label">${i.label}</div>
        <div class="kpi-value" title="${i.value}">${i.value}</div>
        ${i.sub ? `<div class="kpi-sub">${i.sub}</div>` : ""}
      </div>`).join("");
  }

  /** Tabla principal del panorama: una fila por sede (nunca acumulada en un
   *  solo rubro), con la fecha de la última admisión cargada de cada sede. */
  function renderTablaResumenSede(filas) {
    const tabla = document.getElementById("tablaResumenSede");
    tabla.classList.add("pivot-table");
    if (!filas.length) {
      tabla.innerHTML = `<tbody><tr><td class="txt">Sin datos para los filtros actuales.</td></tr></tbody>`;
      return;
    }
    tabla.innerHTML = `
      <thead><tr>
        <th>Sede</th><th>Clínica</th><th class="num">Admisiones</th><th class="num">Valor admisionado</th>
        <th class="num">Valor facturado</th><th class="num">Pendiente por facturar</th><th class="num">Valor radicado</th><th class="num">Pendiente por radicar</th>
        <th class="num">% Facturación</th><th>Última admisión cargada</th>
      </tr></thead>
      <tbody>
        ${filas.map(f => {
          const meta = APP.state.metaSedes.find(m => m.sede === f.sede.id);
          return coloreaTd(f.sede, `
          <tr>
            <td class="txt col-divisoria" style="border-left-color:${f.sede.color || "#999"}"><strong>${f.sede.nombre}</strong></td>
            <td class="txt">${f.sede.clinicaNombre}</td>
            <td class="num">${APP.formatoNumero(f.kpis.totalAdmisiones)}</td>
            <td class="num">${APP.formatoCOP(f.kpis.valorAdmisionado)}</td>
            <td class="num">${APP.formatoCOP(f.kpis.valorFacturado)}</td>
            <td class="num">${APP.formatoCOP(f.kpis.pendientePorFacturar)}</td>
            <td class="num">${APP.formatoCOP(f.kpis.valorRadicado)}</td>
            <td class="num">${APP.formatoCOP(f.kpis.pendientePorRadicar)}</td>
            <td class="num">${APP.formatoPct(f.kpis.pctFacturacion)}</td>
            <td class="txt">${(meta && meta.fechaMax) || "—"}</td>
          </tr>`);
        }).join("")}
      </tbody>`;
  }

  function renderDashboard() {
    const filtrados = APP.registrosFiltrados();
    renderKPIs(APP.calcularKPIs(filtrados));
    APP.graficoTendenciaPorGrupo("chartTendencia", APP.serieMensualPorGrupo(filtrados, "sede"));
    APP.graficoDonutClasificacion("chartClasificacion", APP.distribucionClasificacion(filtrados));
    renderTablaResumenSede(APP.agruparPorSede(filtrados));
  }

  /* ------------------------------------------------------------------------
     VISTA: COMPARATIVO
     ------------------------------------------------------------------------ */
  function renderTablaVertical(filas) {
    const tabla = document.getElementById("tablaVertical");
    tabla.innerHTML = `
      <thead><tr><th>Sede</th><th class="num">Valor admisionado</th><th class="num">Participación adm.</th><th class="num">Valor facturado</th><th class="num">Participación fact.</th><th class="num">Pendiente por facturar</th></tr></thead>
      <tbody>
        ${filas.map(f => `
          <tr>
            <td class="txt">${f.sede.nombre}</td>
            <td class="num">${APP.formatoCOP(f.kpis.valorAdmisionado)}</td>
            <td class="num">${APP.formatoPct(f.participacion)}</td>
            <td class="num">${APP.formatoCOP(f.kpis.valorFacturado)}</td>
            <td class="num">${APP.formatoPct(f.participacionFacturado)}</td>
            <td class="num">${APP.formatoCOP(f.kpis.pendientePorFacturar)}</td>
          </tr>`).join("")}
      </tbody>`;
  }

  /** Análisis horizontal en formato PARALELO: una fila por mes, con las columnas de
   *  cada sede una junto a la otra para comparar el mismo mes de un vistazo. */
  function renderTablaHorizontalPorSede(datos) {
    const { periodosOrdenados, sedes, porSede } = datos;
    const tabla = document.getElementById("tablaHorizontal");
    tabla.classList.add("pivot-table");

    if (!sedes.length) {
      tabla.innerHTML = `<tbody><tr><td class="txt">Sin datos para los filtros actuales.</td></tr></tbody>`;
      return;
    }

    const headerSedes = sedes.map((s, i) => coloreaTh(s, `<th class="sede-header ${i > 0 ? "col-divisoria" : ""}" colspan="5">${s.nombre}</th>`)).join("");
    const subHeaderSedes = sedes.map((s, i) => coloreaTh(s,
      `<th class="num ${i > 0 ? "col-divisoria" : ""}">Admisionado</th><th class="num">Var. % adm.</th><th class="num">Facturado</th><th class="num">Var. % fact.</th><th class="num">Pendiente por facturar</th>`
    )).join("");

    const filasHtml = periodosOrdenados.map(periodo => {
      const celdas = sedes.map((s, i) => {
        const p = porSede[s.id] && porSede[s.id][periodo];
        const clasePrimeraSede = i === 0 ? "" : "col-divisoria";
        if (!p) {
          return coloreaTd(s, `<td class="num ${clasePrimeraSede}">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td>`);
        }
        return coloreaTd(s, `
          <td class="num ${clasePrimeraSede}">${APP.formatoCOP(p.kpis.valorAdmisionado)}</td>
          ${celdaVariacion(p.variacionAdmisionado)}
          <td class="num">${APP.formatoCOP(p.kpis.valorFacturado)}</td>
          ${celdaVariacion(p.variacionFacturado)}
          <td class="num">${APP.formatoCOP(p.kpis.pendientePorFacturar)}</td>`);
      }).join("");
      return `<tr><td class="txt">${periodo}</td>${celdas}</tr>`;
    }).join("");

    tabla.innerHTML = `
      <thead>
        <tr><th rowspan="2">Periodo</th>${headerSedes}</tr>
        <tr>${subHeaderSedes}</tr>
      </thead>
      <tbody>${filasHtml || `<tr><td class="txt" colspan="99">Sin datos para los filtros actuales.</td></tr>`}</tbody>`;
  }

  /** Resumen por cliente: filtro de búsqueda + paginación por cliente (cada cliente trae sus filas por sede) */
  function renderTablaResumenCliente() {
    const filtrados = APP.registrosFiltrados();
    let resumen = APP.resumenPorClienteYSede(filtrados);

    if (clienteBusqueda.trim()) {
      const q = clienteBusqueda.trim().toUpperCase();
      resumen = resumen.filter(r => r.cliente.toUpperCase().includes(q));
    }

    const totalPaginas = Math.max(1, Math.ceil(resumen.length / CLIENTE_PAGE_SIZE));
    if (clientePagina >= totalPaginas) clientePagina = totalPaginas - 1;
    const inicio = clientePagina * CLIENTE_PAGE_SIZE;
    const pagina = resumen.slice(inicio, inicio + CLIENTE_PAGE_SIZE);

    const filasHtml = [];
    pagina.forEach(grupo => {
      filasHtml.push(`
        <tr class="grupo-inicio">
          <td class="txt"><strong>${grupo.cliente}</strong></td>
          <td class="txt">Todas sus sedes</td>
          <td class="num">${APP.formatoCOP(grupo.total.admisionado)}</td>
          <td class="num">${APP.formatoCOP(grupo.total.facturado)}</td>
          <td class="num">${APP.formatoCOP(grupo.total.pendienteFacturar)}</td>
          <td class="num">${APP.formatoCOP(grupo.total.radicado)}</td>
          <td class="num">${APP.formatoCOP(grupo.total.pendienteRadicar)}</td>
        </tr>`);
      grupo.filasSede.forEach(f => {
        filasHtml.push(`
          <tr>
            <td></td>
            <td class="sede-nombre">${f.sedeNombre} <span style="opacity:.6">(${f.clinicaNombre})</span></td>
            <td class="num">${APP.formatoCOP(f.admisionado)}</td>
            <td class="num">${APP.formatoCOP(f.facturado)}</td>
            <td class="num">${APP.formatoCOP(f.pendienteFacturar)}</td>
            <td class="num">${APP.formatoCOP(f.radicado)}</td>
            <td class="num">${APP.formatoCOP(f.pendienteRadicar)}</td>
          </tr>`);
      });
    });

    document.getElementById("tablaResumenCliente").innerHTML = `
      <thead><tr><th>Cliente</th><th>Sede</th><th class="num">Admisionado</th><th class="num">Facturado</th><th class="num">Pendiente por facturar</th><th class="num">Radicado</th><th class="num">Pendiente por radicar</th></tr></thead>
      <tbody>${filasHtml.join("") || `<tr><td class="txt" colspan="7">Sin resultados para "${clienteBusqueda}".</td></tr>`}</tbody>`;

    document.getElementById("clientePagInfo").textContent = `Página ${clientePagina + 1} de ${totalPaginas} — ${APP.formatoNumero(resumen.length)} clientes`;
    document.getElementById("btnClientePagAnt").disabled = clientePagina === 0;
    document.getElementById("btnClientePagSig").disabled = clientePagina >= totalPaginas - 1;
  }

  function renderComparativo() {
    const filtrados = APP.registrosFiltrados();

    APP.graficoTendenciaPorGrupo("chartSedes", APP.serieMensualPorGrupo(filtrados, "sede"));

    renderTablaVertical(APP.analisisVerticalPorSede(filtrados));
    renderTablaHorizontalPorSede(APP.analisisHorizontalParaleloPorSede(filtrados));
    const catPorSede = APP.distribucionCategoriaClientePorSede(filtrados);
    APP.graficoCategoriaClientePorSede("chartCategoriaAdmisionado", catPorSede, "admisionado");
    APP.graficoCategoriaClientePorSede("chartCategoriaFacturado", catPorSede, "facturado");
    renderTablaResumenCliente();
  }

  /* ------------------------------------------------------------------------
     VISTA: DETALLE
     ------------------------------------------------------------------------ */
  function variacionPct(actual, anterior) {
    if (!anterior) return null;
    return ((actual - anterior) / anterior) * 100;
  }

  function celdaVariacion(v) {
    if (v === null || v === undefined) return `<td class="num">—</td>`;
    const clase = v > 0 ? "pos" : v < 0 ? "neg" : "";
    return `<td class="num ${clase}">${APP.formatoPct(v)}</td>`;
  }

  /** Tabla pivote: filas = tipo de atención, columnas = una por cada sede presente,
   *  con columnas de variación % respecto a la sede anterior de la tabla.
   *  No se omite ningún tipo de atención por valor mínimo. Cada sede lleva un
   *  color tenue de fondo y una línea divisoria para que no se vea apeñuzcado. */
  function renderTablaAtencion(filtrados) {
    const { sedes, filas } = APP.distribucionAtencionPorSede(filtrados);
    const tabla = document.getElementById("tablaAtencion");
    tabla.classList.add("pivot-table");

    if (!sedes.length) {
      tabla.innerHTML = `<tbody><tr><td class="txt">Sin datos para los filtros actuales.</td></tr></tbody>`;
      return;
    }

    const hayComparacion = sedes.length > 1;

    const headerSedes = sedes.map((s, i) => {
      const colspan = i === 0 || !hayComparacion ? 3 : 5;
      const divisoria = i > 0 ? "col-divisoria" : "";
      return coloreaTh(s, `<th class="sede-header ${divisoria}" colspan="${colspan}">${s.nombre}</th>`);
    }).join("");
    const subHeaderSedes = sedes.map((s, i) => {
      const divisoria = i > 0 ? "col-divisoria" : "";
      if (i === 0 || !hayComparacion) return coloreaTh(s, `<th class="num ${divisoria}">Admisionado</th><th class="num">Facturado</th><th class="num">Pendiente por facturar</th>`);
      return coloreaTh(s, `<th class="num ${divisoria}">Admisionado</th><th class="num">Facturado</th><th class="num">Pendiente por facturar</th><th class="num" title="vs ${sedes[i - 1].nombre}">Δ% Adm.</th><th class="num" title="vs ${sedes[i - 1].nombre}">Δ% Fact.</th>`);
    }).join("");

    const filasHtml = filas.map(f => {
      const celdas = sedes.map((s, i) => {
        const v = f.porSede[s.id] || { admisionado: 0, facturado: 0 };
        const pendiente = Math.max(0, v.admisionado - v.facturado);
        const divisoria = i > 0 ? "col-divisoria" : "";
        let html = `<td class="num ${divisoria}">${APP.formatoCOP(v.admisionado)}</td><td class="num">${APP.formatoCOP(v.facturado)}</td><td class="num">${APP.formatoCOP(pendiente)}</td>`;
        if (i > 0 && hayComparacion) {
          const anterior = f.porSede[sedes[i - 1].id] || { admisionado: 0, facturado: 0 };
          html += celdaVariacion(variacionPct(v.admisionado, anterior.admisionado));
          html += celdaVariacion(variacionPct(v.facturado, anterior.facturado));
        }
        return coloreaTd(s, html);
      }).join("");
      return `<tr><td class="txt">${f.atencion}</td>${celdas}<td class="num"><strong>${APP.formatoCOP(f.totalAdm)}</strong></td></tr>`;
    }).join("");

    tabla.innerHTML = `
      <thead>
        <tr><th rowspan="2">Tipo de atención</th>${headerSedes}<th rowspan="2">Total admisionado</th></tr>
        <tr>${subHeaderSedes}</tr>
      </thead>
      <tbody>${filasHtml}</tbody>`;
  }

  function renderDetalle() {
    renderTablaAtencion(APP.registrosFiltrados());
  }

  /* ------------------------------------------------------------------------
     VISTA: CARGAR
     ------------------------------------------------------------------------ */
  function poblarSelectSimple(id, opciones) {
    const sel = document.getElementById(id);
    sel.innerHTML = opciones.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
  }

  function inicializarUpload() {
    poblarSelectSimple("upClinica", APP.ORG.clinicas.map(c => ({ value: c.id, label: c.nombre })));
    actualizarSedesUpload();
    document.getElementById("upClinica").addEventListener("change", actualizarSedesUpload);
    document.getElementById("btnProcesar").addEventListener("click", procesarArchivo);
    document.getElementById("btnBorrarTodo").addEventListener("click", async () => {
      if (!confirm("¿Seguro que deseas borrar TODOS los datos cargados de todas las sedes en este navegador?")) return;
      await APP.borrarTodo();
      await APP.recargarCache();
      refrescarAniosDisponibles();
      renderOrgTree();
      renderCargar();
      renderVistaActiva(vistaActivaNombre());
      toast("Se borraron todos los datos cargados.");
    });
  }

  function actualizarSedesUpload() {
    const clinicaId = document.getElementById("upClinica").value;
    const clinica = APP.getClinica(clinicaId);
    poblarSelectSimple("upSede", clinica.sedes.map(s => ({ value: s.id, label: s.nombre })));
  }

  async function procesarArchivo() {
    const clinicaId = document.getElementById("upClinica").value;
    const sedeId = document.getElementById("upSede").value;
    const input = document.getElementById("upArchivo");
    const estadoDiv = document.getElementById("upEstado");
    const file = input.files[0];

    if (!file) { toast("Selecciona un archivo Excel primero.", "error"); return; }

    estadoDiv.innerHTML = `<span>Procesando ${file.name}…</span>`;
    document.getElementById("btnProcesar").disabled = true;

    try {
      const { registros, faltantes, totalFilasLeidas } = await APP.leerArchivoExcel(file);

      if (!registros.length) {
        throw new Error("El archivo se leyó pero no se encontraron filas válidas (revisa la columna n_admi).");
      }

      await APP.guardarDatosSede(sedeId, clinicaId, registros, { nombreArchivo: file.name }, (hecho, total) => {
        estadoDiv.innerHTML = `<span>Subiendo a Supabase: ${APP.formatoNumero(hecho)} / ${APP.formatoNumero(total)} filas…</span>`;
      });
      await APP.recargarCache();
      refrescarAniosDisponibles();
      renderOrgTree();
      renderCargar();
      renderVistaActiva(vistaActivaNombre());

      const sedeNombre = APP.getSede(sedeId).nombre;
      let html = `<span class="ok">✔ ${registros.length} registros cargados para ${sedeNombre} (de ${totalFilasLeidas} filas leídas).</span>`;
      if (faltantes.length) {
        html += `<ul>Columnas no encontradas en el archivo (se ignoraron): ${faltantes.map(f => `<li><code>${f}</code></li>`).join("")}</ul>`;
      }
      estadoDiv.innerHTML = html;
      toast(`Datos de ${sedeNombre} cargados correctamente.`);
      input.value = "";
    } catch (err) {
      console.error(err);
      estadoDiv.innerHTML = `<span class="err">✘ ${err.message}</span>`;
      toast("Ocurrió un error al procesar el archivo.", "error");
    } finally {
      document.getElementById("btnProcesar").disabled = false;
    }
  }

  function renderCargar() {
    const tabla = document.getElementById("tablaSedesCargadas");
    const metas = APP.state.metaSedes;
    if (!metas.length) {
      tabla.innerHTML = `<tbody><tr><td class="txt">Aún no se ha cargado información de ninguna sede.</td></tr></tbody>`;
      return;
    }
    tabla.innerHTML = `
      <thead><tr>
        <th>Sede</th><th>Clínica</th><th>Archivo</th><th>Filas</th><th>Rango de fechas</th><th>Última carga</th><th></th>
      </tr></thead>
      <tbody>
        ${metas.map(m => {
          const sede = APP.getSede(m.sede) || { nombre: m.sede, clinicaNombre: m.clinica };
          return `
          <tr>
            <td class="txt">${sede.nombre}</td>
            <td class="txt">${sede.clinicaNombre || m.clinica}</td>
            <td class="txt">${m.nombreArchivo || "—"}</td>
            <td>${APP.formatoNumero(m.totalFilas)}</td>
            <td class="txt">${m.fechaMin || "—"} → ${m.fechaMax || "—"}</td>
            <td class="txt">${new Date(m.fechaCarga).toLocaleString("es-CO")}</td>
            <td><button class="btn btn-ghost btn-eliminar-sede" data-sede="${m.sede}">Eliminar</button></td>
          </tr>`;
        }).join("")}
      </tbody>`;

    tabla.querySelectorAll(".btn-eliminar-sede").forEach(btn => {
      btn.addEventListener("click", async () => {
        const sedeId = btn.dataset.sede;
        if (!confirm(`¿Eliminar todos los datos cargados de ${APP.getSede(sedeId).nombre}?`)) return;
        await APP.eliminarDatosSede(sedeId);
        await APP.recargarCache();
        refrescarAniosDisponibles();
        renderOrgTree();
        renderCargar();
        renderVistaActiva(vistaActivaNombre());
        toast("Datos de la sede eliminados.");
      });
    });
  }

  /* ------------------------------------------------------------------------
     INICIALIZACIÓN
     ------------------------------------------------------------------------ */
  function mostrarErrorArranque(err) {
    console.error("Error de arranque:", err);
    const box = document.getElementById("bootError");
    const msg = document.getElementById("bootErrorMsg");
    msg.textContent = (err && err.message) ? err.message : String(err);
    box.classList.remove("hidden");
  }

  function verificarProtocoloArchivo() {
    if (location.protocol === "file:") {
      document.getElementById("fileProtocolWarning").classList.remove("hidden");
    }
  }

  function verificarSoporteIndexedDB() {
    if (APP.supabaseHabilitado()) return; // usando Supabase, no se necesita IndexedDB
    if (!("indexedDB" in window) || !window.indexedDB) {
      throw new Error(
        "Este navegador no permite usar almacenamiento local (IndexedDB) en el modo en que se abrió la página. " +
        "Si la abriste con doble clic desde tu disco, ábrela en su lugar con un servidor local (ver README)."
      );
    }
  }

  async function init() {
    try {
      verificarProtocoloArchivo();
      verificarSoporteIndexedDB();

      document.querySelectorAll(".nav-item").forEach(btn => {
        btn.addEventListener("click", () => activarVista(btn.dataset.view));
      });
      document.getElementById("buscarCliente").addEventListener("input", (e) => {
        clienteBusqueda = e.target.value;
        clientePagina = 0;
        renderTablaResumenCliente();
      });
      document.getElementById("btnClientePagAnt").addEventListener("click", () => { if (clientePagina > 0) { clientePagina--; renderTablaResumenCliente(); } });
      document.getElementById("btnClientePagSig").addEventListener("click", () => { clientePagina++; renderTablaResumenCliente(); });

      inicializarFiltros();
      inicializarUpload();
      renderIndicadorAlmacenamiento();

      await APP.recargarCache();
      refrescarAniosDisponibles();
      renderOrgTree();
      renderDashboard();

      if (!APP.state.registros.length) {
        toast("No hay datos cargados todavía. Ve a 'Cargar información' para subir el primer archivo.");
      }
    } catch (err) {
      mostrarErrorArranque(err);
    }
  }

  window.addEventListener("error", (ev) => {
    // Red de seguridad: si algo revienta antes de tiempo, no dejar la pantalla en blanco sin explicación.
    if (document.getElementById("bootError").classList.contains("hidden") &&
        document.querySelectorAll(".kpi-card").length === 0) {
      mostrarErrorArranque(ev.error || new Error(ev.message));
    }
  });

  document.addEventListener("DOMContentLoaded", init);
})();
