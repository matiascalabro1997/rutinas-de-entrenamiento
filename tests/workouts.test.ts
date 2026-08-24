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

  it('inicia el cronómetro en cero y reconstruye un período activo al reabrir', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });

    expect(started.status).toBe(201);
    expect(started.body.elapsedSeconds).toBe(0);
    expect(started.body.timerStatus).toBe('running');
    expect(started.body.activeStartedAt).toBeTruthy();
    expect(started.body.serverNow).toBeTruthy();

    // Simula una reapertura después de salir de la aplicación sin pausar.
    await pool.query(
      "UPDATE workouts SET active_started_at = now() - interval '95 seconds' WHERE id = $1",
      [started.body.id],
    );

    const reopened = await agentA.get(`/api/workouts/${started.body.id}`);
    expect(reopened.status).toBe(200);
    expect(reopened.body.timerStatus).toBe('running');
    expect(reopened.body.elapsedSeconds).toBeGreaterThanOrEqual(95);

    const recovered = await agentA.get('/api/workouts/active');
    expect(recovered.status).toBe(200);
    expect(recovered.body[0].id).toBe(started.body.id);
    expect(recovered.body[0].elapsedSeconds).toBeGreaterThanOrEqual(95);
  });

  it('acumula períodos activos, no cuenta una pausa y congela el tiempo al finalizar', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });

    await pool.query(
      "UPDATE workouts SET active_started_at = now() - interval '120 seconds' WHERE id = $1",
      [started.body.id],
    );
    const paused = await agentA.post(`/api/workouts/${started.body.id}/pause`);
    expect(paused.status).toBe(200);
    expect(paused.body.timerStatus).toBe('paused');
    expect(paused.body.activeStartedAt).toBeNull();
    expect(paused.body.elapsedSeconds).toBeGreaterThanOrEqual(120);

    // Un timestamp viejo no debe afectar un workout pausado al consultar de nuevo.
    await pool.query(
      "UPDATE workouts SET updated_at = now() - interval '3 hours' WHERE id = $1",
      [started.body.id],
    );
    const stillPaused = await agentA.get(`/api/workouts/${started.body.id}`);
    expect(stillPaused.status).toBe(200);
    expect(stillPaused.body.timerStatus).toBe('paused');
    expect(stillPaused.body.elapsedSeconds).toBe(paused.body.elapsedSeconds);

    const resumed = await agentA.post(`/api/workouts/${started.body.id}/resume`);
    expect(resumed.status).toBe(200);
    expect(resumed.body.timerStatus).toBe('running');
    await pool.query(
      "UPDATE workouts SET active_started_at = now() - interval '35 seconds' WHERE id = $1",
      [started.body.id],
    );

    const completed = await agentA.post(`/api/workouts/${started.body.id}/complete`);
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe('completed');
    expect(completed.body.timerStatus).toBe('completed');
    expect(completed.body.activeStartedAt).toBeNull();
    expect(completed.body.elapsedSeconds).toBeGreaterThanOrEqual(paused.body.elapsedSeconds + 35);

    const frozenDuration = completed.body.elapsedSeconds;
    await pool.query(
      "UPDATE workouts SET completed_at = now() - interval '6 hours' WHERE id = $1",
      [started.body.id],
    );
    const reopened = await agentA.get(`/api/workouts/${started.body.id}`);
    expect(reopened.body.elapsedSeconds).toBe(frozenDuration);
    expect((await agentA.post(`/api/workouts/${started.body.id}/pause`)).status).toBe(409);
    expect((await agentA.post(`/api/workouts/${started.body.id}/resume`)).status).toBe(409);
  });

  it('mantiene el tiempo independiente entre workouts de rutinas diferentes', async () => {
    const firstRoutine = await createRoutineWithSets(agentA);
    const secondRoutine = await createRoutineWithSets(agentA);
    const first = await agentA.post('/api/workouts').send({ routineId: firstRoutine.id });
    const second = await agentA.post('/api/workouts').send({ routineId: secondRoutine.id });

    await pool.query(
      "UPDATE workouts SET active_started_at = now() - interval '40 seconds' WHERE id = $1",
      [first.body.id],
    );
    await pool.query(
      "UPDATE workouts SET active_started_at = now() - interval '140 seconds' WHERE id = $1",
      [second.body.id],
    );

    const [firstPaused, secondPaused] = await Promise.all([
      agentA.post(`/api/workouts/${first.body.id}/pause`),
      agentA.post(`/api/workouts/${second.body.id}/pause`),
    ]);
    expect(firstPaused.status).toBe(200);
    expect(secondPaused.status).toBe(200);
    expect(firstPaused.body.elapsedSeconds).toBeGreaterThanOrEqual(40);
    expect(secondPaused.body.elapsedSeconds).toBeGreaterThanOrEqual(140);
    expect(secondPaused.body.elapsedSeconds).toBeGreaterThan(firstPaused.body.elapsedSeconds);
  });

  it('serializa pausas y finalizaciones concurrentes sin duplicar el tiempo', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });
    await pool.query(
      "UPDATE workouts SET active_started_at = now() - interval '75 seconds' WHERE id = $1",
      [started.body.id],
    );

    const pauses = await Promise.all([
      agentA.post(`/api/workouts/${started.body.id}/pause`),
      agentA.post(`/api/workouts/${started.body.id}/pause`),
    ]);
    expect(pauses.map((response) => response.status)).toEqual([200, 200]);
    expect(pauses[0].body.timerStatus).toBe('paused');
    expect(pauses[1].body.timerStatus).toBe('paused');

    const storedAfterPause = await pool.query<{ elapsed_seconds: number }>(
      'SELECT elapsed_seconds FROM workouts WHERE id = $1',
      [started.body.id],
    );
    expect(Number(storedAfterPause.rows[0]?.elapsed_seconds)).toBeGreaterThanOrEqual(75);
    expect(Number(storedAfterPause.rows[0]?.elapsed_seconds)).toBeLessThan(80);

    const completions = await Promise.all([
      agentA.post(`/api/workouts/${started.body.id}/complete`),
      agentA.post(`/api/workouts/${started.body.id}/complete`),
    ]);
    expect(completions.map((response) => response.status).sort()).toEqual([200, 409]);

    const authoritative = await agentA.get(`/api/workouts/${started.body.id}`);
    expect(authoritative.body.status).toBe('completed');
    expect(authoritative.body.elapsedSeconds).toBe(
      Number(storedAfterPause.rows[0]?.elapsed_seconds),
    );
  });

  it('resuelve una pausa o reanudación concurrente con finalización sin volver a activar el cronómetro', async () => {
    const routine = await createRoutineWithSets(agentA);
    const first = await agentA.post('/api/workouts').send({ routineId: routine.id });
    await pool.query(
      "UPDATE workouts SET active_started_at = now() - interval '45 seconds' WHERE id = $1",
      [first.body.id],
    );

    const [pause, finishWhileRunning] = await Promise.all([
      agentA.post(`/api/workouts/${first.body.id}/pause`),
      agentA.post(`/api/workouts/${first.body.id}/complete`),
    ]);
    expect(finishWhileRunning.status).toBe(200);
    expect([200, 409]).toContain(pause.status);
    const afterFirstRace = await agentA.get(`/api/workouts/${first.body.id}`);
    expect(afterFirstRace.body.status).toBe('completed');
    expect(afterFirstRace.body.timerStatus).toBe('completed');
    expect(afterFirstRace.body.elapsedSeconds).toBeGreaterThanOrEqual(45);

    const secondRoutine = await createRoutineWithSets(agentA);
    const second = await agentA.post('/api/workouts').send({ routineId: secondRoutine.id });
    const paused = await agentA.post(`/api/workouts/${second.body.id}/pause`);
    expect(paused.status).toBe(200);

    const [resume, finishWhilePaused] = await Promise.all([
      agentA.post(`/api/workouts/${second.body.id}/resume`),
      agentA.post(`/api/workouts/${second.body.id}/complete`),
    ]);
    expect(finishWhilePaused.status).toBe(200);
    expect([200, 409]).toContain(resume.status);
    const afterSecondRace = await agentA.get(`/api/workouts/${second.body.id}`);
    expect(afterSecondRace.body.status).toBe('completed');
    expect(afterSecondRace.body.timerStatus).toBe('completed');
    expect(afterSecondRace.body.activeStartedAt).toBeNull();
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

  it('marca, desmarca y conserva series realizadas dentro del snapshot', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });
    const workout = started.body;
    const exercise = workout.exercises[0];

    expect(exercise.sets[0].completed).toBe(false);
    const marked = await agentA.put(`/api/workouts/${workout.id}`).send({
      version: workout.version,
      exercises: [{
        id: exercise.id,
        sets: exercise.sets.map((set: any, index: number) => ({
          id: set.id,
          setNumber: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          rir: set.rir,
          completed: index === 0,
        })),
      }],
    });
    expect(marked.status).toBe(200);

    const deletedRoutine = await agentA.delete(`/api/routines/${routine.id}`);
    expect(deletedRoutine.status).toBe(200);
    const reloaded = await agentA.get(`/api/workouts/${workout.id}`);
    expect(reloaded.body.exercises[0].sets[0].completed).toBe(true);
    expect(reloaded.body.exercises[0].sets[1].completed).toBe(false);

    const unmarked = await agentA.put(`/api/workouts/${workout.id}`).send({
      version: reloaded.body.version,
      exercises: [{
        id: reloaded.body.exercises[0].id,
        sets: reloaded.body.exercises[0].sets.map((set: any) => ({
          id: set.id,
          setNumber: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          rir: set.rir,
          completed: false,
        })),
      }],
    });
    expect(unmarked.status).toBe(200);
    const afterUnmark = await agentA.get(`/api/workouts/${workout.id}`);
    expect(afterUnmark.body.exercises[0].sets[0].completed).toBe(false);
  });

  it('no marca una serie al cambiar peso, repeticiones o RIR', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });
    const workout = started.body;
    const exercise = workout.exercises[0];

    const updated = await agentA.put(`/api/workouts/${workout.id}`).send({
      version: workout.version,
      exercises: [{
        id: exercise.id,
        sets: exercise.sets.map((set: any, index: number) => ({
          id: set.id,
          setNumber: set.setNumber,
          weight: index === 0 ? 95 : set.weight,
          reps: index === 0 ? 6 : set.reps,
          rir: index === 0 ? 1 : set.rir,
          completed: false,
        })),
      }],
    });
    expect(updated.status).toBe(200);

    const reloaded = await agentA.get(`/api/workouts/${workout.id}`);
    expect(Number(reloaded.body.exercises[0].sets[0].weight)).toBe(95);
    expect(reloaded.body.exercises[0].sets[0].completed).toBe(false);
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
    expect(resumed.body).toHaveLength(1);
    expect(Number(resumed.body[0].exercises[0].sets[0].weight)).toBe(92.5);
    expect(resumed.body[0].exercises[0].sets[0].reps).toBe(7);
  });

  it('recupera el entrenamiento activo después de iniciar sesión nuevamente', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });

    const newSession = request.agent(app);
    const login = await newSession.post('/api/auth/login').send({ email: emailA, password: passwordA });
    expect(login.status).toBe(200);

    const active = await newSession.get('/api/workouts/active');
    expect(active.status).toBe(200);
    expect(active.body).toHaveLength(1);
    expect(active.body[0].id).toBe(started.body.id);
    expect(active.body[0].status).toBe('in_progress');
  });

  it('actualiza sesiones heredadas con estado active sin perder la recuperación', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });

    await pool.query('DROP INDEX IF EXISTS workouts_one_in_progress_per_routine_idx');
    await pool.query("UPDATE workouts SET status = 'active' WHERE id = $1", [started.body.id]);
    await pool.query("ALTER TABLE workouts ALTER COLUMN status SET DEFAULT 'active'");
    await pool.query(
      "CREATE UNIQUE INDEX workouts_one_active_per_user_idx ON workouts (user_id) WHERE status = 'active'",
    );

    const migration = await readFile('scripts/migrate-workouts.sql', 'utf8');
    await pool.query(migration);

    const resumed = await agentA.get('/api/workouts/active');
    expect(resumed.status).toBe(200);
    expect(resumed.body).toHaveLength(1);
    expect(resumed.body[0].id).toBe(started.body.id);
    expect(resumed.body[0].status).toBe('in_progress');

    const completed = await agentA.post(`/api/workouts/${started.body.id}/complete`);
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe('completed');
  });

  it('finaliza el entrenamiento, conserva sus fechas y permite iniciar uno nuevo', async () => {
    const routine = await createRoutineWithSets(agentA);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });
    const exercise = started.body.exercises[0];

    const marked = await agentA.put(`/api/workouts/${started.body.id}`).send({
      version: started.body.version,
      exercises: [{
        id: exercise.id,
        sets: exercise.sets.map((set: any, index: number) => ({
          id: set.id,
          setNumber: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          rir: set.rir,
          completed: index === 0,
        })),
      }],
    });
    expect(marked.status).toBe(200);

    const completed = await agentA.post(`/api/workouts/${started.body.id}/complete`);
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe('completed');
    expect(completed.body.startedAt).toBeTruthy();
    expect(completed.body.completedAt).toBeTruthy();
    expect(completed.body.exercises[0].sets[0].completed).toBe(true);

    const active = await agentA.get('/api/workouts/active');
    expect(active.status).toBe(200);
    expect(active.body).toEqual([]);

    const nextWorkout = await agentA.post('/api/workouts').send({ routineId: routine.id });
    expect(nextWorkout.status).toBe(201);
    expect(nextWorkout.body.id).not.toBe(started.body.id);
  });

  it('permite entrenamientos en progreso de rutinas diferentes y recuperarlos en cualquier orden', async () => {
    const routine = await createRoutineWithSets(agentA);
    const otherRoutine = await createRoutineWithSets(agentA);
    const first = await agentA.post('/api/workouts').send({ routineId: routine.id });
    const second = await agentA.post('/api/workouts').send({ routineId: otherRoutine.id });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const recovered = await agentA.get('/api/workouts/active');
    expect(recovered.status).toBe(200);
    expect(recovered.body).toHaveLength(2);
    expect(recovered.body.map((workout: { id: number }) => workout.id)).toEqual(
      expect.arrayContaining([first.body.id, second.body.id]),
    );
  });

  it('rechaza una segunda instancia en progreso de la misma rutina', async () => {
    const routine = await createRoutineWithSets(agentA);
    const first = await agentA.post('/api/workouts').send({ routineId: routine.id });
    const second = await agentA.post('/api/workouts').send({ routineId: routine.id });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it('impide que otro usuario inicie, lea, edite o finalice entrenamientos ajenos', async () => {
    const routine = await createRoutineWithSets(agentA);
    const routineB = await createRoutineWithSets(agentB);
    const started = await agentA.post('/api/workouts').send({ routineId: routine.id });
    const startedB = await agentB.post('/api/workouts').send({ routineId: routineB.id });
    const workout = started.body;

    expect(startedB.status).toBe(201);
    expect((await agentB.post('/api/workouts').send({ routineId: routine.id })).status).toBe(404);
    expect((await agentB.get(`/api/workouts/${workout.id}`)).status).toBe(404);
    expect((await agentB.post(`/api/workouts/${workout.id}/pause`)).status).toBe(404);
    expect((await agentB.post(`/api/workouts/${workout.id}/resume`)).status).toBe(404);
    expect(
      (
        await agentB.put(`/api/workouts/${workout.id}`).send({
          version: workout.version,
          exercises: [{
            id: workout.exercises[0].id,
            sets: workout.exercises[0].sets.map((set: any) => ({
              id: set.id,
              setNumber: set.setNumber,
              weight: set.weight,
              reps: set.reps,
              rir: set.rir,
              completed: true,
            })),
          }],
        })
      ).status,
    ).toBe(404);
    expect((await agentB.post(`/api/workouts/${workout.id}/complete`)).status).toBe(404);

    const untouched = await agentA.get(`/api/workouts/${workout.id}`);
    expect(untouched.status).toBe(200);
    expect(untouched.body.status).toBe('in_progress');
    expect(untouched.body.exercises[0].sets).toHaveLength(2);
    expect(untouched.body.exercises[0].sets[0].completed).toBe(false);

    const [recoveredA, recoveredB] = await Promise.all([
      agentA.get('/api/workouts/active'),
      agentB.get('/api/workouts/active'),
    ]);
    expect(recoveredA.body.map((item: { id: number }) => item.id)).toEqual([workout.id]);
    expect(recoveredB.body.map((item: { id: number }) => item.id)).toEqual([startedB.body.id]);
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