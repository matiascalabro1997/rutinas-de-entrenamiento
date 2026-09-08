---
name: Vitest DB test isolation
description: Vitest runs test files in parallel by default; with a shared PostgreSQL DB this causes cleanDb() from one file to delete users just created by another file.
---

**Rule:** Always set `fileParallelism: false` in `apps/api/vitest.config.ts` when multiple test files share a PostgreSQL database.

**Why:** Vitest's default is to run test files concurrently in separate worker threads. Each worker connects to the same DB. `beforeEach` → `cleanDb()` in file A can delete rows that file B's `beforeEach` just inserted, causing FK violations like "user_id=X not present in users".

**How to apply:** Add to `apps/api/vitest.config.ts`:
```ts
test: {
  fileParallelism: false,
  sequence: { concurrent: false },
}
```
`sequence.concurrent` controls intra-file concurrency; `fileParallelism` controls inter-file.
Also: Zod's `safeParse` error object exposes `.issues` (array), not `.errors`. Use `parsed.error.issues[0]?.message` not `parsed.error.errors[0].message`.
