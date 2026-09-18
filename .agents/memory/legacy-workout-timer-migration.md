---
name: Legacy workout timer migration
description: Safe semantic handling for workouts created before effective-time tracking existed.
---

Pre-timer workouts that are still in progress must receive `elapsed_seconds = 0`, a paused timer, and no active-period timestamp during the timer migration. Do not derive effective duration from their original start timestamp.

**Why:** The earlier model recorded no pause/resume intervals. Treating calendar time since creation as active exercise time would fabricate potentially very large durations and undermine future statistics.

**How to apply:** Keep the schema change additive. Future workouts begin running normally; legacy workouts remain resumable only after the user explicitly continues them.
