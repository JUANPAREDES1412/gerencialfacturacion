Informe Gerencial IPS Holding CG
Aplicación web (100% client-side) para el informe gerencial comparativo de admisiones y facturación de Clínica Dolormed (sedes Tuluá y Zarzal) y Redes IMAT (sedes Buga, Cerrito y Guacarí).
Permite cargar el Excel de facturación de cada sede de forma independiente, recalcula automáticamente la fórmula de clasificación de cartera y consolida todo en un panorama global con comparativos, análisis vertical/horizontal y detalle filtrable por año, mes y día.
No requiere backend ni base de datos externa: toda la información se procesa y se guarda en el propio navegador (IndexedDB), por lo que puede publicarse directamente en GitHub Pages.
---
1. Registro y publicación paso a paso
1.1 GitHub (para publicar la app)
Ve a github.com y crea una cuenta gratuita (botón "Sign up") si no tienes una.
Ya dentro, haz clic en el botón "+" (arriba a la derecha) → "New repository".
Ponle un nombre, por ejemplo `informe-gerencial-ips-holding-cg`. Déjalo en Public (para que Pages funcione gratis) y no marques ninguna casilla adicional. Clic en "Create repository".
En la página del repo recién creado, busca el enlace "uploading an existing file" (o el botón "Add file" → "Upload files").
Extrae el `.zip` que te entregué en tu computador y arrastra todo el contenido de la carpeta `informe-gerencial-ips/` (no la carpeta en sí, sino lo que hay adentro: `index.html`, `css/`, `js/`, `README.md`, etc.) a esa pantalla de subida.
Escribe un mensaje de commit (ej. "Primera versión") y clic en "Commit changes".
Ve a la pestaña Settings del repo → menú lateral Pages → en "Build and deployment", en Source elige "Deploy from a branch", rama `main`, carpeta `/ (root)` → Save.
Espera 1-2 minutos y recarga la página; GitHub te mostrará la URL pública, algo como:
`https://tu-usuario.github.io/informe-gerencial-ips-holding-cg/`
Esa es la dirección que le compartes a quien deba revisar el informe.
> Alternativa para quienes usan Git por terminal: `git init`, `git add .`, `git commit -m "primera version"`, `git remote add origin <URL-de-tu-repo>`, `git push -u origin main`, y luego el mismo paso 7 de arriba.
1.2 Supabase (para que los datos se compartan entre sedes, no solo en tu navegador)
Por defecto la app guarda los datos únicamente en el navegador donde los cargaste (IndexedDB). Si quieres que cualquier sede pueda cargar su archivo y que todos vean el mismo informe consolidado desde `https://tu-usuario.github.io/...`, necesitas una base de datos compartida — ahí entra Supabase (tiene un plan gratuito más que suficiente para esto).
Ve a supabase.com → "Start your project" → crea una cuenta (puedes usar tu cuenta de GitHub directamente, es más rápido).
Clic en "New project". Ponle un nombre (ej. `ips-holding-cg`), define una contraseña de base de datos (guárdala, no la necesitarás en el día a día pero es la llave maestra), elige la región más cercana (ej. `South America (São Paulo)`) y clic en "Create new project".
Espera 1-2 minutos mientras Supabase aprovisiona el proyecto.
En el menú lateral, ve a SQL Editor → "New query". Abre el archivo `supabase/schema.sql` que viene en este proyecto, copia todo su contenido, pégalo ahí y clic en "Run". Esto crea las dos tablas (`registros` y `sedes_meta`) que la app necesita.
Ve a Settings (ícono de engranaje) → API. Copia dos valores:
Project URL (algo como `https://abcdefghijk.supabase.co`)
anon public key (una clave larga que empieza con `eyJ...`)
Abre el archivo `js/config.js` de tu proyecto y pega esos dos valores donde dice:
```js
   APP.SUPABASE = {
     url: "https://abcdefghijk.supabase.co",
     anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....."
   };
   ```
