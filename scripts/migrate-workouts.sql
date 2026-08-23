BEGIN;

CREATE TABLE IF NOT EXISTS workouts (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id integer REFERENCES routines(id) ON DELETE SET NULL,
  name varchar(255) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'in_progress',
  version integer NOT NULL DEFAULT 1,
  started_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id serial PRIMARY KEY,
  workout_id integer NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id integer REFERENCES exercises(id) ON DELETE SET NULL,
  exercise_name varchar(255) NOT NULL,
  muscle_group_name varchar(100) NOT NULL,
  is_bodyweight boolean NOT NULL DEFAULT false,
  position integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id serial PRIMARY KEY,
  workout_exercise_id integer NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_number integer NOT NULL,
  weight numeric(7, 2) NOT NULL DEFAULT '0',
  reps integer NOT NULL DEFAULT 10,
  rir integer,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE workout_sets
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS workouts_user_status_idx ON workouts (user_id, status);
CREATE INDEX IF NOT EXISTS workout_exercises_workout_idx ON workout_exercises (workout_id);
CREATE INDEX IF NOT EXISTS workout_sets_exercise_idx ON workout_sets (workout_exercise_id);
CREATE UNIQUE INDEX IF NOT EXISTS workout_sets_exercise_number_idx
  ON workout_sets (workout_exercise_id, set_number);

-- The initial Phase 2A draft stored the same state as "active". Rebuild only
-- this index while converting rows so existing in-progress workouts remain
-- recoverable under the final status contract.
DROP INDEX IF EXISTS workouts_one_active_per_user_idx;
DROP INDEX IF EXISTS workouts_one_in_progress_per_routine_idx;
UPDATE workouts SET status = 'in_progress' WHERE status = 'active';
ALTER TABLE workouts ALTER COLUMN status SET DEFAULT 'in_progress';
CREATE UNIQUE INDEX IF NOT EXISTS workouts_one_in_progress_per_routine_idx
  ON workouts (user_id, routine_id) WHERE status = 'in_progress';

COMMIT;