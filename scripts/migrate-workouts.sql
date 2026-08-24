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

-- Do not reinterpret or change existing workouts. A unique partial index can
-- only be created when persisted data already satisfies the product rule.
-- Raising here rolls the whole transaction back without modifying a workout.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM workouts
    WHERE timer_status = 'running'
    GROUP BY user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add workouts_one_running_per_user_idx: existing users have multiple running workouts';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS workouts_one_running_per_user_idx
  ON workouts (user_id)
  WHERE timer_status = 'running';

COMMIT;