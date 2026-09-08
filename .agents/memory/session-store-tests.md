---
name: Session store in tests
description: Why the project uses MemoryStore in test mode instead of connect-pg-simple.
---

**Rule:** In `apps/api/src/index.ts`, use `new session.MemoryStore()` when `NODE_ENV === 'test'`.

**Why:** `connect-pg-simple` with `createTableIfMissing: true` creates the session table asynchronously in its constructor. The first `req.session.save()` calls during tests can race against this table creation, fail silently, and leave the session unsaved — causing all subsequent requests in the same test agent to return 401.

**How to apply:**
```ts
store: process.env.NODE_ENV === 'test'
  ? new session.MemoryStore()
  : new PgSession({ pool, createTableIfMissing: true }),
```
MemoryStore is per-process, so sessions persist for the lifetime of the test worker without any DB dependency.
