# Rutinas de entrenamiento

App web mobile-first para armar rutinas y registrar entrenamientos: catálogo de
ejercicios, editor de rutinas y una sesión activa con timer, autosave y
recuperación entre pestañas.

React + Vite en el front, Express + Drizzle + PostgreSQL en el back, organizado
como monorepo con npm workspaces.

```
apps/api/          API Express
apps/web/          Cliente React
packages/shared/   Contrato HTTP compartido (schemas zod + tipos)
```

## Puesta en marcha

Requiere **Node 20+** y **PostgreSQL 15+** instalado localmente.

**1. Dependencias**

```bash
npm install
```

**2. Crear las bases**

Una sola vez, como superusuario. Antes de correrlo, abrí el archivo y cambiá las
contraseñas de ejemplo:

```bash
psql -U postgres -f apps/api/scripts/create-databases.sql
```

Crea `fitness_tracker` para desarrollo y `fitness_tracker_test` con su propio rol
`fitness_tracker_test_runner`, sin acceso a la base de desarrollo. Esa separación
no es opcional: la app se niega a conectar los tests a cualquier otra cosa.

**3. Configurar el entorno**

Copiá `.env.example` a `.env` en la raíz y completá las contraseñas que pusiste
en el paso anterior. El `SESSION_SECRET` se genera con:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

**4. Cargar el esquema y los datos iniciales**

```bash
npm run db:push
npm run db:seed
```

**5. Levantar todo**

```bash
npm run dev
```

Cliente en http://localhost:5000, API en el 3001 (el dev server hace de proxy).

## Comandos

| Comando                 | Qué hace                                       |
| ----------------------- | ---------------------------------------------- |
| `npm run dev`           | shared en watch + API + cliente                |
| `npm run build`         | build de producción de los tres workspaces     |
| `npm start`             | server de producción, sirve también el cliente |
| `npm test`              | todos los tests                                |
| `npm run test:web`      | sólo los del cliente (no requieren base)       |
| `npm run typecheck`     | los tres workspaces                            |
| `npm run format`        | Prettier                                       |
| `npm run db:push`       | aplica el esquema a la base de desarrollo      |
| `npm run db:seed`       | carga grupos musculares y ejercicios           |
| `npm run db:setup:test` | prepara la base de tests                       |

## Notas

Los tests de la API son de integración y necesitan PostgreSQL corriendo. Corren
en serie a propósito: comparten una base y en paralelo se pisan entre archivos.

`packages/shared` se compila antes que el resto; los scripts de la raíz ya lo
hacen solos.

Para trabajar sobre el código, `CLAUDE.md` documenta las decisiones de
arquitectura y las reglas que conviene no romper.