Sube ese archivo actualizado a GitHub (edítalo directamente en GitHub: entra al archivo → ícono de lápiz "Edit" → pega los cambios → "Commit changes"), o vuelve a subir todo el proyecto si prefieres.
Listo — recarga la app publicada. En la barra lateral verás el indicador cambiar de "Local (solo este navegador)" a "Supabase (compartido)". Desde ese momento, cualquier archivo que cargues desde cualquier computador queda visible para todos los que abran el enlace.
Nota de seguridad: desde que se agregó autenticación (ver sección 1.3), esta clave `anon` ya NO permite leer ni escribir datos por sí sola — solo sirve para iniciar sesión. Sin una cuenta con rol asignado, nadie puede ver ni cargar información, aunque conozca la URL de tu app.
---
1.3 Autenticación y usuarios (quién puede ver y quién puede cargar datos)
Por defecto esta función está DESACTIVADA (`APP.REQUERIR_LOGIN = false` en `js/config.js`) — la app entra directo, sin pedir usuario ni contraseña, igual que en modo Supabase sin login. Actívala solo si de verdad necesitas restringir quién ve el informe.
Para activarla:
Corre el bloque de políticas "solo autenticados / solo admin" de `supabase/schema.sql` (ya está en ese archivo).
Crea tus administradores como se explica más abajo.
En `js/config.js`, pon `APP.REQUERIR_LOGIN = true;` y sube el cambio a GitHub.
Para desactivarla de nuevo más adelante (sin perder los usuarios ya creados):
Corre `supabase/desactivar_login.sql` (vuelve el acceso a la base de datos a abierto).
En `js/config.js`, pon `APP.REQUERIR_LOGIN = false;` y sube el cambio a GitHub.
Una vez activado, hay dos roles:
admin: puede ver todo, cargar/eliminar datos de sedes, y gestionar usuarios.
consulta: solo puede ver los informes (no ve "Cargar información" ni "Gestión de usuarios").
Esta restricción está aplicada a nivel de base de datos (Row Level Security), no solo escondida en la pantalla — así que no se puede saltar editando el navegador.
Crear tus 2 administradores iniciales:
En Supabase, ve a Authentication → Users → "Add user". Crea la cuenta del primer administrador: correo + contraseña (puedes marcar "Auto Confirm User" para que no tenga que confirmar por correo). Repite para el segundo administrador.
Ve a SQL Editor → New query. Al final de `supabase/schema.sql` verás un bloque comentado:
```sql
   -- insert into perfiles (email, rol) values
   --   ('admin1@tudominio.com', 'admin'),
   --   ('admin2@tudominio.com', 'admin')
   -- on conflict (email) do update set rol = excluded.rol;
   ```
Copia esas 3 líneas en una consulta nueva, quita los `--` del principio, reemplaza los correos por los que usaste en el paso 1, y dale Run.
Listo — entra a tu app publicada con ese correo y esa contraseña.
Agregar más usuarios después (desde la app, sin volver a tocar SQL):
Como administrador, primero crea la cuenta de acceso de la persona en Supabase (Authentication → Users → Add user) — dale el correo y una contraseña temporal, y compártesela por otro medio (no por la app).
En la app, entra a "Gestión de usuarios" (solo visible para administradores).
Escribe ese mismo correo, un nombre (opcional), elige el rol — "Consulta" para quien solo debe ver el informe, "Administrador" para quien también debe poder cargar datos — y clic en Guardar.
Esa persona ya puede entrar a la app con el correo y contraseña que le diste, desde cualquier computador o navegador.
Para quitarle el acceso a alguien, usa el botón "Eliminar" junto a su nombre en "Gestión de usuarios" (esto le quita el rol, con lo que ya no podrá ver nada aunque su cuenta de acceso siga existiendo en Supabase — si además quieres borrar la cuenta por completo, hazlo en Authentication → Users).
---
2. Cómo abrir la app localmente (antes de publicarla)
No la abras con doble clic sobre `index.html`. Muchos navegadores (Chrome en particular) bloquean el almacenamiento local (`IndexedDB`) cuando la página se abre con la dirección `file://...`, y en algunos casos hasta bloquean la ejecución de los scripts si el archivo se está viendo dentro de un `.zip` sin extraer. El síntoma típico es una página en blanco o sin estilos.
La forma correcta y más confiable es levantar un servidor local muy simple (no instala nada permanente, es solo para revisar):
Extrae el `.zip` completo en una carpeta de tu disco (clic derecho → "Extraer todo" / "Extract All"). No la abras desde dentro del `.zip`.
Abre una terminal (`cmd`, `PowerShell` o `Terminal`) dentro de esa carpeta (`informe-gerencial-ips/`) y ejecuta una de estas opciones, según lo que tengas instalado:
Con Python (viene instalado por defecto en Mac/Linux; en Windows se instala desde python.org):
```
     python -m http.server 8000
     ```
