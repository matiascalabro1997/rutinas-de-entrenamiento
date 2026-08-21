import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  timestamp,
  numeric,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
  routines: many(routines),
  exercises: many(exercises),
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
