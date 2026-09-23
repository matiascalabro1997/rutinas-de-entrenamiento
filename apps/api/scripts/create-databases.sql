-- Bootstrap de las bases locales. Se ejecuta UNA vez, como superusuario:
--
--   psql -U postgres -f apps/api/scripts/create-databases.local.sql
--
-- ESTA ES LA PLANTILLA, sin secretos, y es la que se versiona. El archivo que
-- realmente se ejecuta es create-databases.local.sql, que lleva las contraseñas
-- reales y está en .gitignore. Si se perdió, se regenera copiando este y
-- poniendo las mismas contraseñas que tenga el .env de la raíz.
--
-- Los nombres NO son arbitrarios: apps/api/src/db/index.ts exige que la base de
-- tests se llame exactamente fitness_tracker_test y que el rol que se conecta
-- sea fitness_tracker_test_runner. Lo verifica dos veces —al parsear la URL y
-- preguntándole a PostgreSQL por current_database()/current_user— antes de
-- permitir cualquier DELETE. Si se cambian acá, hay que cambiarlos allá.

-- ─── Desarrollo ───────────────────────────────────────────────────────────────

CREATE ROLE fitness_tracker_app LOGIN PASSWORD 'poner-una-password';
CREATE DATABASE fitness_tracker OWNER fitness_tracker_app;

-- ─── Tests ────────────────────────────────────────────────────────────────────
-- Rol propio, sin permisos sobre la base de desarrollo. Esta separación es la
-- que evita que un test apunte por accidente a los datos reales: aunque alguien
-- pegue mal una URL, este rol no puede tocar fitness_tracker.

CREATE ROLE fitness_tracker_test_runner LOGIN PASSWORD 'poner-otra-password';

-- Se le da la propiedad de la base para que drizzle-kit pueda crear las tablas.
-- Desde PostgreSQL 15 el esquema public no es escribible por defecto para
-- cualquiera; ser dueño de la base resuelve eso sin abrir permisos de más.
CREATE DATABASE fitness_tracker_test OWNER fitness_tracker_test_runner;

-- Aislamiento real entre las dos bases.
--
-- Revocar sobre el rol puntual no alcanza: PostgreSQL le da CONNECT a PUBLIC en
-- toda base nueva, así que el rol seguiría entrando por ahí. Hay que quitarle el
-- permiso a PUBLIC y devolvérselo sólo a quien corresponde. Los dueños conservan
-- sus privilegios de forma implícita; los GRANT son explícitos a propósito.

REVOKE ALL ON DATABASE fitness_tracker FROM PUBLIC;
GRANT CONNECT ON DATABASE fitness_tracker TO fitness_tracker_app;

REVOKE ALL ON DATABASE fitness_tracker_test FROM PUBLIC;
GRANT CONNECT ON DATABASE fitness_tracker_test TO fitness_tracker_test_runner;
