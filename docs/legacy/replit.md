# Fitness Tracker — Fase 2

Aplicación web mobile-first para gestión de rutinas de entrenamiento.

## Stack técnico
- **Backend**: Node.js + Express + TypeScript
- **ORM**: Drizzle ORM con PostgreSQL (base de datos integrada de Replit)
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Auth**: express-session + connect-pg-simple + bcryptjs
- **Tests**: Vitest + Supertest

## Comandos
- `npm run dev` — servidor Express (puerto 3001) + Vite dev server (puerto 5000)
- `npm run test` — ejecutar tests
- `npm run db:seed` — cargar datos iniciales

## Arquitectura
- `server/` — API Express
- `client/` — React frontend (Vite)
- `tests/` — Tests de integración
- Puerto 5000: frontend (webview de Replit)
- Puerto 3001: API backend (proxied por Vite)

## Fase actual: Fase 2 — Entrenamiento activo
Implementa: autenticación, CRUD de rutinas, catálogo de ejercicios y un único
entrenamiento activo por usuario, guardado como snapshot independiente de la
rutina original.

NO implementado aún: historial de entrenamientos, estadísticas, offline, IA, pagos.
