#!/usr/bin/env node
/**
 * Reemplazo multiplataforma de `env -u DATABASE_URL NODE_ENV=test <cmd>`.
 *
 * El `env -u` original venía de coreutils y no existe en Windows. La propiedad
 * que protege es la que importa: el proceso de tests nunca debe poder ver la
 * URL de la base de desarrollo, para que ningún fallback accidental la alcance.
 * Por eso se borra de `env` antes de lanzar el comando hijo, en vez de sólo
 * apoyarse en las validaciones de `src/db/index.ts`.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// El .env de la raíz aporta TEST_DATABASE_URL. Se carga acá, en el proceso
// padre, para que el hijo lo herede ya filtrado.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // Sin .env: se usan las variables que ya estén en el entorno.
}

const command = process.argv.slice(2);

if (command.length === 0) {
  console.error('Uso: node scripts/with-test-env.mjs <comando> [args...]');
  process.exit(1);
}

const env = { ...process.env, NODE_ENV: 'test' };
delete env.DATABASE_URL;

// En Windows los binarios de node_modules/.bin son .cmd, y desde Node 18.20 sólo
// se pueden ejecutar a través de un shell. Pasar el comando ya armado como una
// sola cadena (en vez de cadena + array de args) evita el DeprecationWarning
// DEP0190. Es seguro porque los comandos son literales de package.json, sin
// espacios ni interpolación de datos externos.
const isWindows = process.platform === 'win32';
const child = isWindows
  ? spawn(command.join(' '), { stdio: 'inherit', env, shell: true })
  : spawn(command[0], command.slice(1), { stdio: 'inherit', env });

child.on('error', (error) => {
  console.error(`[with-test-env] No se pudo ejecutar "${command[0]}":`, error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