Con Node.js:
```
     npx serve .
     ```
Con Visual Studio Code: instala la extensión "Live Server" y haz clic en "Go Live" con `index.html` abierto.
Abre el navegador en `http://localhost:8000` (o el puerto/URL que te indique la terminal).
Así verás la app exactamente como se comportará una vez publicada en GitHub Pages.
Si de todas formas la abres con doble clic, la app te mostrará una advertencia visible en la parte superior y, si el navegador no permite continuar, un mensaje de error claro en pantalla en vez de quedar en blanco.
---
3. Cómo se usa
Ve a "Cargar información".
Selecciona la Clínica y la Sede correspondientes al archivo que vas a subir.
Selecciona el archivo Excel (`.xlsx`) de esa sede y haz clic en "Procesar y cargar".
La app lee el archivo, recalcula la clasificación de cada fila y reemplaza únicamente los datos de esa sede (las demás sedes no se ven afectadas).
Repite el proceso para cada una de las 5 sedes. A medida que subes archivos, el panorama global, el comparativo y el detalle se actualizan solos.
Puedes volver a subir el archivo de una sede cuando haya información nueva: los datos anteriores de esa sede se reemplazan automáticamente (no se duplican).
Los filtros superiores (clínica, sede, año, mes, rango de fechas, tipo de cliente) aplican a todas las vistas.
> Los datos se guardan en el navegador donde se cargaron. Si necesitas ver el informe desde otro computador, debes volver a cargar los archivos allí (no hay sincronización en la nube en esta versión).
---
4. Estructura del proyecto
```
informe-gerencial-ips/
├── index.html              # Shell de la aplicación (navegación + vistas)
├── css/styles.css           # Identidad visual
├── js/
│   ├── config.js            # Estructura organizacional, mapeo de columnas, catálogos, credenciales de Supabase
│   ├── classify.js           # Motor de clasificación (traducción de la fórmula de Excel)
│   ├── excelParser.js        # Lectura de archivos .xlsx con SheetJS
│   ├── db.js                 # Persistencia LOCAL con IndexedDB (modo por defecto)
│   ├── supabase.js           # Persistencia REMOTA con Supabase (modo compartido, opcional)
│   ├── auth.js                # Autenticación y roles (admin / consulta) — requiere Supabase
│   ├── storage.js            # Decide automáticamente local vs. remoto
│   ├── state.js              # Filtros globales y funciones de agregación
│   ├── charts.js              # Formato de cifras y gráficos (Chart.js)
│   ├── multiselect.js          # Dropdown con casillas para filtros de selección múltiple
│   └── app.js                 # Orquestación de vistas y eventos
├── supabase/
│   └── schema.sql             # Script para crear las tablas en Supabase (ver sección 1.2)
└── muestra_datos/
    └── ejemplo_sede_tulua.xlsx   # Extracto real de 300 filas para pruebas
```
---
5. La fórmula de clasificación
El corazón del informe es la siguiente fórmula (idéntica a la del Excel original), que se recalcula siempre al cargar un archivo — nunca se confía en la columna `Clasificacion` cacheada del Excel de origen, tal como lo pidió el negocio:
```
=SI(ESERROR(AW2);
     SI(Y(AE2=1;R2=0;M2=0);"Adm abiertas en cero";
     SI(Y(AE2=1;R2=0;M2>0);"Adm Abiertas sin facturar";
     SI(Y(AE2=2;R2=0;M2=0);"Adm cerradas en cero";
     SI(Y(AE2=2;R2=0;M2>0);"Adm cerradas con valor sin facturar";
     SI(Y(AE2<=2;R2>=0;AK2="NO APLICA");"Particular";
     SI(Y(AE2=2;R2>0;AK2=0);"Facturado sin CXC";
     SI(AE2=3;"Anuladas";"Facturado sin CXC")))))));
     SI(AW2="No radica";"No radica";
     SI(AW2="Pendiente";"Facturado con CXC";"Radicado entidad")))
```
Donde:
Columna	Campo	Significado
E	`n_admi`	Número de admisión (clave principal; puede repetirse por línea de servicio)
F	`f_admi`	Fecha de admisión (eje temporal de todo el informe)
J	`n_clie`	Cliente / entidad
M	`v_admi`	Valor admisionado
R	`n_fact`	Número de factura (si ya está facturada)
AE	`e_admi`	Estado de la admisión (1=abierta, 2=cerrada, 3=anulada)
AK	`n_cxc`	Número de cuenta de cobro
AP	`n_cost`	Centro de costo
AR	`n_ate01`	Sub-atención asociada al centro de costo
AW	Fecha radicación	Resultado de radicación: fecha, "Pendiente", "No radica" o error
AX	OBSERVACION	Aseguradora / Particular, derivado de `n_clie`
Validación
Esta traducción a JavaScript (`js/classify.js`) se validó fila por fila contra el archivo real de 117.628 registros entregado: 100% de coincidencia con la columna `Clasificacion` cacheada en el Excel de origen, y 100% de coincidencia con la columna `OBSERVACION` (Aseguradora/Particular).
Deduplicación: la misma línea exportada dos veces (antes y después de facturar)
Auditando el archivo completo se encontró que 201 líneas de servicio (de 117.628) están exportadas dos veces: una vez antes de facturarse (`n_fact=0`) y otra vez ya facturada (mismo `n_admi`, misma `f_admi`, mismo `v_admi` y mismo `n_ate01`, solo cambia el número de factura). Si se sumaran ambas copias, esas admisiones quedarían contadas dos veces — esto representaba una sobre-contabilización de ≈$135 millones sobre $87.091 millones (0,15% del total admisionado del archivo).
Por eso todo el informe se ancla a `n_admi + f_admi`: al cargar cada archivo (`js/excelParser.js`, función `colapsarLineasDuplicadas`), se agrupa por `n_admi + f_admi + v_admi + n_ate01` y se conserva únicamente la línea en su estado más avanzado (facturada, si existe esa versión) — así cada línea de servicio se cuenta una sola vez. El mensaje que aparece tras cargar un archivo indica cuántas líneas se colapsaron por este motivo.
---
5.1 Regla de valores: todo sale de `v_admi`
Los cuatro valores monetarios del informe (Admisionado, Facturado, Radicado y Pendiente) se calculan exclusivamente a partir de la columna `v_admi` (M) — nunca de `vf_tota`, `vf_grantot` ni ninguna otra columna "vf_...". La lógica es:
Valor	Cómo se calcula
Admisionado	`v_admi` de todas las filas.
Facturado	`v_admi` únicamente de las filas que tienen número de factura (`n_fact`).
Radicado	`v_admi` únicamente de las filas cuya clasificación final es "Radicado entidad" (ya se envió y se confirmó la fecha real de radicación ante la entidad).
Pendiente por radicar	Facturado − Radicado (lo que ya se facturó pero aún no se ha radicado).
Esto se implementa en `js/state.js` (funciones `valorFacturadoFila` / `valorRadicadoFila`, usadas en `calcularKPIs`, `resumenPorClienteYSede`, `distribucionAtencionPorSede`, etc.) — no hay ningún lugar del código que sume `vf_tota` ni `vf_grantot`.
---
6. Categoría de cliente (ARL, SOAT, Medicina Prepagada, Pólizas de Salud, Particulares)
El archivo no trae una columna explícita con esta categoría de negocio; la app la infiere del texto de `n_clie` mediante palabras clave (ver `APP.categorizarCliente` en `js/classify.js`):
ARL: el texto contiene "ARL".
SOAT: el texto contiene "SOAT".
MEDICINA PREPAGADA: el texto contiene "PREPAG".
POLIZAS DE SALUD: el texto contiene "PÓLIZA"/"POLIZA", "[SALUD]" o "SALUD)".
PARTICULARES: coincidencia exacta con la lista de clientes particulares del negocio (`PARTICULAR`, `PREVISER`, `DOLORMED VIP`, `ORGANIZACION PROGRESAR`, `SIGMA OCUPACIONAL S.A.S`, `VIVERO EL ROSAL`, `VIVERO EL JAZMIN`).
CONVENIOS / EMPRESAS: todo lo que no encaja en las anteriores (empresas con convenio directo, colegios, iglesias, etc. — en el archivo de prueba esto representa ~1% de las filas).
Si una entidad específica se está clasificando mal, ajusta las expresiones regulares en `APP.CATEGORIA_CLIENTE_REGLAS` / `APP.categorizarCliente` en `js/config.js` y `js/classify.js`.
---
7. Nota importante sobre "centro de costo"
En el archivo entregado, la columna `n_cost` (centro de costo, columna AP) llega vacía en todas las filas. Mientras esa columna no venga poblada desde el sistema de origen, la vista "Detalle y análisis" usa la sub-atención (`n_ate01`, columna AR) como aproximación operativa del centro de costo, ya que sí trae información completa y consistente (28 tipos de atención: Consulta Especializada, Terapia Física, Urgencias, etc.), desglosada por sede en columnas para poder comparar directamente. En cuanto el sistema de origen empiece a poblar `n_cost`, la app la tomará automáticamente sin cambios de código (columna ya mapeada en `js/config.js`).
---
8. Qué calcula cada vista
Panorama general: KPIs (admisiones, valor admisionado, valor facturado, valor radicado, % de facturación, pendiente por radicar) y tendencia mensual por sede (una línea de admisionado y otra de facturado por cada sede filtrada, con tooltip detallado al pasar el cursor), y distribución por clasificación de cartera.
Comparativo de sedes:
Un solo gráfico de tendencia mensual por sede (se quitó el gráfico por clínica porque mostraba la misma información agregada).
Análisis vertical: participación de cada sede tanto sobre el total admisionado como sobre el total facturado.
Análisis horizontal: variación % mes a mes, calculado por separado para cada sede.
Distribución por tipo de cliente.
Resumen por cliente: admisionado, facturado, radicado y pendiente por radicar de cada cliente, desglosado por sede.
Detalle y análisis: tabla de tipo de atención comparada por sede (pivote), sin omitir ningún tipo de atención sea cual sea su valor, e incluyendo columnas de variación % entre sedes (cada sede se compara contra la sede anterior de la tabla). La sección de "Detalle de admisiones" (tabla fila por fila) se retiró de esta vista.
Cargar información: carga/actualización/eliminación de datos por sede (solo administradores si hay autenticación activa).
Gestión de usuarios (solo visible para administradores, requiere Supabase conectado): asignar rol admin/consulta a cuentas ya creadas en Supabase — ver sección 1.3.
Todos los filtros de la barra superior (Clínica, Sede, Año, Mes, Tipo de cliente y Clasificación) son listas desplegables con casillas de verificación: haz clic para abrir, marca una o varias opciones, y haz clic afuera para cerrar. El filtro de Clasificación permite filtrar por cualquiera de las categorías de la fórmula de negocio (Radicado entidad, Facturado con CXC, Particular, etc.).
---
9. Requisitos del archivo Excel de cada sede
La fila 1 debe conservar los encabezados originales del sistema de facturación (`n_admi`, `f_admi`, `n_clie`, `v_admi`, `n_fact`, `vf_grantot`, `e_admi`, `n_cxc`, `n_cost`, `n_ate01`, `Fecha radicacion`, `OBSERVACION`, etc.). El orden de las columnas no importa — la app las ubica por nombre, no por posición. Si falta alguna columna no esencial, la app avisa cuáles no encontró pero sigue procesando el resto.
---
10. Licencia
MIT — ver `LICENSE`.
