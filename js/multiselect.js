/* ============================================================================
   MULTISELECT.JS
   Dropdown con casillas de verificación para selección múltiple, en
   reemplazo de los <select multiple> nativos (que exigen Ctrl+clic y son
   poco intuitivos). Se usa en la barra de filtros globales.
   ============================================================================ */

window.APP = window.APP || {};

/**
 * Crea un multiselect dentro de un contenedor.
 * @param {HTMLElement} contenedor  div vacío donde se renderiza el widget
 * @param {Array<{value:string, label:string}>} opciones
 * @param {object} cfg  { placeholder, onChange(valoresSeleccionados) }
 * @returns {{ getValues():string[], setValues(arr):void, setOpciones(arr):void }}
 */
APP.crearMultiSelect = function (contenedor, opciones, cfg) {
  const config = Object.assign({ placeholder: "Todas", onChange: () => {} }, cfg || {});
  let opts = opciones || [];
  let seleccion = new Set();

  contenedor.classList.add("msel");
  contenedor.innerHTML = `
    <button type="button" class="msel-btn"><span class="msel-label"></span><span class="msel-caret">▾</span></button>
    <div class="msel-panel hidden">
      <div class="msel-actions">
        <button type="button" data-act="all">Todas</button>
        <button type="button" data-act="none">Ninguna</button>
      </div>
      <div class="msel-opts"></div>
    </div>`;

  const btn = contenedor.querySelector(".msel-btn");
  const label = contenedor.querySelector(".msel-label");
  const panel = contenedor.querySelector(".msel-panel");
  const optsBox = contenedor.querySelector(".msel-opts");

  function renderOpciones() {
    optsBox.innerHTML = opts.map(o => `
      <label class="msel-opt">
        <input type="checkbox" value="${o.value}" ${seleccion.has(o.value) ? "checked" : ""}>
        <span>${o.label}</span>
      </label>`).join("");
  }

  function actualizarLabel() {
    if (seleccion.size === 0) label.textContent = config.placeholder;
    else if (seleccion.size === opts.length) label.textContent = `Todas (${opts.length})`;
    else if (seleccion.size <= 2) {
      const textos = opts.filter(o => seleccion.has(o.value)).map(o => o.label);
      label.textContent = textos.join(", ");
    } else {
      label.textContent = `${seleccion.size} seleccionadas`;
    }
  }

  function emitirCambio() {
    actualizarLabel();
    config.onChange(Array.from(seleccion));
  }

  renderOpciones();
  actualizarLabel();

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const abierto = !panel.classList.contains("hidden");
    document.querySelectorAll(".msel-panel").forEach(p => p.classList.add("hidden"));
    if (!abierto) panel.classList.remove("hidden");
  });

  optsBox.addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    if (e.target.checked) seleccion.add(e.target.value);
    else seleccion.delete(e.target.value);
    emitirCambio();
  });

  panel.querySelector('[data-act="all"]').addEventListener("click", () => {
    seleccion = new Set(opts.map(o => o.value));
    renderOpciones();
    emitirCambio();
  });
  panel.querySelector('[data-act="none"]').addEventListener("click", () => {
    seleccion = new Set();
    renderOpciones();
    emitirCambio();
  });

  document.addEventListener("click", (e) => {
    if (!contenedor.contains(e.target)) panel.classList.add("hidden");
  });

  return {
    getValues: () => Array.from(seleccion),
    setValues: (arr) => { seleccion = new Set(arr || []); renderOpciones(); actualizarLabel(); },
    setOpciones: (nuevasOpciones) => {
      opts = nuevasOpciones || [];
      // conservar solo selecciones que sigan existiendo
      seleccion = new Set(Array.from(seleccion).filter(v => opts.some(o => o.value === v)));
      renderOpciones();
      actualizarLabel();
    },
    limpiar: () => { seleccion = new Set(); renderOpciones(); actualizarLabel(); }
  };
};
