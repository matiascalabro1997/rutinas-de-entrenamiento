import type { Config } from 'drizzle-kit';

// drizzle-kit no carga .env por su cuenta. La ruta es relativa al cwd, que es
// apps/api porque el script npm corre en este workspace.
try {
  process.loadEnvFile('../../.env');
} catch {
  // Sin .env: se usan las variables que ya estén en el entorno.
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
