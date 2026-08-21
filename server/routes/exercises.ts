import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index';
import { exercises, muscleGroups } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { eq, or, isNull } from 'drizzle-orm';

const router = Router();

// GET /api/muscle-groups
router.get('/muscle-groups', async (_req, res) => {
  try {
    const groups = await db
      .select()
      .from(muscleGroups)
      .orderBy(muscleGroups.name);
    return res.json(groups);
  } catch (err) {
    console.error('muscle-groups error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/exercises — catálogo global + ejercicios del usuario autenticado
router.get('/exercises', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const list = await db
      .select({
        id: exercises.id,
        name: exercises.name,
        muscleGroupId: exercises.muscleGroupId,
        muscleGroupName: muscleGroups.name,
        isBodyweight: exercises.isBodyweight,
        isCustom: exercises.userId,
      })
      .from(exercises)
      .leftJoin(muscleGroups, eq(exercises.muscleGroupId, muscleGroups.id))
      .where(or(isNull(exercises.userId), eq(exercises.userId, userId)))
      .orderBy(muscleGroups.name, exercises.name);

    return res.json(
      list.map((e) => ({ ...e, isCustom: e.isCustom !== null })),
    );
  } catch (err) {
    console.error('exercises error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/exercises — crear ejercicio personalizado
router.post('/exercises', requireAuth, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(255),
    muscleGroupId: z.number().int().positive(),
    isBodyweight: z.boolean().default(false),
  });

  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const userId = req.session.userId!;
    const { name, muscleGroupId, isBodyweight } = parsed.data;

    // Verificar que el grupo muscular exista
    const [group] = await db
      .select()
      .from(muscleGroups)
      .where(eq(muscleGroups.id, muscleGroupId))
      .limit(1);
    if (!group) {
      return res.status(400).json({ error: 'Grupo muscular no encontrado' });
    }

    const [ex] = await db
      .insert(exercises)
      .values({ name, muscleGroupId, isBodyweight, userId })
      .returning();

    return res.status(201).json({ ...ex, muscleGroupName: group.name, isCustom: true });
  } catch (err) {
    console.error('create exercise error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
