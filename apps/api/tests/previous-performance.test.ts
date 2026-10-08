import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { cleanDb } from './setup';

type Agent = ReturnType<typeof request.agent>;

function makeAgent(email: string, password = 'password123') {
  const agent = request.agent(app);
  return { agent, register: () => agent.post('/api/auth/register').send({ email, password }) };
}

async function firstExerciseId(agent: Agent) {
  const exercises = await agent.get('/api/exercises');
  return exercises.body[0].id as number;
}

async function createRoutine(agent: Agent, name: string, exerciseId: number, sets: number) {
  const routine = await agent.post('/api/routines').send({ name });
  await agent.put(`/api/routines/${routine.body.id}`).send({
    name,
    exercises: [
      {
        exerciseId,
        position: 0,
        sets: Array.from({ length: sets }, (_, i) => ({
          setNumber: i + 1,
          weight: 0,
          reps: 10,
          rir: null,
        })),
      },
    ],
  });
  return routine.body.id as number;
}

/** Arranca un entrenamiento y guarda las series indicadas, sin finalizarlo. */
async function startAndFill(
  agent: Agent,
  routineId: number,
  sets: Array<{ weight: number; reps: number; completed: boolean }>,
) {
  const started = await agent.post('/api/workouts').send({ routineId });
  const workout = started.body;

  await agent.put(`/api/workouts/${workout.id}`).send({
    version: workout.version,
    exercises: workout.exercises.map((exercise: { id: number; sets: Array<{ id: number }> }) => ({
      id: exercise.id,
      sets: exercise.sets.map((set, index) => ({
        id: set.id,
        setNumber: index + 1,
        weight: sets[index]?.weight ?? 0,
        reps: sets[index]?.reps ?? 10,
        rir: null,
        completed: sets[index]?.completed ?? false,
      })),
    })),
  });

  return workout.id as number;
}

async function runAndFinish(
  agent: Agent,
  routineId: number,
  sets: Array<{ weight: number; reps: number; completed: boolean }>,
) {
  const workoutId = await startAndFill(agent, routineId, sets);
  await agent.post(`/api/workouts/${workoutId}/complete`);
  return workoutId;
}

