import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../server/index';
import { pool } from '../server/db/index';
import { cleanDb } from './setup';

function makeAgent(email: string, password = 'password123') {
  const agent = request.agent(app);
  return {
    agent,
    password,
    register: () => agent.post('/api/auth/register').send({ email, password }),
  };
}

async function createRoutineWithSets(agent: ReturnType<typeof request.agent>) {
  const exercises = await agent.get('/api/exercises');
  const exerciseId = exercises.body[0].id;
  const routine = await agent.post('/api/routines').send({ name: 'Rutina de entrenamiento' });

  const savedRoutine = await agent.put(`/api/routines/${routine.body.id}`).send({
    name: 'Rutina de entrenamiento',
    exercises: [
      {
        exerciseId,
        position: 0,
        sets: [
          { setNumber: 1, weight: 80, reps: 8, rir: 2 },
          { setNumber: 2, weight: 77.5, reps: 10, rir: 1 },
        ],
      },
    ],
  });

  return savedRoutine.body;
}

describe('Entrenamientos activos', () => {
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let emailA: string;
  let passwordA: string;

  beforeAll(async () => {
    await cleanDb();
  });

  beforeEach(async () => {
    await cleanDb();
    const stamp = Date.now();
    emailA = `workout-a-${stamp}@example.com`;
    const a = makeAgent(emailA);
    passwordA = a.password;
    await a.register();
    agentA = a.agent;

    const b = makeAgent(`workout-b-${stamp}@example.com`);
    await b.register();
    agentB = b.agent;
  });

  it('crea un snapshot que sobrevive cambios y borrado de la rutina original', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });

    expect(started.status).toBe(201);
    expect(started.body.status).toBe('in_progress');
    expect(started.body.name).toBe('Rutina de entrenamiento');
    expect(started.body.exercises).toHaveLength(1);
    expect(started.body.exercises[0].sets).toHaveLength(2);
    expect(Number(started.body.exercises[0].sets[0].weight)).toBe(80);

    await agentA
      .put(`/api/routines/${routine.id}`)
      .send({ name: 'Rutina cambiada', exercises: [] });
    const deleted = await agentA.delete(`/api/routines/${routine.id}`);
    expect(deleted.status).toBe(200);

    const reloaded = await agentA.get(`/api/workouts/${started.body.id}`);
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.routineId).toBeNull();
    expect(reloaded.body.name).toBe('Rutina de entrenamiento');
    expect(reloaded.body.exercises[0].sets).toHaveLength(2);
    expect(Number(reloaded.body.exercises[0].sets[1].weight)).toBe(77.5);
  });

  it('persiste cambios, nuevas series y eliminaciones al recargar', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });
    const workout = started.body;
    const exercise = workout.exercises[0];

    const updated = await agentA.put(`/api/workouts/${workout.id}`).send({
      version: workout.version,
      exercises: [
        {
          id: exercise.id,
          sets: [
            {
              id: exercise.sets[0].id,
              setNumber: 1,
              weight: 90,
              reps: 6,
              rir: 0,
            },
            {
              clientId: '5cd54c9c-becd-4a0c-b5d8-28b7d9e07f09',
              setNumber: 2,
              weight: 85,
              reps: 8,
              rir: 1,
            },
          ],
        },
      ],
    });

    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(workout.version + 1);
    expect(updated.body.setIdMappings).toEqual([
      { clientId: '5cd54c9c-becd-4a0c-b5d8-28b7d9e07f09', id: expect.any(Number) },
    ]);

    const reloaded = await agentA.get(`/api/workouts/${workout.id}`);
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.exercises[0].sets).toHaveLength(2);
    expect(Number(reloaded.body.exercises[0].sets[0].weight)).toBe(90);
    expect(reloaded.body.exercises[0].sets[0].reps).toBe(6);
    expect(reloaded.body.exercises[0].sets[0].rir).toBe(0);
    expect(Number(reloaded.body.exercises[0].sets[1].weight)).toBe(85);
  });

  it('rechaza numeración de series duplicada o con saltos', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });
    const exercise = started.body.exercises[0];

    const invalid = await agentA.put(`/api/workouts/${started.body.id}`).send({
      version: started.body.version,
      exercises: [
        {
          id: exercise.id,
          sets: [
            { id: exercise.sets[0].id, setNumber: 1, weight: 80, reps: 8, rir: 2 },
            { id: exercise.sets[1].id, setNumber: 3, weight: 77.5, reps: 10, rir: 1 },
          ],
        },
      ],
    });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toMatch(/consecutivamente/);
  });

  it('persiste una edición guardada inmediatamente antes de recuperar la sesión', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });
    const exercise = started.body.exercises[0];

    // El botón "Volver" fuerza este mismo PUT antes de navegar, sin esperar al debounce.
    const savedBeforeExit = await agentA.put(`/api/workouts/${started.body.id}`).send({
      version: started.body.version,
      exercises: [
        {
          id: exercise.id,
          sets: [
            { id: exercise.sets[0].id, setNumber: 1, weight: 92.5, reps: 7, rir: 1 },
            {
              id: exercise.sets[1].id,
              setNumber: 2,
              weight: 77.5,
              reps: 10,
              rir: 1,
            },
          ],
        },
      ],
    });
    expect(savedBeforeExit.status).toBe(200);

    const resumed = await agentA.get('/api/workouts/active');
    expect(resumed.status).toBe(200);
    expect(Number(resumed.body.exercises[0].sets[0].weight)).toBe(92.5);
    expect(resumed.body.exercises[0].sets[0].reps).toBe(7);
  });

  it('recupera el entrenamiento activo después de iniciar sesión nuevamente', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });

    const newSession = request.agent(app);
    const login = await newSession.post('/api/auth/login').send({ email: emailA, password: passwordA });
    expect(login.status).toBe(200);

    const active = await newSession.get('/api/workouts/active');
    expect(active.status).toBe(200);
    expect(active.body.id).toBe(started.body.id);
    expect(active.body.status).toBe('in_progress');
  });

  it('actualiza sesiones heredadas con estado active sin perder la recuperación', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });

    await pool.query('DROP INDEX IF EXISTS workouts_one_active_per_user_idx');
    await pool.query("UPDATE workouts SET status = 'active' WHERE id = $1", [started.body.id]);
    await pool.query("ALTER TABLE workouts ALTER COLUMN status SET DEFAULT 'active'");
    await pool.query(
      "CREATE UNIQUE INDEX workouts_one_active_per_user_idx ON workouts (user_id) WHERE status = 'active'",
    );

    const migration = await readFile('scripts/migrate-workouts.sql', 'utf8');
    await pool.query(migration);

    const resumed = await agentA.get('/api/workouts/active');
    expect(resumed.status).toBe(200);
    expect(resumed.body.id).toBe(started.body.id);
    expect(resumed.body.status).toBe('in_progress');

    const completed = await agentA.post(`/api/workouts/${started.body.id}/complete`);
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe('completed');
  });

  it('finaliza el entrenamiento, conserva sus fechas y permite iniciar uno nuevo', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });

    const completed = await agentA.post(`/api/workouts/${started.body.id}/complete`);
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe('completed');
    expect(completed.body.startedAt).toBeTruthy();
    expect(completed.body.completedAt).toBeTruthy();

    const active = await agentA.get('/api/workouts/active');
    expect(active.status).toBe(200);
    expect(active.body).toBeNull();

    const nextWorkout = await agentA.post('/api/workouts').send({ routineId: routine.id });
    expect(nextWorkout.status).toBe(201);
    expect(nextWorkout.body.id).not.toBe(started.body.id);
  });

  it('rechaza un segundo entrenamiento en curso para el mismo usuario', async () => {
    const routine = await createRoutineWithSets(agentA);
    const first = await agentA.post('/api/workouts').send({ routineId: routine.id });
    const second = await agentA.post('/api/workouts').send({ routineId: routine.id });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it('impide que otro usuario inicie, lea, edite o finalice entrenamientos ajenos', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });
    const workout = started.body;

    expect((await agentB.post('/api/workouts').send({ routineId: routine.id })).status).toBe(404);
    expect((await agentB.get(`/api/workouts/${workout.id}`)).status).toBe(404);
    expect(
      (
        await agentB.put(`/api/workouts/${workout.id}`).send({
          version: workout.version,
          exercises: [{ id: workout.exercises[0].id, sets: [] }],
        })
      ).status,
    ).toBe(404);
    expect((await agentB.post(`/api/workouts/${workout.id}/complete`)).status).toBe(404);

    const untouched = await agentA.get(`/api/workouts/${workout.id}`);
    expect(untouched.status).toBe(200);
    expect(untouched.body.status).toBe('in_progress');
    expect(untouched.body.exercises[0].sets).toHaveLength(2);
  });

  it('rechaza un guardado desactualizado de otra sesión sin perder el primero', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });
    const workout = started.body;
    const exercise = workout.exercises[0];

    const secondSession = request.agent(app);
    const login = await secondSession.post('/api/auth/login').send({ email: emailA, password: passwordA });
    expect(login.status).toBe(200);

    const firstSave = await agentA.put(`/api/workouts/${workout.id}`).send({
      version: workout.version,
      exercises: [
        {
          id: exercise.id,
          sets: [
            { id: exercise.sets[0].id, setNumber: 1, weight: 95, reps: 5, rir: 1 },
            {
              id: exercise.sets[1].id,
              setNumber: 2,
              weight: 77.5,
              reps: 10,
              rir: 1,
            },
          ],
        },
      ],
    });
    expect(firstSave.status).toBe(200);

    const staleSave = await secondSession.put(`/api/workouts/${workout.id}`).send({
      version: workout.version,
      exercises: [
        {
          id: exercise.id,
          sets: [
            { id: exercise.sets[0].id, setNumber: 1, weight: 40, reps: 12, rir: 2 },
            {
              id: exercise.sets[1].id,
              setNumber: 2,
              weight: 77.5,
              reps: 10,
              rir: 1,
            },
          ],
        },
      ],
    });
    expect(staleSave.status).toBe(409);

    const reloaded = await agentA.get(`/api/workouts/${workout.id}`);
    expect(Number(reloaded.body.exercises[0].sets[0].weight)).toBe(95);
    expect(reloaded.body.version).toBe(firstSave.body.version);
  });

  it('expone el estado completado tras un conflicto de guardado entre dos sesiones propias', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });

    const secondSession = request.agent(app);
    const login = await secondSession.post('/api/auth/login').send({ email: emailA, password: passwordA });
    expect(login.status).toBe(200);

    const completed = await secondSession.post(`/api/workouts/${started.body.id}/complete`);
    expect(completed.status).toBe(200);

    const staleSave = await agentA.put(`/api/workouts/${started.body.id}`).send({
      version: started.body.version,
      exercises: started.body.exercises.map((exercise: any) => ({
        id: exercise.id,
        sets: exercise.sets.map((set: any) => ({
          id: set.id,
          setNumber: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          rir: set.rir,
        })),
      })),
    });
    expect(staleSave.status).toBe(409);

    const authoritative = await agentA.get(`/api/workouts/${started.body.id}`);
    expect(authoritative.status).toBe(200);
    expect(authoritative.body.status).toBe('completed');
  });
});