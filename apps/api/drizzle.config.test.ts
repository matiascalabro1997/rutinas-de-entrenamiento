import type { Config } from 'drizzle-kit';

// drizzle-kit no carga .env por su cuenta. La ruta es relativa al cwd, que es
// apps/api porque el script npm corre en este workspace.
try {
  process.loadEnvFile('../../.env');
} catch {
  // Sin .env: se usan las variables que ya estén en el entorno.
}

const TEST_DATABASE_NAME = 'fitness_tracker_test';
const TEST_DATABASE_USER = 'fitness_tracker_test_runner';
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    '[drizzle:test] TEST_DATABASE_URL is required. Refusing to prepare a test database.',
  );
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(testDatabaseUrl);
} catch {
  throw new Error('[drizzle:test] TEST_DATABASE_URL is not a valid PostgreSQL URL.');
}

if (
  parsedUrl.pathname.replace(/^\//, '') !== TEST_DATABASE_NAME ||
  decodeURIComponent(parsedUrl.username) !== TEST_DATABASE_USER
) {
  throw new Error(
    `[drizzle:test] TEST_DATABASE_URL must target ${TEST_DATABASE_NAME} as ` +
      `${TEST_DATABASE_USER}.`,
  );
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: testDatabaseUrl,
  },
} satisfies Config;
