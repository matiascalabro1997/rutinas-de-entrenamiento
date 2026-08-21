---
name: Test DB isolation — guard against wiping dev data
description: Tests and dev share the same DATABASE_URL; cleanDb() must be guarded or it will delete real user data.
---

**Rule:** Always set `NODE_ENV=test` in the npm test script, and guard `cleanDb()` so it throws if `NODE_ENV !== 'test'`.

**Why:** Replit projects have a single PostgreSQL database. `tests/setup.ts` imports `pool` from `server/db/index.ts`, which reads `DATABASE_URL`. There is no separate test database. `cleanDb()` issues unconditional `DELETE FROM users` (and cascades), so any `npm test` run without `NODE_ENV=test` will irreversibly delete all development/production user data. Autovacuum runs within minutes and makes recovery impossible.

**How to apply:**
- `package.json` test script: `"test": "NODE_ENV=test vitest run --config vitest.config.ts"`
- `tests/setup.ts` `cleanDb()`: first line must be:
  ```ts
  if (process.env.NODE_ENV !== 'test') throw new Error('[cleanDb] Blocked: NODE_ENV is not "test"');
  ```
- Never run `cleanDb()` or the test suite without the `NODE_ENV=test` guard in place.
- If a separate test database is added in future, update `DATABASE_URL` lookup to check `TEST_DATABASE_URL` when `NODE_ENV=test`.
