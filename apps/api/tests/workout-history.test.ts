import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { cleanDb } from './setup';

function makeAgent(email: string, password = 'password123') {
  const agent = request.agent(app);
  return {
    agent,
    register: () => agent.post('/api/auth/register').send({ email, password }),
  };
}

/** Crea una rutina con un ejercicio y las series que se le pasen. */
async function createRoutine(
  agent: ReturnType<typeof request.agent>,
  name: string,
  sets: Array<{ setNumber: number; weight: number; reps: number }>,
) {
  const exercises = await agent.get('/api/exercises');
  const routine = await agent.post('/api/routines').send({ name });
  await agent.put(`/api/routines/${routine.body.id}`).send({
    name,
    exercises: [{ exerciseId: exercises.body[0].id, position: 0, sets }],
  });
  return routine.body.id as number;
}

/**
 * Corre un entrenamiento completo desde una rutina y lo finaliza, marcando
 * como realizadas las primeras `completar` series.
 */
async function runWorkout(
  agent: ReturnType<typeof request.agent>,
  routineId: number,
  completar: number,
) {
  const started = await agent.post('/api/workouts').send({ routineId });
  const workout = started.body;

  await agent.put(`/api/workouts/${workout.id}`).send({
    version: workout.version,
    exercises: workout.exercises.map((exercise: { id: number; sets: unknown[] }) => ({
      id: exercise.id,
      sets: (exercise.sets as Array<Record<string, unknown>>).map((set, index) => ({
        id: set.id,
        setNumber: set.setNumber,
        weight: Number(set.weight),
        reps: set.reps,
        rir: set.rir ?? null,
        completed: index < completar,
      })),
    })),
  });

  await agent.post(`/api/workouts/${workout.id}/complete`);
  return workout.id as number;
}

describe('Historial de entrenamientos', () => {
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    await cleanDb();
  });

  beforeEach(async () => {
    await cleanDb();
    const stamp = Date.now();
    const a = makeAgent(`hist-a-${stamp}@example.com`);
    await a.register();
    agentA = a.agent;

    const b = makeAgent(`hist-b-${stamp}@example.com`);
    await b.register();
    agentB = b.agent;
  });

  it('exige sesión', async () => {
    const response = await request(app).get('/api/workouts/history');
    expect(response.status).toBe(401);
  });

  it('devuelve vacío cuando no hay entrenamientos terminados', async () => {
    const response = await agentA.get('/api/workouts/history');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], hasMore: false });
  });

  it('no incluye los entrenamientos en curso', async () => {
    const routineId = await createRoutine(agentA, 'En curso', [
      { setNumber: 1, weight: 50, reps: 10 },
    ]);
    await agentA.post('/api/workouts').send({ routineId });

    const response = await agentA.get('/api/workouts/history');
    expect(response.body.items).toHaveLength(0);
  });

  it('resume el entrenamiento terminado con sus totales', async () => {
    const routineId = await createRoutine(agentA, 'Push A', [
      { setNumber: 1, weight: 80, reps: 10 },
      { setNumber: 2, weight: 60, reps: 5 },
    ]);
    await runWorkout(agentA, routineId, 1);

    const response = await agentA.get('/api/workouts/history');
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);

    const [item] = response.body.items;
    expect(item.name).toBe('Push A');
    expect(item.exerciseCount).toBe(1);
    expect(item.totalSets).toBe(2);
    expect(item.completedSets).toBe(1);
    // Sólo cuenta el volumen de lo realizado: 80 x 10, no la serie sin marcar.
    expect(item.totalVolume).toBe(800);
    expect(typeof item.completedAt).toBe('string');
  });

  it('no filtra entrenamientos de otros usuarios', async () => {
    const routineId = await createRoutine(agentB, 'De B', [
      { setNumber: 1, weight: 100, reps: 10 },
    ]);
    await runWorkout(agentB, routineId, 1);

    const response = await agentA.get('/api/workouts/history');
    expect(response.body.items).toHaveLength(0);

    const propio = await agentB.get('/api/workouts/history');
    expect(propio.body.items).toHaveLength(1);
  });

  it('ordena del más reciente al más viejo', async () => {
    const primera = await createRoutine(agentA, 'Primera', [
      { setNumber: 1, weight: 50, reps: 10 },
    ]);
    await runWorkout(agentA, primera, 1);

    const segunda = await createRoutine(agentA, 'Segunda', [
      { setNumber: 1, weight: 60, reps: 10 },
    ]);
    await runWorkout(agentA, segunda, 1);

    const response = await agentA.get('/api/workouts/history');
    expect(response.body.items.map((i: { name: string }) => i.name)).toEqual([
      'Segunda',
      'Primera',
    ]);
  });

  it('pagina con limit y offset, e informa si hay más', async () => {
    for (const nombre of ['Uno', 'Dos', 'Tres']) {
      const routineId = await createRoutine(agentA, nombre, [
        { setNumber: 1, weight: 50, reps: 10 },
      ]);
      await runWorkout(agentA, routineId, 1);
    }

    const primera = await agentA.get('/api/workouts/history?limit=2');
    expect(primera.body.items).toHaveLength(2);
    expect(primera.body.hasMore).toBe(true);

    const segunda = await agentA.get('/api/workouts/history?limit=2&offset=2');
    expect(segunda.body.items).toHaveLength(1);
    expect(segunda.body.hasMore).toBe(false);

    // Sin superposición entre páginas.
    const ids = [...primera.body.items, ...segunda.body.items].map((i: { id: number }) => i.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('rechaza paginación inválida', async () => {
    expect((await agentA.get('/api/workouts/history?limit=0')).status).toBe(400);
    expect((await agentA.get('/api/workouts/history?limit=101')).status).toBe(400);
    expect((await agentA.get('/api/workouts/history?limit=abc')).status).toBe(400);
    expect((await agentA.get('/api/workouts/history?offset=-1')).status).toBe(400);
  });

  it('incluye entrenamientos sin ninguna serie marcada', async () => {
    const routineId = await createRoutine(agentA, 'Abandonado', [
      { setNumber: 1, weight: 50, reps: 10 },
    ]);
    await runWorkout(agentA, routineId, 0);

    const response = await agentA.get('/api/workouts/history');
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].completedSets).toBe(0);
    expect(response.body.items[0].totalVolume).toBe(0);
  });

  it('el detalle de un entrenamiento terminado sigue accesible', async () => {
    const routineId = await createRoutine(agentA, 'Detalle', [
      { setNumber: 1, weight: 70, reps: 12 },
    ]);
    const workoutId = await runWorkout(agentA, routineId, 1);

    const response = await agentA.get(`/api/workouts/${workoutId}`);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('completed');
    expect(response.body.exercises[0].sets[0].completed).toBe(true);
  });
});
