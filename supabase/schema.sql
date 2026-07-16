-- ============================================================================
-- Informe Gerencial IPS Holding CG — esquema de Supabase
-- Ejecuta este script completo en: tu proyecto de Supabase → SQL Editor → New query → Run
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

-- 3. Seguridad a nivel de fila (RLS)
-- Esta app no tiene login de usuarios: usa la clave pública "anon" de Supabase
-- para leer y escribir. Estas políticas permiten leer y escribir a cualquiera
-- que tenga la URL y la clave "anon" de tu proyecto (que quedan visibles en
-- el código del sitio publicado). Es aceptable para un informe interno de
-- uso controlado, pero NO uses este esquema si el sitio va a ser público sin
-- control de acceso. Ver README, sección Supabase, para cómo restringirlo.
alter table registros enable row level security;
alter table sedes_meta enable row level security;

create policy "permitir lectura registros" on registros
  for select using (true);
create policy "permitir escritura registros" on registros
  for insert with check (true);
create policy "permitir borrado registros" on registros
  for delete using (true);
create policy "permitir actualizacion registros" on registros
  for update using (true);

create policy "permitir lectura meta" on sedes_meta
  for select using (true);
create policy "permitir escritura meta" on sedes_meta
  for insert with check (true);
create policy "permitir actualizacion meta" on sedes_meta
  for update using (true);
create policy "permitir borrado meta" on sedes_meta
  for delete using (true);
