BEGIN;

-- Effective workout time is additive and independent from calendar duration.
-- New columns deliberately use paused as the default for existing rows. The
-- previous application had no reliable record of active/paused intervals, so
-- its calendar timestamps must never be converted into effective time.
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS elapsed_seconds integer NOT NULL DEFAULT 0;
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS active_started_at timestamp;
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS timer_status varchar(20) NOT NULL DEFAULT 'paused';

-- Keep the application default for workouts created after this migration.
-- Existing rows already received the safe paused value when the column was
-- added; changing the column default does not modify those rows.
ALTER TABLE workouts
  ALTER COLUMN timer_status SET DEFAULT 'running';

COMMIT;