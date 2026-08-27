/* ============================================================================
   STORAGE.JS
   Punto único que usa el resto de la app (app.js) para guardar/leer datos.
   Decide automáticamente si usar Supabase (remoto, compartido) o IndexedDB
   (local, por navegador) según si hay credenciales de Supabase en config.js.
   ============================================================================ */

window.APP = window.APP || {};

APP.modoAlmacenamiento = function () {
  return APP.supabaseHabilitado() ? "remoto" : "local";
};

APP.guardarDatosSede = function (sedeId, clinicaId, registros, infoArchivo, onProgreso) {
  return APP.supabaseHabilitado()
    ? APP.guardarDatosSedeRemoto(sedeId, clinicaId, registros, infoArchivo, onProgreso)
    : APP.guardarDatosSedeLocal(sedeId, clinicaId, registros, infoArchivo);
};

APP.obtenerTodosLosRegistros = function () {
  return APP.supabaseHabilitado() ? APP.obtenerTodosLosRegistrosRemoto() : APP.obtenerTodosLosRegistrosLocal();
};

APP.obtenerMetadataSedes = function () {
  return APP.supabaseHabilitado() ? APP.obtenerMetadataSedesRemoto() : APP.obtenerMetadataSedesLocal();
};

APP.eliminarDatosSede = function (sedeId) {
  return APP.supabaseHabilitado() ? APP.eliminarDatosSedeRemoto(sedeId) : APP.eliminarDatosSedeLocal(sedeId);
};

APP.borrarTodo = function () {
  return APP.supabaseHabilitado() ? APP.borrarTodoRemoto() : APP.borrarTodoLocal();
};