describe('Rendimiento anterior', () => {
  let agentA: Agent;
  let agentB: Agent;
  let exerciseId: number;

  beforeAll(async () => {
    await cleanDb();
  });

  beforeEach(async () => {
    await cleanDb();
    const stamp = Date.now();
    const a = makeAgent(`prev-a-${stamp}@example.com`);
    await a.register();
    agentA = a.agent;

    const b = makeAgent(`prev-b-${stamp}@example.com`);
    await b.register();
    agentB = b.agent;

    exerciseId = await firstExerciseId(agentA);
  });

  it('exige sesión', async () => {
    const response = await request(app).get('/api/workouts/1/previous');
    expect(response.status).toBe(401);
  });

  it('404 si el entrenamiento no es del usuario', async () => {
    const routineId = await createRoutine(agentB, 'De B', await firstExerciseId(agentB), 1);
    const workoutId = await startAndFill(agentB, routineId, [
      { weight: 50, reps: 10, completed: true },
    ]);

    const response = await agentA.get(`/api/workouts/${workoutId}/previous`);
    expect(response.status).toBe(404);
  });

  it('devuelve vacío la primera vez que se hace un ejercicio', async () => {
    const routineId = await createRoutine(agentA, 'Primera', exerciseId, 2);
    const workoutId = await startAndFill(agentA, routineId, [
      { weight: 80, reps: 10, completed: false },
    ]);

    const response = await agentA.get(`/api/workouts/${workoutId}/previous`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('devuelve las series realizadas del entrenamiento anterior', async () => {
    const routineId = await createRoutine(agentA, 'Push', exerciseId, 2);
    const anterior = await runAndFinish(agentA, routineId, [
      { weight: 80, reps: 10, completed: true },
      { weight: 75, reps: 8, completed: true },
    ]);

    const actual = await startAndFill(agentA, routineId, []);
    const response = await agentA.get(`/api/workouts/${actual}/previous`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);

    const [previo] = response.body;
    expect(previo.exerciseId).toBe(exerciseId);
    expect(previo.workoutId).toBe(anterior);
    expect(previo.sets).toHaveLength(2);
    expect(Number(previo.sets[0].weight)).toBe(80);
    expect(previo.sets[0].reps).toBe(10);
    expect(Number(previo.sets[1].weight)).toBe(75);
  });

  it('nunca se toma a sí mismo como referencia', async () => {
    const routineId = await createRoutine(agentA, 'Solo', exerciseId, 1);
    const workoutId = await startAndFill(agentA, routineId, [
      { weight: 90, reps: 10, completed: true },
    ]);

    const response = await agentA.get(`/api/workouts/${workoutId}/previous`);
    expect(response.body).toEqual([]);
  });

  it('ignora las series que no se marcaron como realizadas', async () => {
    const routineId = await createRoutine(agentA, 'Mixta', exerciseId, 2);
    await runAndFinish(agentA, routineId, [
      { weight: 80, reps: 10, completed: true },
      { weight: 200, reps: 1, completed: false },
    ]);

    const actual = await startAndFill(agentA, routineId, []);
    const response = await agentA.get(`/api/workouts/${actual}/previous`);

    expect(response.body[0].sets).toHaveLength(1);
    expect(Number(response.body[0].sets[0].weight)).toBe(80);
  });

  it('saltea entrenamientos donde no se marcó ninguna serie', async () => {
    const routineId = await createRoutine(agentA, 'Saltear', exerciseId, 1);

    // El bueno, más viejo.
    await runAndFinish(agentA, routineId, [{ weight: 80, reps: 10, completed: true }]);
    // Uno posterior pero abandonado: no es una referencia honesta.
    await runAndFinish(agentA, routineId, [{ weight: 0, reps: 10, completed: false }]);

    const actual = await startAndFill(agentA, routineId, []);
    const response = await agentA.get(`/api/workouts/${actual}/previous`);

    expect(response.body).toHaveLength(1);
    expect(Number(response.body[0].sets[0].weight)).toBe(80);
  });

  it('ignora entrenamientos sin finalizar', async () => {
    const routineId = await createRoutine(agentA, 'En curso', exerciseId, 1);
    // Queda en curso a propósito; sus datos todavía pueden cambiar.
    await startAndFill(agentA, routineId, [{ weight: 95, reps: 10, completed: true }]);

    const otraRutina = await createRoutine(agentA, 'Otra', exerciseId, 1);
    const actual = await startAndFill(agentA, otraRutina, []);

    const response = await agentA.get(`/api/workouts/${actual}/previous`);
    expect(response.body).toEqual([]);
  });

  it('se queda con el más reciente cuando hay varios', async () => {
    const routineId = await createRoutine(agentA, 'Progresión', exerciseId, 1);
    await runAndFinish(agentA, routineId, [{ weight: 70, reps: 10, completed: true }]);
    await runAndFinish(agentA, routineId, [{ weight: 85, reps: 10, completed: true }]);

    const actual = await startAndFill(agentA, routineId, []);
    const response = await agentA.get(`/api/workouts/${actual}/previous`);

    expect(response.body).toHaveLength(1);
    expect(Number(response.body[0].sets[0].weight)).toBe(85);
  });

  it('no mira los entrenamientos de otros usuarios', async () => {
    const exerciseB = await firstExerciseId(agentB);
    const routineB = await createRoutine(agentB, 'De B', exerciseB, 1);
    await runAndFinish(agentB, routineB, [{ weight: 300, reps: 10, completed: true }]);

    const routineA = await createRoutine(agentA, 'De A', exerciseId, 1);
    const actual = await startAndFill(agentA, routineA, []);

    const response = await agentA.get(`/api/workouts/${actual}/previous`);
    expect(response.body).toEqual([]);
  });
});
