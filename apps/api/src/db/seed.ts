import { pool, db, verifyTestDatabaseIdentity } from './index';
import { muscleGroups, exercises } from './schema';
import { eq } from 'drizzle-orm';

async function seed() {
  // El seed de tests solo puede tocar la base aislada. El comando de desarrollo
  // conserva su comportamiento explícito actual y no se ejecuta automáticamente.
  if (process.env.NODE_ENV === 'test') {
    await verifyTestDatabaseIdentity();
  }

  console.log('Seeding database...');

  // ── Grupos musculares ────────────────────────────────────────────────────────
  const groups = [
    'Piernas',
    'Hombros',
    'Bíceps',
    'Tríceps',
    'Espalda',
    'Pecho',
    'Abdominales',
    'Ejercicio aeróbico',
  ];

  const insertedGroups: { id: number; name: string }[] = [];
  for (const name of groups) {
    const existing = await db
      .select()
      .from(muscleGroups)
      .where(eq(muscleGroups.name, name))
      .limit(1);

    if (existing.length === 0) {
      const [g] = await db.insert(muscleGroups).values({ name }).returning();
      insertedGroups.push(g);
      console.log(`  ✓ Grupo muscular: ${name}`);
    } else {
      insertedGroups.push(existing[0]);
      console.log(`  · Ya existe: ${name}`);
    }
  }

  const byName = (n: string) => insertedGroups.find((g) => g.name === n)!;

  // ── Ejercicios del catálogo (globales, userId = null) ──────────────────────
  const catalogExercises = [
    // Piernas
    { name: 'Sentadilla', muscleGroupId: byName('Piernas').id, isBodyweight: false },
    { name: 'Prensa de piernas', muscleGroupId: byName('Piernas').id, isBodyweight: false },
    { name: 'Extensión de cuádriceps', muscleGroupId: byName('Piernas').id, isBodyweight: false },
    { name: 'Curl de femoral', muscleGroupId: byName('Piernas').id, isBodyweight: false },
    { name: 'Sentadilla búlgara', muscleGroupId: byName('Piernas').id, isBodyweight: false },
    { name: 'Estocada', muscleGroupId: byName('Piernas').id, isBodyweight: false },
    { name: 'Peso muerto rumano', muscleGroupId: byName('Piernas').id, isBodyweight: false },
    {
      name: 'Elevación de talones (gemelos)',
      muscleGroupId: byName('Piernas').id,
      isBodyweight: false,
    },
    // Hombros
    { name: 'Press militar', muscleGroupId: byName('Hombros').id, isBodyweight: false },
    { name: 'Elevaciones laterales', muscleGroupId: byName('Hombros').id, isBodyweight: false },
    { name: 'Elevaciones frontales', muscleGroupId: byName('Hombros').id, isBodyweight: false },
    { name: 'Pájaro (posterior)', muscleGroupId: byName('Hombros').id, isBodyweight: false },
    // Bíceps
    { name: 'Curl con barra', muscleGroupId: byName('Bíceps').id, isBodyweight: false },
    { name: 'Curl con mancuernas', muscleGroupId: byName('Bíceps').id, isBodyweight: false },
    { name: 'Curl martillo', muscleGroupId: byName('Bíceps').id, isBodyweight: false },
    { name: 'Curl en banco Scott', muscleGroupId: byName('Bíceps').id, isBodyweight: false },
    // Tríceps
    { name: 'Press francés', muscleGroupId: byName('Tríceps').id, isBodyweight: false },
    {
      name: 'Extensión de tríceps en polea',
      muscleGroupId: byName('Tríceps').id,
      isBodyweight: false,
    },
    { name: 'Dips en paralelas', muscleGroupId: byName('Tríceps').id, isBodyweight: true },
    { name: 'Patada de tríceps', muscleGroupId: byName('Tríceps').id, isBodyweight: false },
    // Espalda
    { name: 'Peso muerto', muscleGroupId: byName('Espalda').id, isBodyweight: false },
    { name: 'Dominadas', muscleGroupId: byName('Espalda').id, isBodyweight: true },
    { name: 'Remo con barra', muscleGroupId: byName('Espalda').id, isBodyweight: false },
    { name: 'Remo en polea baja', muscleGroupId: byName('Espalda').id, isBodyweight: false },
    { name: 'Jalón al pecho', muscleGroupId: byName('Espalda').id, isBodyweight: false },
    { name: 'Remo con mancuerna', muscleGroupId: byName('Espalda').id, isBodyweight: false },
    // Pecho
    { name: 'Press de banca plano', muscleGroupId: byName('Pecho').id, isBodyweight: false },
    { name: 'Press de banca inclinado', muscleGroupId: byName('Pecho').id, isBodyweight: false },
    { name: 'Aperturas con mancuernas', muscleGroupId: byName('Pecho').id, isBodyweight: false },
    { name: 'Fondos (pecho)', muscleGroupId: byName('Pecho').id, isBodyweight: true },
    { name: 'Flexiones', muscleGroupId: byName('Pecho').id, isBodyweight: true },
    { name: 'Cable crossover', muscleGroupId: byName('Pecho').id, isBodyweight: false },
    // Abdominales
    { name: 'Crunch en máquina', muscleGroupId: byName('Abdominales').id, isBodyweight: false },
    { name: 'Plancha', muscleGroupId: byName('Abdominales').id, isBodyweight: true },
    {
      name: 'Elevación de piernas colgado',
      muscleGroupId: byName('Abdominales').id,
      isBodyweight: true,
    },
    { name: 'Rueda abdominal', muscleGroupId: byName('Abdominales').id, isBodyweight: true },
    // Aeróbico
    {
      name: 'Caminata en cinta',
      muscleGroupId: byName('Ejercicio aeróbico').id,
      isBodyweight: true,
    },
    {
      name: 'Bicicleta estática',
      muscleGroupId: byName('Ejercicio aeróbico').id,
      isBodyweight: true,
    },
    { name: 'Remo ergómetro', muscleGroupId: byName('Ejercicio aeróbico').id, isBodyweight: true },
    { name: 'Elíptica', muscleGroupId: byName('Ejercicio aeróbico').id, isBodyweight: true },
  ];

  for (const ex of catalogExercises) {
    const existing = await db.select().from(exercises).where(eq(exercises.name, ex.name)).limit(1);

    if (existing.length === 0) {
      await db.insert(exercises).values({ ...ex, userId: null });
      console.log(`  ✓ Ejercicio: ${ex.name}`);
    } else {
      console.log(`  · Ya existe: ${ex.name}`);
    }
  }

  console.log('\n✅ Seed completado.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
