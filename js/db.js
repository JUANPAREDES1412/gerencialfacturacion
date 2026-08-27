/* ============================================================================
   DB.JS — MODO LOCAL (IndexedDB)
   Persistencia en el propio navegador. Se usa automáticamente cuando NO
   hay credenciales de Supabase configuradas en config.js (ver storage.js,
   que decide en tiempo de ejecución si usar este modo o el remoto).
   Cada sede se carga de forma independiente: al subir un nuevo archivo
   para una sede, se reemplazan únicamente los registros de esa sede.
   ============================================================================ */

window.APP = window.APP || {};

const DB_NAME = "informe_gerencial_ips_holding_cg";
const DB_VERSION = 1;
const STORE_REGISTROS = "registros";
const STORE_META = "sedes_meta";

let _dbPromise = null;

function abrirDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE_REGISTROS)) {
        const store = db.createObjectStore(STORE_REGISTROS, { keyPath: "id", autoIncrement: true });
        store.createIndex("sede", "sede", { unique: false });
        store.createIndex("clinica", "clinica", { unique: false });
        store.createIndex("anio", "anio", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "sede" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

/**
 * Reemplaza todos los registros de una sede específica y actualiza su
 * metadata (fecha de carga, filas cargadas, rango de fechas de los datos).
 */
APP.guardarDatosSedeLocal = async function (sedeId, clinicaId, registros, infoArchivo) {
  const db = await abrirDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_REGISTROS, STORE_META], "readwrite");
    const storeReg = tx.objectStore(STORE_REGISTROS);
    const storeMeta = tx.objectStore(STORE_META);
    const idx = storeReg.index("sede");

    // 1. Borrar registros previos de esta sede
    const cursorReq = idx.openCursor(IDBKeyRange.only(sedeId));
    cursorReq.onsuccess = (ev) => {
      const cursor = ev.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        // 2. Insertar los nuevos registros
        registros.forEach(r => {
          r.sede = sedeId;
          r.clinica = clinicaId;
          storeReg.add(r);
        });

        // 3. Actualizar metadata de la sede
        const fechas = registros.map(r => r.f_admi).filter(Boolean).sort();
        storeMeta.put({
          sede: sedeId,
          clinica: clinicaId,
          fechaCarga: new Date().toISOString(),
          nombreArchivo: infoArchivo?.nombreArchivo || "",
          totalFilas: registros.length,
          fechaMin: fechas[0] || null,
          fechaMax: fechas[fechas.length - 1] || null
        });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

APP.obtenerTodosLosRegistrosLocal = async function () {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_REGISTROS], "readonly");
    const store = tx.objectStore(STORE_REGISTROS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

APP.obtenerMetadataSedesLocal = async function () {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META], "readonly");
    const store = tx.objectStore(STORE_META);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

APP.eliminarDatosSedeLocal = async function (sedeId) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_REGISTROS, STORE_META], "readwrite");
    const storeReg = tx.objectStore(STORE_REGISTROS);
    const storeMeta = tx.objectStore(STORE_META);
    const idx = storeReg.index("sede");
    const cursorReq = idx.openCursor(IDBKeyRange.only(sedeId));
    cursorReq.onsuccess = (ev) => {
      const cursor = ev.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    storeMeta.delete(sedeId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

APP.borrarTodoLocal = async function () {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_REGISTROS, STORE_META], "readwrite");
    tx.objectStore(STORE_REGISTROS).clear();
    tx.objectStore(STORE_META).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
