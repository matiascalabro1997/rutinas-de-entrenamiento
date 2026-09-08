import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export const TEST_DATABASE_NAME = 'fitness_tracker_test';
export const TEST_DATABASE_USER = 'fitness_tracker_test_runner';

export interface DatabaseEnvironment {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  TEST_DATABASE_URL?: string;
}

export interface TestDatabaseIdentity {
  currentDatabase: string;
  currentUser: string;
}

/**
 * Resuelve la única URL permitida para el entorno actual.
 *
 * En tests no existe fallback hacia DATABASE_URL: la ausencia de
 * TEST_DATABASE_URL detiene el proceso antes de crear un pool de PostgreSQL.
 */
export function resolveDatabaseConnectionString(
  environment: DatabaseEnvironment = process.env,
): string {
  if (environment.NODE_ENV === 'test') {
    const testDatabaseUrl = environment.TEST_DATABASE_URL;

    if (!testDatabaseUrl) {
      throw new Error(
        '[database] TEST_DATABASE_URL is required when NODE_ENV="test". ' +
          'Refusing to create a database connection.',
      );
    }

    if (environment.DATABASE_URL && testDatabaseUrl === environment.DATABASE_URL) {
      throw new Error(
        '[database] TEST_DATABASE_URL must not be the same as DATABASE_URL. ' +
          'Refusing to connect tests to a development or production database.',
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(testDatabaseUrl);
    } catch {
      throw new Error('[database] TEST_DATABASE_URL is not a valid PostgreSQL URL.');
    }

    const databaseName = parsedUrl.pathname.replace(/^\//, '');
    const databaseUser = decodeURIComponent(parsedUrl.username);

    if (databaseName !== TEST_DATABASE_NAME || databaseUser !== TEST_DATABASE_USER) {
      throw new Error(
        `[database] TEST_DATABASE_URL must target ${TEST_DATABASE_NAME} as ` +
          `${TEST_DATABASE_USER}. Refusing to create a database connection.`,
      );
    }

    return testDatabaseUrl;
  }

  if (!environment.DATABASE_URL) {
    throw new Error('[database] DATABASE_URL is required outside the test environment.');
  }

  return environment.DATABASE_URL;
}

/**
 * Valida el resultado de la comprobación SQL de identidad para que también
 * pueda probarse sin abrir una conexión real.
 */
export function assertTestDatabaseIdentity(identity: TestDatabaseIdentity): void {
  if (
    identity.currentDatabase !== TEST_DATABASE_NAME ||
    identity.currentUser !== TEST_DATABASE_USER
  ) {
    throw new Error(
      `[database] Test database identity check failed. Expected ` +
        `${TEST_DATABASE_NAME}:${TEST_DATABASE_USER}, received ` +
        `${identity.currentDatabase}:${identity.currentUser}.`,
    );
  }
}

const connectionString = resolveDatabaseConnectionString();

export const pool = new Pool({
  connectionString,
});

export const db = drizzle(pool, { schema });

/**
 * Confirma con PostgreSQL que el pool de tests llegó a la base y al rol
 * aislados. Debe ejecutarse antes de cualquier consulta de limpieza.
 */
export async function verifyTestDatabaseIdentity(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      '[database] Test database identity verification is only available when NODE_ENV="test".',
    );
  }

  const result = await pool.query<{
    current_database: string;
    current_user: string;
  }>('SELECT current_database(), current_user');

  const row = result.rows[0];
  if (!row) {
    throw new Error('[database] Test database identity check returned no result.');
  }

  assertTestDatabaseIdentity({
    currentDatabase: row.current_database,
    currentUser: row.current_user,
  });
}

export type DB = typeof db;
