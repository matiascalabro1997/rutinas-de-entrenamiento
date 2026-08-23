import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  timestamp,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userProfiles = pgTable('user_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  displayName: varchar('display_name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Exercises ────────────────────────────────────────────────────────────────

export const muscleGroups = pgTable('muscle_groups', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const exercises = pgTable(
  'exercises',
  {
    id: serial('id').primaryKey(),
    // null = ejercicio global del catálogo; número = ejercicio personalizado del usuario
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    muscleGroupId: integer('muscle_group_id')
      .references(() => muscleGroups.id)
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    isBodyweight: boolean('is_bodyweight').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    muscleGroupIdx: index('exercises_muscle_group_idx').on(t.muscleGroupId),
    userIdx: index('exercises_user_idx').on(t.userId),
  }),
);

// ─── Routines ─────────────────────────────────────────────────────────────────

export const routines = pgTable(
  'routines',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('routines_user_idx').on(t.userId),
  }),
);

export const routineExercises = pgTable(
  'routine_exercises',
  {
    id: serial('id').primaryKey(),
    routineId: integer('routine_id')
      .references(() => routines.id, { onDelete: 'cascade' })
      .notNull(),
    exerciseId: integer('exercise_id')
      .references(() => exercises.id)
      .notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    routineIdx: index('routine_exercises_routine_idx').on(t.routineId),
  }),
);

export const routineSets = pgTable(
  'routine_sets',
  {
    id: serial('id').primaryKey(),
    routineExerciseId: integer('routine_exercise_id')
      .references(() => routineExercises.id, { onDelete: 'cascade' })
      .notNull(),
    setNumber: integer('set_number').notNull(),
    weight: numeric('weight', { precision: 7, scale: 2 }).notNull().default('0'),
    reps: integer('reps').notNull().default(10),
    rir: integer('rir'), // nullable — RIR objetivo
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    exerciseIdx: index('routine_sets_exercise_idx').on(t.routineExerciseId),
  }),
);

// ─── Workouts ─────────────────────────────────────────────────────────────────
// Los entrenamientos son snapshots independientes de las rutinas. Sólo se
// conserva routineId como referencia opcional; sus ejercicios y series nunca
// dependen de que la rutina original siga existiendo.

export const workouts = pgTable(
  'workouts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    routineId: integer('routine_id').references(() => routines.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('in_progress'),
    version: integer('version').notNull().default(1),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    userStatusIdx: index('workouts_user_status_idx').on(t.userId, t.status),
    oneActiveWorkoutPerUser: uniqueIndex('workouts_one_active_per_user_idx')
      .on(t.userId)
      .where(sql`${t.status} = 'in_progress'`),
  }),
);

export const workoutExercises = pgTable(
  'workout_exercises',
  {
    id: serial('id').primaryKey(),
    workoutId: integer('workout_id')
      .references(() => workouts.id, { onDelete: 'cascade' })
      .notNull(),
    // Identificador informativo: el nombre y atributos son el snapshot real.
    exerciseId: integer('exercise_id').references(() => exercises.id, { onDelete: 'set null' }),
    exerciseName: varchar('exercise_name', { length: 255 }).notNull(),
    muscleGroupName: varchar('muscle_group_name', { length: 100 }).notNull(),
    isBodyweight: boolean('is_bodyweight').default(false).notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    workoutIdx: index('workout_exercises_workout_idx').on(t.workoutId),
  }),
);

export const workoutSets = pgTable(
  'workout_sets',
  {
    id: serial('id').primaryKey(),
    workoutExerciseId: integer('workout_exercise_id')
      .references(() => workoutExercises.id, { onDelete: 'cascade' })
      .notNull(),
    setNumber: integer('set_number').notNull(),
    weight: numeric('weight', { precision: 7, scale: 2 }).notNull().default('0'),
    reps: integer('reps').notNull().default(10),
    rir: integer('rir'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    exerciseIdx: index('workout_sets_exercise_idx').on(t.workoutExerciseId),
    exerciseSetNumberIdx: uniqueIndex('workout_sets_exercise_number_idx').on(
      t.workoutExerciseId,
      t.setNumber,
    ),
  }),
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
  routines: many(routines),
  exercises: many(exercises),
  workouts: many(workouts),
}));

export const muscleGroupsRelations = relations(muscleGroups, ({ many }) => ({
  exercises: many(exercises),
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  muscleGroup: one(muscleGroups, { fields: [exercises.muscleGroupId], references: [muscleGroups.id] }),
  user: one(users, { fields: [exercises.userId], references: [users.id] }),
  routineExercises: many(routineExercises),
}));

export const routinesRelations = relations(routines, ({ one, many }) => ({
  user: one(users, { fields: [routines.userId], references: [users.id] }),
  exercises: many(routineExercises),
}));

export const routineExercisesRelations = relations(routineExercises, ({ one, many }) => ({
  routine: one(routines, { fields: [routineExercises.routineId], references: [routines.id] }),
  exercise: one(exercises, { fields: [routineExercises.exerciseId], references: [exercises.id] }),
  sets: many(routineSets),
}));

export const routineSetsRelations = relations(routineSets, ({ one }) => ({
  routineExercise: one(routineExercises, {
    fields: [routineSets.routineExerciseId],
    references: [routineExercises.id],
  }),
}));

export const workoutsRelations = relations(workouts, ({ one, many }) => ({
  user: one(users, { fields: [workouts.userId], references: [users.id] }),
  routine: one(routines, { fields: [workouts.routineId], references: [routines.id] }),
  exercises: many(workoutExercises),
}));

export const workoutExercisesRelations = relations(workoutExercises, ({ one, many }) => ({
  workout: one(workouts, { fields: [workoutExercises.workoutId], references: [workouts.id] }),
  exercise: one(exercises, { fields: [workoutExercises.exerciseId], references: [exercises.id] }),
  sets: many(workoutSets),
}));

export const workoutSetsRelations = relations(workoutSets, ({ one }) => ({
  workoutExercise: one(workoutExercises, {
    fields: [workoutSets.workoutExerciseId],
    references: [workoutExercises.id],
  }),
}));
