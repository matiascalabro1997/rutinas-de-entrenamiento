import { and, desc, eq, sql } from 'drizzle-orm';
import type { WorkoutHistoryPage, WorkoutSummary } from '@rutinas/shared';
import { db } from '../db/index';
import { workoutExercises, workoutSets, workouts } from '../db/schema';

export const HISTORY_PAGE_SIZE = 20;
export const HISTORY_MAX_PAGE_SIZE = 100;

export interface HistoryPageOptions {
  limit?: number;
  offset?: number;
}

/**
 * Historial de entrenamientos terminados de un usuario, del más reciente al más
 * viejo.
 *
 * `userId` entra por parámetro en vez de leerse de la sesión: es la ruta la que
 * decide de quién es el historial que se pide. Hoy siempre es el propio, pero
 * cuando un profe pueda ver el progreso de sus alumnos, el cambio es el control
 * de permisos en la ruta y no esta consulta.
 *
 * Los totales se calculan con agregados en una sola consulta. Cargar cada
 * entrenamiento completo para después contarle las series sería una consulta
 * por fila, y el historial crece sin techo.
 */
export async function listCompletedWorkouts(
  userId: number,
  { limit = HISTORY_PAGE_SIZE, offset = 0 }: HistoryPageOptions = {},
): Promise<WorkoutHistoryPage> {
  // Se pide una fila de más para saber si hay página siguiente sin pagar un
  // count() sobre toda la tabla.
  const rows = await db
    .select({
      id: workouts.id,
      name: workouts.name,
      completedAt: workouts.completedAt,
      startedAt: workouts.startedAt,
      elapsedSeconds: workouts.elapsedSeconds,
      exerciseCount: sql<number>`count(distinct ${workoutExercises.id})::int`,
      completedSets: sql<number>`count(${workoutSets.id}) filter (where ${workoutSets.completed})::int`,
      totalSets: sql<number>`count(${workoutSets.id})::int`,
      // Volumen = peso x reps de lo efectivamente realizado. Es la medida más
      // usada para comparar sesiones del mismo entrenamiento entre sí.
      totalVolume: sql<number>`coalesce(sum(${workoutSets.weight} * ${workoutSets.reps}) filter (where ${workoutSets.completed}), 0)::float8`,
    })
    .from(workouts)
    // LEFT JOIN a propósito: un entrenamiento terminado sin ejercicios, o con
    // ejercicios sin series, tiene que seguir apareciendo en el historial.
    .leftJoin(workoutExercises, eq(workoutExercises.workoutId, workouts.id))
    .leftJoin(workoutSets, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .where(and(eq(workouts.userId, userId), eq(workouts.status, 'completed')))
    .groupBy(workouts.id)
    .orderBy(desc(workouts.completedAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items: WorkoutSummary[] = page.map((row) => ({
    id: row.id,
    name: row.name,
    // status='completed' siempre setea completedAt a la vez, así que esto no
    // debería pasar. Si una fila vieja quedó sin él, se muestra la fecha de
    // inicio en lugar de una fecha inventada.
    completedAt: (row.completedAt ?? row.startedAt).toISOString(),
    elapsedSeconds: row.elapsedSeconds,
    exerciseCount: row.exerciseCount,
    completedSets: row.completedSets,
    totalSets: row.totalSets,
    totalVolume: row.totalVolume,
  }));

  return { items, hasMore };
}
