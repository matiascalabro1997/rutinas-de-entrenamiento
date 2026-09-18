---
name: Workout state synchronization
description: Cache and browser-tab synchronization rules for workout timer transitions.
---

Every successful workout start, pause/resume, or completion must invalidate the full workout query namespace locally and notify other open tabs to do the same. Focus/visibility refetch remains a recovery path, not the sole cross-tab synchronization mechanism.

**Why:** Starting or resuming one workout can pause a different in-progress workout on the server. Query caches are isolated per browser tab, so focus-only refresh can leave concurrently visible tabs presenting contradictory timer states.

**How to apply:** Route new workout state transitions through the shared synchronization helper. When refreshed workout data has a newer version, retain pending local exercise edits while advancing the version used by autosave; replacing local edits on refresh risks discarding a user's next save.
