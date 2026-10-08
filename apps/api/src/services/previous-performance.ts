import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { PreviousPerformance } from '@rutinas/shared';
import { db } from '../db/index';
import { workoutExercises, workoutSets, workouts } from '../db/schema';

/**
 * Qué hizo el usuario la última vez con cada uno de estos ejercicios.
 *
 * Es el dato que se muestra mientras se entrena ("la última vez: 80 kg x 10"),
 * para no tener que recordar con cuánto se venía.
 *
 * Dos reglas que definen qué cuenta como "la última vez":
 *
 * - Sólo entrenamientos terminados. Uno en curso todavía puede cambiar, y uno
 *   abandonado a mitad no es una referencia honesta.
 * - Sólo con al menos una serie marcada como realizada. Si se abrió el
 *   ejercicio y no se hizo nada, la sesión anterior a esa es la referencia
 *   verdadera.
 *
 * El cruce es por `exerciseId`, el ejercicio del catálogo. Los snapshots cuyo
 * ejercicio original fue borrado lo tienen en null y quedan fuera: sin esa
 * referencia no hay forma de saber que dos series son del mismo movimiento.
 */
export async function findPreviousPerformances(
  userId: number,
  exerciseIds: number[],
  { excludeWorkoutId }: { excludeWorkoutId?: number } = {},
): Promise<PreviousPerformance[]> {
  if (exerciseIds.length === 0) return [];

  // DISTINCT ON se queda con la primera fila de cada exerciseId según el ORDER
  // BY, que acá es el entrenamiento más reciente. Resuelve en una sola consulta
  // lo que si no serían tantas como ejercicios tenga el entrenamiento.
  const latest = await db
    .selectDistinctOn([workoutExercises.exerciseId], {
      exerciseId: workoutExercises.exerciseId,
      workoutExerciseId: workoutExercises.id,
      workoutId: workouts.id,
      completedAt: workouts.completedAt,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(workouts.status, 'completed'),
        inArray(workoutExercises.exerciseId, exerciseIds),
        excludeWorkoutId === undefined ? undefined : ne(workouts.id, excludeWorkoutId),
        sql`exists (
          select 1 from ${workoutSets}
          where ${workoutSets.workoutExerciseId} = ${workoutExercises.id}
            and ${workoutSets.completed}
        )`,
      ),
    )
    .orderBy(asc(workoutExercises.exerciseId), desc(workouts.completedAt));

  if (latest.length === 0) return [];

  const sets = await db
    .select({
      workoutExerciseId: workoutSets.workoutExerciseId,
      setNumber: workoutSets.setNumber,
      weight: workoutSets.weight,
      reps: workoutSets.reps,
      rir: workoutSets.rir,
    })
    .from(workoutSets)
    .where(
      and(
        inArray(
          workoutSets.workoutExerciseId,
          latest.map((row) => row.workoutExerciseId),
        ),
        eq(workoutSets.completed, true),
      ),
    )
    .orderBy(asc(workoutSets.workoutExerciseId), asc(workoutSets.setNumber));

  const setsByExercise = new Map<number, typeof sets>();
  for (const set of sets) {
    const list = setsByExercise.get(set.workoutExerciseId);
    if (list) list.push(set);
    else setsByExercise.set(set.workoutExerciseId, [set]);
  }

  return latest.flatMap((row) => {
    // El EXISTS de arriba ya garantiza que hay series; este guard es por si la
    // fila desaparece entre las dos consultas.
    if (row.exerciseId === null || row.completedAt === null) return [];
    const rowSets = setsByExercise.get(row.workoutExerciseId) ?? [];
    if (rowSets.length === 0) return [];

    return [
      {
        exerciseId: row.exerciseId,
        workoutId: row.workoutId,
        completedAt: row.completedAt.toISOString(),
        sets: rowSets.map((set) => ({
          setNumber: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          rir: set.rir,
        })),
      },
    ];
  });
}
