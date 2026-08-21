import { pool } from '../server/db/index';

// ─── Guarda de seguridad ───────────────────────────────────────────────────────
// cleanDb() SÓLO puede ejecutarse cuando NODE_ENV === 'test'.
// Esto impide que una ejecución accidental de los tests borre datos de desarrollo
// o producción, que comparten la misma DATABASE_URL en este proyecto.
export async function cleanDb() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      '[cleanDb] Blocked: NODE_ENV is not "test" (current: ' +
        (process.env.NODE_ENV ?? 'undefined') +
        '). ' +
        'Tests must be run via "npm test" (which sets NODE_ENV=test) to prevent ' +
        'accidental deletion of development or production data.',
    );
  }

  // Limpiar tablas en orden de dependencias para evitar errores de FK.
  // En modo test se usa MemoryStore para sesiones, no es necesario borrar "session".
  await pool.query('DELETE FROM routine_sets');
  await pool.query('DELETE FROM routine_exercises');
  await pool.query('DELETE FROM routines');
  await pool.query("DELETE FROM exercises WHERE user_id IS NOT NULL");
  await pool.query('DELETE FROM user_profiles');
  await pool.query('DELETE FROM users');
}
