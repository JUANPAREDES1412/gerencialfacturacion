-- ============================================================================
-- Informe Gerencial IPS Holding CG — esquema de Supabase (con autenticación)
-- Ejecuta este script completo en: tu proyecto de Supabase → SQL Editor → New query → Run
-- Se puede volver a ejecutar sin error (usa "if not exists" / "drop ... if exists").
-- ============================================================================

-- 1. Tabla de registros (una fila por línea de admisión/servicio)
create table if not exists registros (
  id            bigint generated always as identity primary key,
  n_admi        text,
  f_admi        date,
  n_clie        text,
  v_admi        numeric,
  n_fact        text,
  vf_grantot    numeric,
  vf_pago       numeric,
  e_admi        int,
  n_cxc         text,
  n_cost        text,
  n_ate01       text,
  fecha_radicacion text,
  n_paci        text,
  tipo_atencion text,
  clasificacion text,
  observacion   text,
  categoria_cliente text,
  anio          int,
  mes           int,
  facturada     boolean,
  sede          text not null,
  clinica       text not null,
  creado_en     timestamptz default now()
);

create index if not exists idx_registros_sede on registros (sede);
create index if not exists idx_registros_clinica on registros (clinica);
create index if not exists idx_registros_anio_mes on registros (anio, mes);
create index if not exists idx_registros_n_admi on registros (n_admi);

-- 2. Tabla de metadata por sede (última carga)
create table if not exists sedes_meta (
  sede          text primary key,
  clinica       text,
  fecha_carga   timestamptz,
  nombre_archivo text,
  total_filas   int,
  fecha_min     date,
  fecha_max     date
);

-- 3. Tabla de perfiles (rol de cada usuario: admin o consulta)
-- El correo debe coincidir EXACTAMENTE con el correo de una cuenta creada en
-- Authentication > Users. Esta tabla es la que decide qué puede hacer cada
-- quien dentro de la app; la cuenta de acceso (correo+contraseña) se crea
-- aparte, en el panel de Supabase (ver README).
create table if not exists perfiles (
  email     text primary key,
  nombre    text,
  rol       text not null check (rol in ('admin','consulta')),
  creado_en timestamptz default now()
);

alter table registros enable row level security;
alter table sedes_meta enable row level security;
alter table perfiles enable row level security;

-- Función auxiliar: ¿el usuario autenticado actual es administrador?
-- (security definer para poder consultar "perfiles" sin caer en recursión de RLS)
create or replace function es_administrador()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles
    where email = (auth.jwt() ->> 'email')
    and rol = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Políticas: PERFILES
-- Cualquier usuario autenticado puede leer su propia fila (para saber su
-- rol al iniciar sesión); los administradores pueden leer, crear, editar y
-- borrar cualquier fila (para gestionar usuarios desde la app).
-- ---------------------------------------------------------------------------
drop policy if exists "perfiles: leer propio o admin" on perfiles;
drop policy if exists "perfiles: solo admin inserta" on perfiles;
drop policy if exists "perfiles: solo admin actualiza" on perfiles;
drop policy if exists "perfiles: solo admin borra" on perfiles;

create policy "perfiles: leer propio o admin" on perfiles
  for select using (
    email = (auth.jwt() ->> 'email') or es_administrador()
  );
create policy "perfiles: solo admin inserta" on perfiles
  for insert with check (es_administrador());
create policy "perfiles: solo admin actualiza" on perfiles
  for update using (es_administrador());
create policy "perfiles: solo admin borra" on perfiles
  for delete using (es_administrador());

-- ---------------------------------------------------------------------------
-- Políticas: REGISTROS y SEDES_META
-- Solo usuarios AUTENTICADOS pueden leer (ya no acceso anónimo/público).
-- Solo ADMINISTRADORES pueden cargar, actualizar o eliminar información.
-- ---------------------------------------------------------------------------
drop policy if exists "permitir lectura registros" on registros;
drop policy if exists "permitir escritura registros" on registros;
drop policy if exists "permitir borrado registros" on registros;
drop policy if exists "permitir actualizacion registros" on registros;
drop policy if exists "registros: leer solo autenticados" on registros;
drop policy if exists "registros: escribir solo admin" on registros;
drop policy if exists "registros: actualizar solo admin" on registros;
drop policy if exists "registros: borrar solo admin" on registros;

create policy "registros: leer solo autenticados" on registros
  for select using (auth.role() = 'authenticated');
create policy "registros: escribir solo admin" on registros
  for insert with check (es_administrador());
create policy "registros: actualizar solo admin" on registros
  for update using (es_administrador());
create policy "registros: borrar solo admin" on registros
  for delete using (es_administrador());

drop policy if exists "permitir lectura meta" on sedes_meta;
drop policy if exists "permitir escritura meta" on sedes_meta;
drop policy if exists "permitir actualizacion meta" on sedes_meta;
drop policy if exists "permitir borrado meta" on sedes_meta;
drop policy if exists "meta: leer solo autenticados" on sedes_meta;
drop policy if exists "meta: escribir solo admin" on sedes_meta;
drop policy if exists "meta: actualizar solo admin" on sedes_meta;
drop policy if exists "meta: borrar solo admin" on sedes_meta;

create policy "meta: leer solo autenticados" on sedes_meta
  for select using (auth.role() = 'authenticated');
create policy "meta: escribir solo admin" on sedes_meta
  for insert with check (es_administrador());
create policy "meta: actualizar solo admin" on sedes_meta
  for update using (es_administrador());
create policy "meta: borrar solo admin" on sedes_meta
  for delete using (es_administrador());

-- ============================================================================
-- PASO MANUAL — hazlo en este orden:
-- 1) Ve a Authentication > Users > "Add user" y crea las 2 cuentas de tus
--    administradores (correo + contraseña temporal). Anota los correos
--    exactos que usaste.
-- 2) Reemplaza los correos de ejemplo de abajo por esos correos reales.
-- 3) Quita los dos guiones "--" de las líneas "insert into perfiles..." para
--    activarlas, y corre TODO este script una vez más.
-- ============================================================================
-- insert into perfiles (email, rol) values
--   ('admin1@tudominio.com', 'admin'),
--   ('admin2@tudominio.com', 'admin')
-- on conflict (email) do update set rol = excluded.rol;
