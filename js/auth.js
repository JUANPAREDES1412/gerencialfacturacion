/* ============================================================================
   AUTH.JS
   Autenticación real con Supabase Auth — funciona desde cualquier navegador
   o computador (no depende de ningún PC en particular), porque la sesión
   vive en la cuenta de Supabase, no en el disco local.

   Modelo de roles:
   - "admin": puede cargar/eliminar datos de sedes y gestionar usuarios.
   - "consulta": solo puede ver los informes (lectura).

   Importante: la CUENTA de acceso (correo + contraseña) se crea una vez en
   el panel de Supabase (Authentication > Users) — no se puede crear de forma
   segura solo con código de navegador. Lo que SÍ se hace desde esta app es
   asignar el ROL a una cuenta que ya exista (tabla "perfiles").
   ============================================================================ */

window.APP = window.APP || {};

APP.auth = {
  sesion: null,
  perfil: null // { email, nombre, rol }
};

/** Si no hay Supabase configurado, o si el login está desactivado en
 *  config.js (APP.REQUERIR_LOGIN = false), no se exige autenticación. */
APP.authDisponible = function () {
  return APP.supabaseHabilitado() && APP.REQUERIR_LOGIN === true;
};

function traducirErrorAuth(msg) {
  if (/Invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos.";
  if (/Email not confirmed/i.test(msg)) return "Esta cuenta aún no ha confirmado su correo.";
  if (/User not found/i.test(msg)) return "No existe una cuenta con ese correo.";
  return msg;
}

APP.obtenerSesionActual = async function () {
  const sb = APP.obtenerClienteSupabase();
  const { data } = await sb.auth.getSession();
  APP.auth.sesion = data.session;
  return data.session;
};

/** Carga el perfil (rol) del usuario actualmente autenticado desde la tabla "perfiles" */
APP.cargarPerfilActual = async function () {
  const sb = APP.obtenerClienteSupabase();
  const email = APP.auth.sesion && APP.auth.sesion.user && APP.auth.sesion.user.email;
  if (!email) { APP.auth.perfil = null; return null; }

  const { data, error } = await sb.from("perfiles").select("*").eq("email", email).maybeSingle();
  if (error) {
    throw new Error(
      "No se pudo verificar tu rol de usuario (" + error.message + "). " +
      "Si acabas de crear tu cuenta, pide a un administrador que te asigne un rol en 'Gestión de usuarios'."
    );
  }
  if (!data) {
    throw new Error(
      "Tu cuenta existe pero todavía no tiene un rol asignado. Pide a un administrador que te agregue en 'Gestión de usuarios'."
    );
  }
  APP.auth.perfil = data;
  return APP.auth.perfil;
};

APP.iniciarSesion = async function (email, password) {
  const sb = APP.obtenerClienteSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(traducirErrorAuth(error.message));
  APP.auth.sesion = data.session;
  await APP.cargarPerfilActual();
  return APP.auth.perfil;
};

APP.cerrarSesion = async function () {
  const sb = APP.obtenerClienteSupabase();
  await sb.auth.signOut();
  APP.auth.sesion = null;
  APP.auth.perfil = null;
};

APP.esAdmin = function () {
  return Boolean(APP.auth.perfil && APP.auth.perfil.rol === "admin");
};

/* ----------------------------------------------------------------------------
   Gestión de usuarios (solo visible/permitido para administradores; la base
   de datos también lo exige vía RLS, no solo la interfaz).
   ---------------------------------------------------------------------------- */
APP.listarPerfiles = async function () {
  const sb = APP.obtenerClienteSupabase();
  const { data, error } = await sb.from("perfiles").select("*").order("creado_en", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
};

APP.crearOActualizarPerfil = async function (email, rol, nombre) {
  const sb = APP.obtenerClienteSupabase();
  const { error } = await sb.from("perfiles").upsert({
    email: email.trim().toLowerCase(),
    rol,
    nombre: nombre ? nombre.trim() : null
  });
  if (error) throw new Error(error.message);
};

APP.eliminarPerfil = async function (email) {
  const sb = APP.obtenerClienteSupabase();
  const { error } = await sb.from("perfiles").delete().eq("email", email);
  if (error) throw new Error(error.message);
};
