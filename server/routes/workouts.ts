import { Router } from 'express';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index';
import {
  exercises,
  muscleGroups,
  routineExercises,
  routineSets,
  routines,
  workoutExercises,
  workoutSets,
  workouts,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

const setSchema = z.object({
  id: z.number().int().positive().optional(),
  // Vincula una serie creada en el cliente con su ID de base de datos, aun si
  // se agregan o eliminan otras series mientras el guardado está en vuelo.
  clientId: z.string().uuid().optional(),
  setNumber: z.number().int().min(1),
  weight: z.coerce.number().min(0).max(999.5).default(0),
  reps: z.number().int().min(0).max(999).default(10),
  rir: z.number().int().min(0).max(10).nullable().default(null),
});

const updateWorkoutSchema = z.object({
  version: z.number().int().positive(),
  exercises: z.array(
    z.object({
      id: z.number().int().positive(),
      sets: z.array(setSchema),
    }),
  ),
});

class ActiveWorkoutExistsError extends Error {}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505',
  );
}

async function getWorkoutForUser(workoutId: number, userId: number) {
  const [workout] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .limit(1);
  return workout ?? null;
}

async function loadWorkoutWithDetails(workoutId: number) {
  const [workout] = await db.select().from(workouts).where(eq(workouts.id, workoutId)).limit(1);
  if (!workout) return null;

  const exerciseList = await db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position));

  const exercisesWithSets = await Promise.all(
    exerciseList.map(async (exercise) => {
      const sets = await db
        .select()
        .from(workoutSets)
        .where(eq(workoutSets.workoutExerciseId, exercise.id))
        .orderBy(asc(workoutSets.setNumber));
      return { ...exercise, sets };
    }),
  );

  return { ...workout, exercises: exercisesWithSets };
}

