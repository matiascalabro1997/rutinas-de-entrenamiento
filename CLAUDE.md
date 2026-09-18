# Rutinas de entrenamiento

Aplicación web mobile-first para gestión de rutinas de entrenamiento. Migrada
desde Replit a un monorepo con npm workspaces.

## Estructura

```
apps/api/        Express 5 + Drizzle + PostgreSQL. Sesiones con express-session.
apps/web/        React 19 + Vite + Tailwind v4. SPA con react-router.
packages/shared/ Contrato HTTP: schemas zod + tipos de respuesta.
docs/legacy/     Configuración y prompts de la etapa Replit. Sólo referencia.
```

`packages/shared` es la única fuente de verdad del contrato: la API valida cada
payload con sus schemas zod y el cliente deriva sus tipos de los mismos. Antes
estaban duplicados a mano en `client/src/lib/api.ts` y ya habían divergido.

**Se compila antes que todo lo demás.** Emite CommonJS a `dist/`; los scripts de
`dev`, `build`, `test` y `typecheck` de la raíz ya lo construyen primero.

## Comandos

Todos desde la raíz:

| Comando                                   | Qué hace                                                         |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                             | shared en watch + API (`:3001`) + Vite (`:5000`, proxy a la API) |
| `npm run build`                           | shared → api (`tsc`) → web (`vite build`)                        |
| `npm start`                               | server de producción, sirve también el SPA                       |
| `npm test`                                | tests de integración de la API                                   |
| `npm run typecheck`                       | los tres workspaces                                              |
| `npm run format` / `npm run format:check` | Prettier                                                         |
| `npm run db:push`                         | aplica el schema a `DATABASE_URL`                                |
| `npm run db:seed`                         | carga grupos musculares y catálogo de ejercicios                 |
| `npm run db:setup:test`                   | prepara la base de tests (explícito, nunca automático)           |

No hay ESLint. `typescript-eslint` rechaza en runtime cualquier TypeScript 7
(«does not support TS 7.0»), y el proyecto usa 7.0.2; forzar la instalación no
sirve. Revisar cuando publiquen soporte. Prettier sí está y cubre el formato.

Las variables salen de un `.env` en la raíz (ver `.env.example`), cargado con el
soporte nativo de Node. No hay dependencia de `dotenv`.

## Reglas que no hay que romper

Cada una viene de un incidente real. Están documentadas en `.agents/memory/`.

**Aislamiento de la base de tests.** Los tests corren contra la base
`fitness_tracker_test` con el rol `fitness_tracker_test_runner`, nunca contra
desarrollo. `apps/api/src/db/index.ts` valida la URL antes de abrir el pool y
`cleanDb()` vuelve a preguntarle a PostgreSQL por su identidad real antes de
cualquier `DELETE`. El proceso de tests además no recibe `DATABASE_URL` en
absoluto (`apps/api/scripts/with-test-env.mjs`). Un chequeo de `NODE_ENV` solo no
alcanza: el propio comando de test lo setea. Esto ya borró datos reales dos veces.

**`fileParallelism: false` en vitest.** Los archivos de test comparten la misma
base; en paralelo, el `cleanDb()` de uno borra los usuarios que otro acaba de
crear.

**`MemoryStore` para sesiones en test.** `connect-pg-simple` crea su tabla de
forma asíncrona en el constructor; los primeros `session.save()` de un test
pierden la carrera, fallan en silencio y todo lo que sigue devuelve 401.

**Tiempo efectivo, no tiempo de calendario.** `elapsedSeconds` es aditivo y se
persiste; nunca se deriva de `completedAt - startedAt`. Los workouts anteriores a
la existencia del timer arrancan pausados en cero: el modelo viejo no registraba
intervalos de pausa y convertir su tiempo de calendario inventaría duraciones
enormes.

**Los workouts son snapshots.** `workout_exercises` guarda nombre y atributos
copiados. Un workout tiene que sobrevivir a que se borre o edite la rutina que lo
originó; `routineId` y `exerciseId` son referencias informativas y admiten `null`.

**Sincronización entre pestañas.** Todo cambio de estado de un workout invalida
el namespace completo de queries y avisa a las demás pestañas. Arrancar o
reanudar un workout puede pausar otro en el server, y los caches de react-query
son por pestaña. Al refrescar, conservar las ediciones locales pendientes y sólo
avanzar la `version` que usa el autosave.

**Zod:** `parsed.error.issues`, no `.errors`.

## Estado

Implementado: auth, CRUD de rutinas, catálogo de ejercicios, un entrenamiento
activo por usuario con timer, autosave y recuperación.

No implementado: historial de entrenamientos, estadísticas, offline, IA, pagos.
