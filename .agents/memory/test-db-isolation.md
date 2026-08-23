---
name: Test DB isolation — guard against wiping dev data
description: Tests and dev share the same DATABASE_URL; cleanDb() must be guarded or it will delete real user data.
---

**Rule:** Tests must use the dedicated `fitness_tracker_test` database and `fitness_tracker_test_runner` role through `TEST_DATABASE_URL`; they must never receive a fallback connection to development.

**Why:** The former shared connection made `cleanDb()` delete real users and routines. A `NODE_ENV` check alone is insufficient because the test command deliberately sets that value. PostgreSQL access is therefore isolated both by a distinct database role and by runtime verification of the connected database and role before cleanup.

**How to apply:**
- Test processes must omit `DATABASE_URL` and require `TEST_DATABASE_URL`.
- Fail before opening a pool if the test URL is missing, names the wrong database/user, or matches a supplied development URL.
- Before test hooks and before every cleanup, query PostgreSQL and require the exact test database and role identity.
- Keep test schema preparation manual and explicit; never run setup, seeds, or migrations as part of development startup or ordinary test execution.
