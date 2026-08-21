import { pool } from '../server/db/index';

// Limpiar tablas de test antes de cada suite (queries separadas para aislar errores).
// En modo test se usa MemoryStore para sesiones, así que no es necesario borrar "session".
export async function cleanDb() {
  await pool.query('DELETE FROM routine_sets');
  await pool.query('DELETE FROM routine_exercises');
  await pool.query('DELETE FROM routines');
  await pool.query("DELETE FROM exercises WHERE user_id IS NOT NULL");
  await pool.query('DELETE FROM user_profiles');
  await pool.query('DELETE FROM users');
}
