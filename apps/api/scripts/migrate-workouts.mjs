#!/usr/bin/env node
/**
 * Aplica `scripts/migrate-workouts.sql` sobre DATABASE_URL.
 *
 * Reemplaza al `psql "$DATABASE_URL" -f ...` original, que exigía tener el
 * cliente de PostgreSQL instalado. El archivo abre y cierra su propia
 * transacción, así que se envía tal cual en una sola consulta: con el protocolo
 * simple de PostgreSQL, un error en cualquier sentencia aborta el lote entero,
 * que es lo mismo que garantizaba `-v ON_ERROR_STOP=1`.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // Sin .env: se usan las variables que ya estén en el entorno.
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(scriptDir, 'migrate-workouts.sql');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[migrate:workouts] DATABASE_URL es obligatorio.');
  process.exit(1);
}

const sql = await readFile(sqlPath, 'utf8');
const client = new pg.Client({ connectionString });

await client.connect();
try {
  await client.query(sql);
  console.log('[migrate:workouts] Migración aplicada.');
} catch (error) {
  console.error('[migrate:workouts] Falló:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