// POST /api/workouts — inicia una sesión desde una rutina activa propia.
router.post('/', async (req, res) => {
  const parsed = z.object({ routineId: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
  }

  try {
    const userId = req.session.userId!;
    const workoutId = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: workouts.id })
        .from(workouts)
        .where(
          and(
            eq(workouts.userId, userId),
            eq(workouts.routineId, parsed.data.routineId),
            eq(workouts.status, 'in_progress'),
          ),
        )
        .limit(1);
      if (existing) throw new ActiveWorkoutExistsError();

      const [routine] = await tx
        .select()
        .from(routines)
        .where(
          and(
            eq(routines.id, parsed.data.routineId),
            eq(routines.userId, userId),
            isNull(routines.archivedAt),
          ),
        )
        .limit(1);
      if (!routine) return null;

      const [workout] = await tx
        .insert(workouts)
        .values({ userId, routineId: routine.id, name: routine.name })
        .returning({ id: workouts.id });

      const sourceExercises = await tx
        .select({
          id: routineExercises.id,
          exerciseId: exercises.id,
          exerciseName: exercises.name,
          muscleGroupName: muscleGroups.name,
          isBodyweight: exercises.isBodyweight,
          position: routineExercises.position,
        })
        .from(routineExercises)
        .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
        .innerJoin(muscleGroups, eq(exercises.muscleGroupId, muscleGroups.id))
        .where(eq(routineExercises.routineId, routine.id))
        .orderBy(asc(routineExercises.position));

      for (const sourceExercise of sourceExercises) {
        const [workoutExercise] = await tx
          .insert(workoutExercises)
          .values({
            workoutId: workout.id,
            exerciseId: sourceExercise.exerciseId,
            exerciseName: sourceExercise.exerciseName,
            muscleGroupName: sourceExercise.muscleGroupName,
            isBodyweight: sourceExercise.isBodyweight,
            position: sourceExercise.position,
          })
          .returning({ id: workoutExercises.id });

        const sourceSets = await tx
          .select()
          .from(routineSets)
          .where(eq(routineSets.routineExerciseId, sourceExercise.id))
          .orderBy(asc(routineSets.setNumber));

        if (sourceSets.length > 0) {
          await tx.insert(workoutSets).values(
            sourceSets.map((set) => ({
              workoutExerciseId: workoutExercise.id,
              setNumber: set.setNumber,
              weight: set.weight,
              reps: set.reps,
              rir: set.rir,
            })),
          );
        }
      }

      return workout.id;
    });

    if (!workoutId) return res.status(404).json({ error: 'Rutina activa no encontrada' });
    const workout = await loadWorkoutWithDetails(workoutId);
    return res.status(201).json(workout);
  } catch (error) {
    if (error instanceof ActiveWorkoutExistsError || isUniqueViolation(error)) {
        return res
          .status(409)
          .json({ error: 'Ya tenés un entrenamiento en curso para esta rutina' });
    }
    console.error('start workout error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/workouts/active — permite recuperar todas las sesiones pendientes tras recargar.
router.get('/active', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const activeWorkouts = await db
      .select({ id: workouts.id })
      .from(workouts)
      .where(and(eq(workouts.userId, userId), eq(workouts.status, 'in_progress')))
      .orderBy(desc(workouts.startedAt));

    return res.json(await Promise.all(activeWorkouts.map((workout) => loadWorkoutWithDetails(workout.id))));
  } catch (error) {
    console.error('get active workout error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/workouts/:id
router.get('/:id', async (req, res) => {
  const workoutId = Number(req.params.id);
  if (!Number.isInteger(workoutId) || workoutId <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const workout = await getWorkoutForUser(workoutId, req.session.userId!);
    if (!workout) return res.status(404).json({ error: 'Entrenamiento no encontrado' });
    return res.json(await loadWorkoutWithDetails(workout.id));
  } catch (error) {
    console.error('get workout error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/workouts/:id — reemplaza las series de los ejercicios incluidos.
router.put('/:id', async (req, res) => {
  const workoutId = Number(req.params.id);
  if (!Number.isInteger(workoutId) || workoutId <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const parsed = updateWorkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
  }

  const exerciseIds = parsed.data.exercises.map((exercise) => exercise.id);
  if (new Set(exerciseIds).size !== exerciseIds.length) {
    return res.status(400).json({ error: 'No se puede repetir un ejercicio' });
  }
  const clientIds = parsed.data.exercises.flatMap((exercise) =>
    exercise.sets.flatMap((set) => (set.clientId ? [set.clientId] : [])),
  );
  if (new Set(clientIds).size !== clientIds.length) {
    return res.status(400).json({ error: 'No se puede repetir una serie nueva' });
  }
  const hasInvalidSetNumbers = parsed.data.exercises.some((exercise) =>
    exercise.sets.some((set, index) => set.setNumber !== index + 1),
  );
  if (hasInvalidSetNumbers) {
    return res.status(400).json({ error: 'Las series deben numerarse consecutivamente' });
  }

  try {
    const userId = req.session.userId!;
    const setIdMappings = await db.transaction(async (tx) => {
      const [workout] = await tx
        .select()
        .from(workouts)
        .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
        .for('update')
        .limit(1);
      if (!workout) throw new Error('WORKOUT_NOT_FOUND');
      if (workout.status !== 'in_progress') throw new Error('WORKOUT_COMPLETED');
      if (workout.version !== parsed.data.version) throw new Error('WORKOUT_VERSION_CONFLICT');
      const mappings: Array<{ clientId: string; id: number }> = [];

      for (const exercise of parsed.data.exercises) {
        const [ownedExercise] = await tx
          .select({ id: workoutExercises.id })
          .from(workoutExercises)
          .where(
            and(
              eq(workoutExercises.id, exercise.id),
              eq(workoutExercises.workoutId, workoutId),
            ),
          )
          .limit(1);
        if (!ownedExercise) throw new Error('EXERCISE_NOT_FOUND');

        const incomingSetIds = exercise.sets.flatMap((set) => (set.id ? [set.id] : []));
        if (new Set(incomingSetIds).size !== incomingSetIds.length) {
          throw new Error('DUPLICATE_SET');
        }

        const currentSets = await tx
          .select({ id: workoutSets.id })
          .from(workoutSets)
          .where(eq(workoutSets.workoutExerciseId, ownedExercise.id));

        for (const currentSet of currentSets) {
          if (!incomingSetIds.includes(currentSet.id)) {
            await tx.delete(workoutSets).where(eq(workoutSets.id, currentSet.id));
          }
        }

        for (const set of exercise.sets) {
          const values = {
            setNumber: set.setNumber,
            weight: String(set.weight),
            reps: set.reps,
            rir: set.rir,
            updatedAt: new Date(),
          };
          if (set.id) {
            const updated = await tx
              .update(workoutSets)
              .set(values)
              .where(
                and(
                  eq(workoutSets.id, set.id),
                  eq(workoutSets.workoutExerciseId, ownedExercise.id),
                ),
              )
              .returning({ id: workoutSets.id });
            if (!updated[0]) throw new Error('SET_NOT_FOUND');
          } else {
            const [created] = await tx
              .insert(workoutSets)
              .values({
                workoutExerciseId: ownedExercise.id,
                setNumber: values.setNumber,
                weight: values.weight,
                reps: values.reps,
                rir: values.rir,
              })
              .returning({ id: workoutSets.id });
            if (set.clientId) mappings.push({ clientId: set.clientId, id: created.id });
          }
        }
      }

      await tx
        .update(workouts)
        .set({ version: workout.version + 1, updatedAt: new Date() })
        .where(eq(workouts.id, workoutId));
      return mappings;
    });

    // Esta respuesta se deriva sólo de la transacción que posee el lock. No se
    // vuelve a leer el workout luego del commit, porque otro cliente podría
    // haber guardado una versión distinta entre ambas operaciones.
    return res.json({ version: parsed.data.version + 1, setIdMappings });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'WORKOUT_NOT_FOUND') {
        return res.status(404).json({ error: 'Entrenamiento no encontrado' });
      }
      if (error.message === 'WORKOUT_COMPLETED') {
        return res.status(409).json({ error: 'El entrenamiento ya fue finalizado' });
      }
      if (error.message === 'WORKOUT_VERSION_CONFLICT') {
        return res.status(409).json({
          error: 'El entrenamiento cambió en otra sesión. Recargá antes de guardar.',
        });
      }
      if (
        error.message === 'EXERCISE_NOT_FOUND' ||
        error.message === 'SET_NOT_FOUND' ||
        error.message === 'DUPLICATE_SET'
      ) {
        return res.status(400).json({ error: 'Series o ejercicios inválidos' });
      }
    }
    console.error('update workout error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/workouts/:id/complete
router.post('/:id/complete', async (req, res) => {
  const workoutId = Number(req.params.id);
  if (!Number.isInteger(workoutId) || workoutId <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const userId = req.session.userId!;
    await db.transaction(async (tx) => {
      const [workout] = await tx
        .select()
        .from(workouts)
        .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
        .for('update')
        .limit(1);
      if (!workout) throw new Error('WORKOUT_NOT_FOUND');
      if (workout.status !== 'in_progress') throw new Error('WORKOUT_COMPLETED');

      const now = new Date();
      await tx
        .update(workouts)
        .set({ status: 'completed', completedAt: now, updatedAt: now })
        .where(eq(workouts.id, workoutId));
    });

    return res.json(await loadWorkoutWithDetails(workoutId));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'WORKOUT_NOT_FOUND') {
        return res.status(404).json({ error: 'Entrenamiento no encontrado' });
      }
      if (error.message === 'WORKOUT_COMPLETED') {
        return res.status(409).json({ error: 'El entrenamiento ya fue finalizado' });
      }
    }
    console.error('complete workout error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;