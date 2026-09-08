-- Bootstrap de las bases locales. Se ejecuta UNA vez, como superusuario:
--
--   psql -U postgres -f apps/api/scripts/create-databases.sql
--
-- Antes de correrlo, cambiar las dos contraseñas de abajo y usar esas mismas en
-- el .env de la raíz.
--
-- Los nombres NO son arbitrarios: apps/api/src/db/index.ts exige que la base de
-- tests se llame exactamente fitness_tracker_test y que el rol que se conecta
-- sea fitness_tracker_test_runner. Lo verifica dos veces —al parsear la URL y
-- preguntándole a PostgreSQL por current_database()/current_user— antes de
-- permitir cualquier DELETE. Si se cambian acá, hay que cambiarlos allá.

-- ─── Desarrollo ───────────────────────────────────────────────────────────────

CREATE DATABASE fitness_tracker;

-- ─── Tests ────────────────────────────────────────────────────────────────────
-- Rol propio, sin permisos sobre la base de desarrollo. Esta separación es la
-- que evita que un test apunte por accidente a los datos reales: aunque alguien
-- pegue mal una URL, este rol no puede tocar fitness_tracker.

CREATE ROLE fitness_tracker_test_runner LOGIN PASSWORD 'cambiar-esta-password';

-- Se le da la propiedad de la base para que drizzle-kit pueda crear las tablas.
-- Desde PostgreSQL 15 el esquema public no es escribible por defecto para
-- cualquiera; ser dueño de la base resuelve eso sin abrir permisos de más.
CREATE DATABASE fitness_tracker_test OWNER fitness_tracker_test_runner;

REVOKE ALL ON DATABASE fitness_tracker FROM fitness_tracker_test_runner;
