/* ============================================================================
   CONFIG.JS
   Configuración central: estructura organizacional, mapeo de columnas del
   Excel fuente, reglas de categorización de clientes y catálogo de
   clasificación (fórmula de negocio).
   ============================================================================ */

window.APP = window.APP || {};

APP.ORG = {
  holdingName: "IPS Holding CG",
  clinicas: [
    {
      id: "DOLORMED",
      nombre: "Clínica Dolormed",
      color: "#2E6F6B",
      sedes: [
        { id: "TULUA", nombre: "Sede Tuluá", color: "#2E6F6B" },
        { id: "ZARZAL", nombre: "Sede Zarzal", color: "#5FA39D" }
      ]
    },
    {
      id: "REDESIMAT",
      nombre: "Redes IMAT",
      color: "#B5762A",
      sedes: [
        { id: "BUGA", nombre: "Buga", color: "#B5762A" },
        { id: "CERRITO", nombre: "Cerrito", color: "#8A4E9A" },
        { id: "GUACARI", nombre: "Guacarí", color: "#C1553B" }
      ]
    }
  ]
};

// Acceso plano a todas las sedes con referencia a su clínica
APP.ALL_SEDES = APP.ORG.clinicas.flatMap(c =>
  c.sedes.map(s => ({ ...s, clinicaId: c.id, clinicaNombre: c.nombre, color: s.color || c.color }))
);

APP.getSede = function (sedeId) {
  return APP.ALL_SEDES.find(s => s.id === sedeId);
};

APP.getClinica = function (clinicaId) {
  return APP.ORG.clinicas.find(c => c.id === clinicaId);
};

/* ----------------------------------------------------------------------------
   MAPEO DE COLUMNAS DEL EXCEL FUENTE (por nombre de encabezado, robusto a
   reordenamientos de columnas). Los nombres deben coincidir EXACTAMENTE con
   la fila 1 del archivo entregado por las sedes.
   ---------------------------------------------------------------------------- */
APP.COLUMNS = {
  n_admi: "n_admi",              // E  - Número de admisión (clave principal, puede repetirse)
  f_admi: "f_admi",              // F  - Fecha de admisión (eje temporal del informe)
  n_clie: "n_clie",              // J  - Cliente / entidad (ARL, SOAT, prepagada, póliza, particular)
  v_admi: "v_admi",              // M  - Valor admisionado
  n_fact: "n_fact",              // R  - Número de factura (si ya está facturada)
  vf_grantot: "vf_grantot",      // AB - Valor facturado total
  vf_pago: "vf_pago",            // AA - Valor pagado/abonado de la factura
  e_admi: "e_admi",              // AE - Estado de la admisión (1=abierta, 2=cerrada, 3=anulada)
  n_cxc: "n_cxc",                // AK - Número de cuenta de cobro (CXC)
  n_cost: "n_cost",              // AP - Centro de costo (puede venir vacío en el export; ver fallback)
  n_ate01: "n_ate01",            // AR - Sub-atención asociada al centro de costo
  fecha_radicacion: "Fecha radicacion", // AW - Resultado de radicación (fecha, "Pendiente", "No radica" o error)
  observacion: "OBSERVACION",    // AX - Aseguradora / Particular (se recalcula, no se confía en el cache)
  clasificacion_cache: "Clasificacion", // AV - Clasificación cacheada en el Excel (se recalcula siempre)
  n_paci: "n_paci",              // H  - Nombre del paciente (solo para detalle)
  tipo_atencion: "TIPO DE ATENCION" // AU - Tipo de atención
};

/* ----------------------------------------------------------------------------
   Clientes que la fórmula original de OBSERVACION trata como "PARTICULAR"
   de forma literal (columna J = n_clie). Todo lo demás se considera
   "ASEGURADORA".
   ---------------------------------------------------------------------------- */
APP.CLIENTES_PARTICULARES_EXACTOS = [
  "PARTICULAR",
  "PREVISER",
  "DOLORMED VIP",
  "ORGANIZACION PROGRESAR",
  "SIGMA OCUPACIONAL S.A.S",
  "VIVERO EL ROSAL",
  "VIVERO EL JAZMIN"
];

/* ----------------------------------------------------------------------------
   Categorías comerciales (para filtros de negocio). Se infieren del texto de
   n_clie mediante palabras clave, ya que el archivo no trae una columna de
   categoría explícita. Orden de evaluación = prioridad.
   ---------------------------------------------------------------------------- */
APP.CATEGORIA_CLIENTE_REGLAS = [
  { categoria: "ARL", patrones: [/\bARL\b/i] },
  { categoria: "SOAT", patrones: [/\bSOAT\b/i] },
  { categoria: "MEDICINA PREPAGADA", patrones: [/PREPAG/i, /MEDICINA PREPAG/i] },
  { categoria: "POLIZAS DE SALUD", patrones: [/P[OÓ]LIZA/i, /\[SALUD\]/i, /SALUD\)/i] },
  { categoria: "PARTICULARES", patrones: null } // se resuelve por lista exacta, ver classify.js
];
APP.CATEGORIA_CLIENTE_OTROS = "CONVENIOS / EMPRESAS";

/* ----------------------------------------------------------------------------
   Catálogo de clasificación (equivalente a las celdas $BA$5:$BA$14 del Excel)
   ---------------------------------------------------------------------------- */
APP.CLASIFICACIONES = {
  RADICADO_ENTIDAD: "Radicado entidad",
  ADM_ABIERTAS_EN_CERO: "Adm abiertas en cero",
  ADM_ABIERTAS_SIN_FACTURAR: "Adm Abiertas sin facturar",
  ADM_CERRADAS_EN_CERO: "Adm cerradas en cero",
  ADM_CERRADAS_CON_VALOR_SIN_FACTURAR: "Adm cerradas con valor sin facturar",
  ANULADAS: "Anuladas",
  FACTURADO_CON_CXC: "Facturado con CXC",
  FACTURADO_SIN_CXC: "Facturado sin CXC",
  NO_RADICA: "No radica",
  PARTICULAR: "Particular"
};

// Colores por clasificación (para gráficos de distribución)
APP.COLOR_CLASIFICACION = {
  "Radicado entidad": "#2E6F6B",
  "Adm abiertas en cero": "#9AA5B1",
  "Adm Abiertas sin facturar": "#E0A458",
  "Adm cerradas en cero": "#5C7A99",
  "Adm cerradas con valor sin facturar": "#C1553B",
  "Anuladas": "#7A7A7A",
  "Facturado con CXC": "#3F8F76",
  "Facturado sin CXC": "#B5762A",
  "No radica": "#A83246",
  "Particular": "#4C6A92"
};

// Paleta general de la app
APP.THEME = {
  navy: "#122031",
  teal: "#2E6F6B",
  amber: "#B5762A",
  danger: "#A83246",
  bg: "#F5F3EE"
};

/* ----------------------------------------------------------------------------
   SUPABASE (opcional)
   Si completas estos dos valores con los de tu proyecto de Supabase, la app
   guarda y lee los datos desde allí (compartido entre todas las sedes y
   cualquier persona que abra el informe). Si los dejas vacíos, la app sigue
   funcionando normalmente pero cada navegador guarda su propia copia local
   (IndexedDB) y no se comparte con nadie más.

   Dónde conseguirlos: en tu proyecto de Supabase → Settings → API →
   "Project URL" y "anon public" key.
   ---------------------------------------------------------------------------- */
APP.SUPABASE = {
  url: "",      // ej: "https://abcdefghijk.supabase.co"
  anonKey: ""   // ej: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9......"
};
