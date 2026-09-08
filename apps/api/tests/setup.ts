import { beforeAll } from 'vitest';
import { pool, verifyTestDatabaseIdentity } from '../src/db/index';

type CleanupDependencies = {
  nodeEnv?: string;
  verifyIdentity?: () => Promise<void>;
  query?: (sql: string) => Promise<unknown>;
};

// Se ejecuta antes de los hooks de cada archivo de test. La app puede importarse
// sin abrir conexiones, pero ningún test llega a ejecutar consultas antes de que
// PostgreSQL confirme que el pool usa la base y el rol aislados.
beforeAll(async () => {
  await verifyTestDatabaseIdentity();
});

// ─── Guarda de seguridad ───────────────────────────────────────────────────────
// cleanDb() solo alcanza los DELETE después de comprobar NODE_ENV y la identidad
// real de la conexión. Las dependencias opcionales permiten probar el bloqueo sin
// emitir consultas destructivas.
export async function cleanDb({
  nodeEnv = process.env.NODE_ENV,
  verifyIdentity = verifyTestDatabaseIdentity,
  query = (sql) => pool.query(sql),
}: CleanupDependencies = {}) {
  if (nodeEnv !== 'test') {
    throw new Error(
      '[cleanDb] Blocked: NODE_ENV is not "test" (current: ' +
        (nodeEnv ?? 'undefined') +
        '). ' +
        'Refusing to run cleanup outside the isolated test environment.',
    );
  }

  // Nunca mover esta validación detrás de un DELETE.
  await verifyIdentity();

  // Limpiar tablas en orden de dependencias para evitar errores de FK.
  // En modo test se usa MemoryStore para sesiones, no es necesario borrar "session".
  await query('DELETE FROM workout_sets');
  await query('DELETE FROM workout_exercises');
  await query('DELETE FROM workouts');
  await query('DELETE FROM routine_sets');
  await query('DELETE FROM routine_exercises');
  await query('DELETE FROM routines');
  await query('DELETE FROM exercises WHERE user_id IS NOT NULL');
  await query('DELETE FROM user_profiles');
  await query('DELETE FROM users');
}
