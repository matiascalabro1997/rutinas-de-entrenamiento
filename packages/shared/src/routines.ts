import { z } from 'zod';

// ─── Requests ─────────────────────────────────────────────────────────────────

export const upsertRoutineSetSchema = z.object({
  id: z.number().int().positive().optional(),
  setNumber: z.number().int().min(1),
  // z.coerce.number() para aceptar tanto números como el string que devuelve
  // PostgreSQL para columnas NUMERIC (e.g. "80.00") sin necesidad de parsear
  // en el cliente antes de enviar de vuelta.
  weight: z.coerce.number().min(0).default(0),
  reps: z.number().int().min(0).default(10),
  rir: z.number().int().min(0).nullable().default(null),
});

export const upsertRoutineExerciseSchema = z.object({
  id: z.number().int().positive().optional(),
  exerciseId: z.number().int().positive(),
  position: z.number().int().min(0),
  sets: z.array(upsertRoutineSetSchema).default([]),
});

export const upsertRoutineSchema = z.object({
  name: z.string().min(1).max(255),
  exercises: z.array(upsertRoutineExerciseSchema).default([]),
});

// Se usa la forma de salida (`z.infer`), no la de entrada: el cliente no sólo
// serializa estos objetos, también los mantiene como estado de edición, donde
// los defaults ya están aplicados y ningún campo es opcional.
export type UpsertRoutineSetPayload = z.infer<typeof upsertRoutineSetSchema>;
export type UpsertRoutineExercisePayload = z.infer<typeof upsertRoutineExerciseSchema>;
export type UpsertRoutinePayload = z.infer<typeof upsertRoutineSchema>;

// ─── Responses ────────────────────────────────────────────────────────────────

export interface RoutineSet {
  id: number;
  setNumber: number;
  /** PostgreSQL serializa NUMERIC como string (e.g. "80.00"). */
  weight: string;
  reps: number;
  rir: number | null;
}

export interface RoutineExerciseFull {
  id: number;
  routineId: number;
  exerciseId: number;
  exerciseName: string;
  muscleGroupId: number;
  muscleGroupName: string;
  isBodyweight: boolean;
  position: number;
  sets: RoutineSet[];
}

export interface RoutineSummary {
  id: number;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  exerciseCount: number;
}

export interface RoutineFull {
  id: number;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  exercises: RoutineExerciseFull[];
}
