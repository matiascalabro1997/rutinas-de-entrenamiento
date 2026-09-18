import { Router } from 'express';
import { upsertRoutineSchema } from '@rutinas/shared';
import { db } from '../db/index';
import { routines, routineExercises, routineSets, exercises, muscleGroups } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { eq, and, asc, sql } from 'drizzle-orm';

const router = Router();

router.use(requireAuth);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getRoutineForUser(routineId: number, userId: number) {
  const [routine] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .limit(1);
  return routine ?? null;
}

async function loadRoutineWithDetails(routineId: number) {
  const [routine] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);

  if (!routine) return null;

  const reList = await db
    .select({
      id: routineExercises.id,
      routineId: routineExercises.routineId,
      exerciseId: routineExercises.exerciseId,
      position: routineExercises.position,
      exerciseName: exercises.name,
      muscleGroupId: exercises.muscleGroupId,
      muscleGroupName: muscleGroups.name,
      isBodyweight: exercises.isBodyweight,
    })
    .from(routineExercises)
    .leftJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
    .leftJoin(muscleGroups, eq(exercises.muscleGroupId, muscleGroups.id))
    .where(eq(routineExercises.routineId, routineId))
    .orderBy(asc(routineExercises.position));

  const reWithSets = await Promise.all(
    reList.map(async (re) => {
      const sets = await db
        .select()
        .from(routineSets)
        .where(eq(routineSets.routineExerciseId, re.id))
        .orderBy(asc(routineSets.setNumber));
      return { ...re, sets };
    }),
  );

  return { ...routine, exercises: reWithSets };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/routines
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const list = await db
      .select()
      .from(routines)
      .where(eq(routines.userId, userId))
      .orderBy(asc(routines.createdAt));

    // Añadir conteo de ejercicios
    const withCount = await Promise.all(
      list.map(async (r) => {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(routineExercises)
          .where(eq(routineExercises.routineId, r.id));
        return { ...r, exerciseCount: count };
      }),
    );

    return res.json(withCount);
  } catch (err) {
    console.error('list routines error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/routines
router.post('/', async (req, res) => {
  try {
    const parsed = upsertRoutineSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
    }

    const userId = req.session.userId!;
    const [routine] = await db
      .insert(routines)
      .values({ userId, name: parsed.data.name })
      .returning();

    const full = await loadRoutineWithDetails(routine.id);
    return res.status(201).json(full);
  } catch (err) {
    console.error('create routine error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/routines/:id
router.get('/:id', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const owns = await getRoutineForUser(id, userId);
    if (!owns) return res.status(404).json({ error: 'Rutina no encontrada' });

    const full = await loadRoutineWithDetails(id);
    return res.json(full);
  } catch (err) {
    console.error('get routine error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/routines/:id — upsert completo (nombre + ejercicios + series)
router.put('/:id', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const owns = await getRoutineForUser(id, userId);
    if (!owns) return res.status(404).json({ error: 'Rutina no encontrada' });

    const parsed = upsertRoutineSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
    }

    const { name, exercises: exList } = parsed.data;

    // Todo el upsert en una sola transacción para garantizar atomicidad:
    // si cualquier actualización de posición falla, se revierten todas.
    await db.transaction(async (tx) => {
      // 1. Actualizar nombre de rutina
      await tx.update(routines).set({ name, updatedAt: new Date() }).where(eq(routines.id, id));

      // 2. Obtener routine_exercises actuales
      const currentREs = await tx
        .select()
        .from(routineExercises)
        .where(eq(routineExercises.routineId, id));

      const incomingREIds = exList.filter((e) => e.id !== undefined).map((e) => e.id!);

      // 3. Eliminar routine_exercises que ya no están
      for (const re of currentREs) {
        if (!incomingREIds.includes(re.id)) {
          await tx.delete(routineExercises).where(eq(routineExercises.id, re.id));
        }
      }

      // 4. Upsert cada routine_exercise y sus sets
      for (const ex of exList) {
        let reId: number;

        if (ex.id) {
          // Actualizar posición
          await tx
            .update(routineExercises)
            .set({ position: ex.position, updatedAt: new Date() })
            .where(eq(routineExercises.id, ex.id));
          reId = ex.id;
        } else {
          // Insertar nuevo
          const [inserted] = await tx
            .insert(routineExercises)
            .values({ routineId: id, exerciseId: ex.exerciseId, position: ex.position })
            .returning();
          reId = inserted.id;
        }

        // Sets del ejercicio
        const currentSets = await tx
          .select()
          .from(routineSets)
          .where(eq(routineSets.routineExerciseId, reId));

        const incomingSetIds = ex.sets.filter((s) => s.id !== undefined).map((s) => s.id!);

        // Eliminar sets que ya no están
        for (const s of currentSets) {
          if (!incomingSetIds.includes(s.id)) {
            await tx.delete(routineSets).where(eq(routineSets.id, s.id));
          }
        }

        // Upsert sets
        for (const set of ex.sets) {
          const weightStr = String(set.weight ?? 0);
          if (set.id) {
            await tx
              .update(routineSets)
              .set({
                setNumber: set.setNumber,
                weight: weightStr,
                reps: set.reps,
                rir: set.rir,
                updatedAt: new Date(),
              })
              .where(eq(routineSets.id, set.id));
          } else {
            await tx.insert(routineSets).values({
              routineExerciseId: reId,
              setNumber: set.setNumber,
              weight: weightStr,
              reps: set.reps,
              rir: set.rir,
            });
          }
        }
      }
    });

    const full = await loadRoutineWithDetails(id);
    return res.json(full);
  } catch (err) {
    console.error('update routine error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/routines/:id/duplicate
router.post('/:id/duplicate', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const original = await getRoutineForUser(id, userId);
    if (!original) return res.status(404).json({ error: 'Rutina no encontrada' });

    const full = await loadRoutineWithDetails(id);
    if (!full) return res.status(404).json({ error: 'Rutina no encontrada' });

    // Crear copia
    const [copy] = await db
      .insert(routines)
      .values({ userId, name: `${full.name} (copia)` })
      .returning();

    for (const re of full.exercises) {
      const [newRE] = await db
        .insert(routineExercises)
        .values({ routineId: copy.id, exerciseId: re.exerciseId, position: re.position })
        .returning();

      for (const s of re.sets) {
        await db.insert(routineSets).values({
          routineExerciseId: newRE.id,
          setNumber: s.setNumber,
          weight: s.weight,
          reps: s.reps,
          rir: s.rir,
        });
      }
    }

    const copiedFull = await loadRoutineWithDetails(copy.id);
    return res.status(201).json(copiedFull);
  } catch (err) {
    console.error('duplicate routine error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/routines/:id/archive
router.patch('/:id/archive', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const owns = await getRoutineForUser(id, userId);
    if (!owns) return res.status(404).json({ error: 'Rutina no encontrada' });

    const isArchived = owns.archivedAt !== null;
    const [updated] = await db
      .update(routines)
      .set({
        archivedAt: isArchived ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(routines.id, id))
      .returning();

    return res.json(updated);
  } catch (err) {
    console.error('archive routine error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/routines/:id
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const owns = await getRoutineForUser(id, userId);
    if (!owns) return res.status(404).json({ error: 'Rutina no encontrada' });

    await db.delete(routines).where(eq(routines.id, id));
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete routine error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
