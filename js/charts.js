/* ============================================================================
   CHARTS.JS
   Formato de cifras en pesos colombianos y constructores de gráficos
   (Chart.js) reutilizados por las distintas vistas.
   ============================================================================ */

window.APP = window.APP || {};

const _chartRegistry = {};

APP.formatoCOP = function (valor) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor || 0);
};

APP.formatoCOPCorto = function (valor) {
  const v = valor || 0;
  const abs = Math.abs(v);
  if (abs >= 1e9) return "$" + (v / 1e9).toFixed(1) + " mil M";
  if (abs >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
  return "$" + v.toFixed(0);
};

APP.formatoNumero = function (valor) {
  return new Intl.NumberFormat("es-CO").format(valor || 0);
};

APP.formatoPct = function (valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return "—";
  return valor.toFixed(1) + "%";
};

APP.MES_NOMBRES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function destruirSiExiste(canvasId) {
  if (_chartRegistry[canvasId]) {
    _chartRegistry[canvasId].destroy();
    delete _chartRegistry[canvasId];
  }
}

const FONT_FAMILY = "'Inter', system-ui, sans-serif";

const DEFAULT_OPTS_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { font: { family: FONT_FAMILY, size: 12 }, color: "#122031" } },
    tooltip: { titleFont: { family: FONT_FAMILY }, bodyFont: { family: FONT_FAMILY } }
  }
};

/** Dona de distribución por clasificación */
APP.graficoDonutClasificacion = function (canvasId, distribucion) {
  destruirSiExiste(canvasId);
  const ctx = document.getElementById(canvasId).getContext("2d");
  _chartRegistry[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: distribucion.map(d => d.clasificacion),
      datasets: [{
        data: distribucion.map(d => d.cantidad),
        backgroundColor: distribucion.map(d => APP.COLOR_CLASIFICACION[d.clasificacion] || "#999")
      }]
    },
    options: {
      ...DEFAULT_OPTS_BASE,
      cutout: "62%",
      plugins: {
        ...DEFAULT_OPTS_BASE.plugins,
        legend: { position: "right", labels: { font: { family: FONT_FAMILY, size: 11 }, color: "#122031", boxWidth: 12 } }
      }
    }
  });
};

/**
 * Barras agrupadas por categoría de cliente, con una barra por SEDE
 * (mismo color que en los gráficos de tendencia), para comparar las sedes
 * filtradas entre sí en vez de acumular todo en un solo total.
 * @param {string} canvasId
 * @param {{categorias:string[], sedes:Array, porSedeCategoria:object}} datos
 * @param {"admisionado"|"facturado"} metrica
 */
APP.graficoCategoriaClientePorSede = function (canvasId, datos, metrica) {
  destruirSiExiste(canvasId);
  const ctx = document.getElementById(canvasId).getContext("2d");
  const { categorias, sedes, porSedeCategoria } = datos;
  const paletaFallback = ["#2E6F6B", "#B5762A", "#8A4E9A", "#C1553B", "#5C7A99", "#3F8F76"];

  const datasets = sedes.map((s, i) => ({
    label: s.nombre,
    data: categorias.map(cat => {
      const v = porSedeCategoria[s.id] && porSedeCategoria[s.id][cat];
      return v ? v[metrica] : 0;
    }),
    backgroundColor: s.color || paletaFallback[i % paletaFallback.length]
  }));

  _chartRegistry[canvasId] = new Chart(ctx, {
    type: "bar",
    data: { labels: categorias, datasets },
    options: {
      ...DEFAULT_OPTS_BASE,
      scales: {
        y: { ticks: { callback: (v) => APP.formatoCOPCorto(v), font: { family: FONT_FAMILY } }, grid: { color: "#E4E0D6" } },
        x: { ticks: { font: { family: FONT_FAMILY, size: 10.5 } }, grid: { display: false } }
      },
      plugins: {
        ...DEFAULT_OPTS_BASE.plugins,
        legend: { labels: { font: { family: FONT_FAMILY, size: 11 }, color: "#122031", boxWidth: 11 } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${APP.formatoCOP(c.raw)}` } }
      }
    }
  });
};

/**
 * Gráfico de tendencia mensual con una línea por grupo (sede o clínica),
 * mostrando Valor Admisionado (línea sólida) y Valor Facturado (línea
 * punteada) de cada grupo. El tooltip usa modo "index" para mostrar en el
 * cursor el detalle de TODOS los grupos en el mes señalado a la vez.
 * @param {string} canvasId
 * @param {{grupos: Array, periodosOrdenados: string[]}} datos  de APP.serieMensualPorGrupo
 */
APP.graficoTendenciaPorGrupo = function (canvasId, datos) {
  destruirSiExiste(canvasId);
  const ctx = document.getElementById(canvasId).getContext("2d");
  const { grupos, periodosOrdenados } = datos;

  const paletaFallback = ["#2E6F6B", "#B5762A", "#8A4E9A", "#C1553B", "#5C7A99", "#3F8F76"];

  const datasets = [];
  grupos.forEach((g, i) => {
    const color = g.color || paletaFallback[i % paletaFallback.length];
    const porPeriodo = {};
    g.serie.forEach(p => { porPeriodo[p.periodo] = p.kpis; });

    datasets.push({
      label: `${g.nombre} · Admisionado`,
      data: periodosOrdenados.map(p => (porPeriodo[p] ? porPeriodo[p].valorAdmisionado : null)),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.25,
      spanGaps: true
    });
    datasets.push({
      label: `${g.nombre} · Facturado`,
      data: periodosOrdenados.map(p => (porPeriodo[p] ? porPeriodo[p].valorFacturado : null)),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      borderDash: [5, 4],
      pointRadius: 2,
      tension: 0.25,
      spanGaps: true
    });
  });

  _chartRegistry[canvasId] = new Chart(ctx, {
    type: "line",
    data: { labels: periodosOrdenados, datasets },
    options: {
      ...DEFAULT_OPTS_BASE,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { ticks: { callback: (v) => APP.formatoCOPCorto(v), font: { family: FONT_FAMILY } }, grid: { color: "#E4E0D6" } },
        x: { ticks: { font: { family: FONT_FAMILY } }, grid: { display: false } }
      },
      plugins: {
        ...DEFAULT_OPTS_BASE.plugins,
        legend: { labels: { font: { family: FONT_FAMILY, size: 10.5 }, color: "#122031", boxWidth: 10 } },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: { label: (c) => `${c.dataset.label}: ${APP.formatoCOP(c.raw)}` }
        }
      }
    }
  });
};
