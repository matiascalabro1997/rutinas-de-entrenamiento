import { z } from 'zod';

export const WORKOUT_STATUSES = ['in_progress', 'completed'] as const;
export const TIMER_STATUSES = ['running', 'paused', 'completed'] as const;

export type WorkoutStatus = (typeof WORKOUT_STATUSES)[number];
export type TimerStatus = (typeof TIMER_STATUSES)[number];

// ─── Requests ─────────────────────────────────────────────────────────────────

export const startWorkoutSchema = z.object({
  routineId: z.number().int().positive(),
});

export const upsertWorkoutSetSchema = z.object({
  id: z.number().int().positive().optional(),
  // Vincula una serie creada en el cliente con su ID de base de datos, aun si
  // se agregan o eliminan otras series mientras el guardado está en vuelo.
  clientId: z.string().uuid().optional(),
  setNumber: z.number().int().min(1),
  weight: z.coerce.number().min(0).max(999.5).default(0),
  reps: z.number().int().min(0).max(999).default(10),
  rir: z.number().int().min(0).max(10).nullable().default(null),
  completed: z.boolean().default(false),
});

export const upsertWorkoutExerciseSchema = z.object({
  id: z.number().int().positive(),
  sets: z.array(upsertWorkoutSetSchema),
});

export const updateWorkoutSchema = z.object({
  version: z.number().int().positive(),
  exercises: z.array(upsertWorkoutExerciseSchema),
});

export type StartWorkoutPayload = z.infer<typeof startWorkoutSchema>;
export type UpsertWorkoutSetPayload = z.infer<typeof upsertWorkoutSetSchema>;
export type UpsertWorkoutExercisePayload = z.infer<typeof upsertWorkoutExerciseSchema>;
export type UpsertWorkoutPayload = z.infer<typeof updateWorkoutSchema>;

// ─── Responses ────────────────────────────────────────────────────────────────

export interface WorkoutSet {
  id: number;
  setNumber: number;
  /** PostgreSQL serializa NUMERIC como string (e.g. "80.00"). */
  weight: string;
  reps: number;
  rir: number | null;
  completed: boolean;
}

export interface WorkoutExerciseFull {
  id: number;
  workoutId: number;
  /** `null` si el ejercicio original del catálogo fue borrado; el snapshot sobrevive. */
  exerciseId: number | null;
  exerciseName: string;
  muscleGroupName: string;
  isBodyweight: boolean;
  position: number;
  sets: WorkoutSet[];
}

export interface WorkoutSetIdMapping {
  clientId: string;
  id: number;
}

export interface WorkoutFull {
  id: number;
  routineId: number | null;
  name: string;
  status: WorkoutStatus;
  /** Tiempo efectivo acumulado; nunca se deriva de completedAt - startedAt. */
  elapsedSeconds: number;
  activeStartedAt: string | null;
  timerStatus: TimerStatus;
  /** Timestamp del server, para que el display local no dependa del reloj del cliente. */
  serverNow: string;
  version: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  exercises: WorkoutExerciseFull[];
  setIdMappings?: WorkoutSetIdMapping[];
}

export interface WorkoutSaveResult {
  version: number;
  setIdMappings: WorkoutSetIdMapping[];
}
