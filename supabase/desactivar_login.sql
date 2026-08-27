-- ============================================================================
-- Informe Gerencial IPS Holding CG — DESACTIVAR el requisito de inicio de sesión
-- Ejecuta este script en: tu proyecto de Supabase → SQL Editor → New query → Run
--
-- Qué hace: vuelve a permitir leer y cargar datos sin necesidad de iniciar
-- sesión (como al principio, antes de agregar usuarios). NO borra la tabla
-- de usuarios ("perfiles") ni las cuentas que ya creaste — si más adelante
-- quieres volver a exigir login, solo hay que volver a correr las políticas
-- de "solo autenticados / solo admin" de supabase/schema.sql y poner
-- APP.REQUERIR_LOGIN = true en js/config.js.
-- ============================================================================

drop policy if exists "registros: leer solo autenticados" on registros;
drop policy if exists "registros: escribir solo admin" on registros;
drop policy if exists "registros: actualizar solo admin" on registros;
drop policy if exists "registros: borrar solo admin" on registros;

create policy "registros: acceso abierto (login desactivado)" on registros
  for all using (true) with check (true);

drop policy if exists "meta: leer solo autenticados" on sedes_meta;
drop policy if exists "meta: escribir solo admin" on sedes_meta;
drop policy if exists "meta: actualizar solo admin" on sedes_meta;
drop policy if exists "meta: borrar solo admin" on sedes_meta;

create policy "meta: acceso abierto (login desactivado)" on sedes_meta
  for all using (true) with check (true);

-- Nota: la tabla "perfiles" y sus políticas quedan intactas, no hace falta
-- tocarlas — simplemente no se usan mientras APP.REQUERIR_LOGIN esté en false.
