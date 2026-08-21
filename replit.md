# Fitness Tracker — Fase 1

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

## Fase actual: Fase 1 — Fundación + Rutinas
Implementa: autenticación, CRUD de rutinas, catálogo de ejercicios.
NO implementado aún: workouts, historial, estadísticas, offline, IA, pagos.
