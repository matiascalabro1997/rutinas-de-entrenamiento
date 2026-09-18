---
name: Drizzle configuration format
description: The installed Drizzle Kit expects the modern PostgreSQL configuration shape for both isolated tests and development schema pushes.
---

**Rule:** Keep every Drizzle PostgreSQL configuration on the `dialect: "postgresql"` and `dbCredentials.url` format.

**Why:** The resolved Drizzle Kit version expects the modern configuration schema even though the dependency range in the manifest originates from an older configuration style. The legacy `driver: "pg"` and `connectionString` fields fail before any schema operation begins.

**How to apply:** Use the explicit test setup command only after its separate configuration validates `TEST_DATABASE_URL`; do not reuse the development configuration or execute test setup as part of ordinary tests.
