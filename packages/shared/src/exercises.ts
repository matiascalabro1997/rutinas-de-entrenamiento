import { z } from 'zod';

// ─── Requests ─────────────────────────────────────────────────────────────────

export const createExerciseSchema = z.object({
  name: z.string().min(1).max(255),
  muscleGroupId: z.number().int().positive(),
  isBodyweight: z.boolean().default(false),
});

export type CreateExercisePayload = z.infer<typeof createExerciseSchema>;

// ─── Responses ────────────────────────────────────────────────────────────────

export interface MuscleGroup {
  id: number;
  name: string;
}

export interface Exercise {
  id: number;
  name: string;
  muscleGroupId: number;
  muscleGroupName: string;
  isBodyweight: boolean;
  /** `false` = ejercicio del catálogo global; `true` = creado por el usuario. */
  isCustom: boolean;
}
