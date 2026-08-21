import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../server/index';
import { cleanDb } from './setup';

const REGISTER_URL = '/api/auth/register';

function makeAgent(email: string, password = 'password123') {
  const agent = request.agent(app);
  const setup = () =>
    agent.post(REGISTER_URL).send({ email, password });
  return { agent, setup };
}

const BASE_ROUTINE = {
  name: 'Rutina Push',
  exercises: [],
};

describe('Rutinas', () => {
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;

  // Limpiar DB antes de iniciar cualquier test de este archivo
  // (por si auth.test.ts dejó datos residuales)
  beforeAll(async () => {
    await cleanDb();
  });

  beforeEach(async () => {
    await cleanDb();
    const ts = Date.now();

    const a = makeAgent(`user-a-${ts}@example.com`);
    await a.setup();
    agentA = a.agent;

    const b = makeAgent(`user-b-${ts}@example.com`);
    await b.setup();
    agentB = b.agent;
  });

  // ── Crear rutina ──────────────────────────────────────────────────────────

  describe('POST /api/routines', () => {
    it('crea una rutina y la retorna con estructura completa', async () => {
      const res = await agentA.post('/api/routines').send({ name: 'Push A' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Push A');
      expect(res.body.id).toBeDefined();
      expect(Array.isArray(res.body.exercises)).toBe(true);
    });

    it('requiere nombre', async () => {
      const res = await agentA.post('/api/routines').send({ name: '' });
      expect(res.status).toBe(400);
    });
  });

  // ── Listar rutinas ────────────────────────────────────────────────────────

  describe('GET /api/routines', () => {
    it('retorna las rutinas del usuario', async () => {
      await agentA.post('/api/routines').send({ name: 'Push A' });
      await agentA.post('/api/routines').send({ name: 'Pull A' });

      const res = await agentA.get('/api/routines');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    it('no retorna rutinas de otros usuarios (aislamiento)', async () => {
      await agentA.post('/api/routines').send({ name: 'Solo de A' });

      const res = await agentB.get('/api/routines');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(0);
    });
  });

  // ── Obtener rutina ────────────────────────────────────────────────────────

  describe('GET /api/routines/:id', () => {
    it('retorna la rutina propia', async () => {
      const created = await agentA.post('/api/routines').send({ name: 'Legs' });
      const res = await agentA.get(`/api/routines/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Legs');
    });

    it('retorna 404 si intenta acceder a rutina de otro usuario', async () => {
      const created = await agentA.post('/api/routines').send({ name: 'Privada de A' });
      const res = await agentB.get(`/api/routines/${created.body.id}`);
      expect(res.status).toBe(404);
    });

    it('retorna 404 para ID inexistente', async () => {
      const res = await agentA.get('/api/routines/999999');
      expect(res.status).toBe(404);
    });
  });

  // ── Editar rutina ─────────────────────────────────────────────────────────

  describe('PUT /api/routines/:id', () => {
    let routineId: number;
    let exerciseId: number;

    beforeEach(async () => {
      const r = await agentA.post('/api/routines').send({ name: 'Original' });
      routineId = r.body.id;

      // Obtener un ejercicio del catálogo
      const exRes = await agentA.get('/api/exercises');
      exerciseId = exRes.body[0].id;
    });

    it('actualiza el nombre de la rutina', async () => {
      const res = await agentA
        .put(`/api/routines/${routineId}`)
        .send({ name: 'Modificada', exercises: [] });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Modificada');
    });

    it('agrega ejercicios con series a la rutina', async () => {
      const res = await agentA
        .put(`/api/routines/${routineId}`)
        .send({
          name: 'Original',
          exercises: [
            {
              exerciseId,
              position: 0,
              sets: [
                { setNumber: 1, weight: 80, reps: 8, rir: 2 },
                { setNumber: 2, weight: 80, reps: 8, rir: 2 },
                { setNumber: 3, weight: 77.5, reps: 10, rir: 1 },
              ],
            },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.exercises.length).toBe(1);
      expect(res.body.exercises[0].sets.length).toBe(3);
      expect(parseFloat(res.body.exercises[0].sets[0].weight)).toBe(80);
      expect(res.body.exercises[0].sets[0].reps).toBe(8);
      expect(res.body.exercises[0].sets[0].rir).toBe(2);
    });

    it('agrega y elimina series al editar', async () => {
      // Crear con 3 series
      const first = await agentA.put(`/api/routines/${routineId}`).send({
        name: 'Original',
        exercises: [
          {
            exerciseId,
            position: 0,
            sets: [
              { setNumber: 1, weight: 80, reps: 8, rir: null },
              { setNumber: 2, weight: 80, reps: 8, rir: null },
              { setNumber: 3, weight: 80, reps: 8, rir: null },
            ],
          },
        ],
      });

      const reId = first.body.exercises[0].id;
      const setIds = first.body.exercises[0].sets.map((s: any) => s.id);

      // Actualizar con solo 2 series (eliminar la tercera)
      const res = await agentA.put(`/api/routines/${routineId}`).send({
        name: 'Original',
        exercises: [
          {
            id: reId,
            exerciseId,
            position: 0,
            sets: [
              { id: setIds[0], setNumber: 1, weight: 85, reps: 6, rir: 1 },
              { id: setIds[1], setNumber: 2, weight: 85, reps: 6, rir: 1 },
            ],
          },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.exercises[0].sets.length).toBe(2);
      expect(parseFloat(res.body.exercises[0].sets[0].weight)).toBe(85);
    });

    it('no permite editar rutina de otro usuario', async () => {
      const res = await agentB
        .put(`/api/routines/${routineId}`)
        .send({ name: 'Hackeada', exercises: [] });
      expect(res.status).toBe(404);
    });
  });

  // ── Duplicar rutina ───────────────────────────────────────────────────────

  describe('POST /api/routines/:id/duplicate', () => {
    it('duplica la rutina con sus ejercicios y series', async () => {
      const exRes = await agentA.get('/api/exercises');
      const exerciseId = exRes.body[0].id;

      const r = await agentA.post('/api/routines').send({ name: 'Original' });
      await agentA.put(`/api/routines/${r.body.id}`).send({
        name: 'Original',
        exercises: [
          {
            exerciseId,
            position: 0,
            sets: [{ setNumber: 1, weight: 100, reps: 5, rir: null }],
          },
        ],
      });

      const dup = await agentA.post(`/api/routines/${r.body.id}/duplicate`);
      expect(dup.status).toBe(201);
      expect(dup.body.name).toBe('Original (copia)');
      expect(dup.body.id).not.toBe(r.body.id);
      expect(dup.body.exercises.length).toBe(1);
      expect(dup.body.exercises[0].sets.length).toBe(1);
    });

    it('no permite duplicar rutina de otro usuario', async () => {
      const r = await agentA.post('/api/routines').send({ name: 'Privada' });
      const res = await agentB.post(`/api/routines/${r.body.id}/duplicate`);
      expect(res.status).toBe(404);
    });
  });

  // ── Archivar rutina ───────────────────────────────────────────────────────

  describe('PATCH /api/routines/:id/archive', () => {
    it('archiva una rutina activa', async () => {
      const r = await agentA.post('/api/routines').send({ name: 'Test' });
      const res = await agentA.patch(`/api/routines/${r.body.id}/archive`);
      expect(res.status).toBe(200);
      expect(res.body.archivedAt).not.toBeNull();
    });

    it('desarchiva una rutina archivada (toggle)', async () => {
      const r = await agentA.post('/api/routines').send({ name: 'Test' });
      await agentA.patch(`/api/routines/${r.body.id}/archive`);
      const res = await agentA.patch(`/api/routines/${r.body.id}/archive`);
      expect(res.status).toBe(200);
      expect(res.body.archivedAt).toBeNull();
    });

    it('no permite archivar rutina de otro usuario', async () => {
      const r = await agentA.post('/api/routines').send({ name: 'Privada' });
      const res = await agentB.patch(`/api/routines/${r.body.id}/archive`);
      expect(res.status).toBe(404);
    });
  });

  // ── Ejercicios ────────────────────────────────────────────────────────────

  describe('Ejercicios y catálogo', () => {
    it('GET /api/exercises retorna ejercicios globales', async () => {
      const res = await agentA.get('/api/exercises');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('POST /api/exercises crea ejercicio personalizado', async () => {
      const groupRes = await request(app).get('/api/muscle-groups');
      const groupId = groupRes.body[0].id;

      const res = await agentA.post('/api/exercises').send({
        name: 'Curl especial personalizado',
        muscleGroupId: groupId,
        isBodyweight: false,
      });
      expect(res.status).toBe(201);
      expect(res.body.isCustom).toBe(true);
      expect(res.body.name).toBe('Curl especial personalizado');
    });

    it('ejercicio personalizado de A no aparece para B', async () => {
      const groupRes = await request(app).get('/api/muscle-groups');
      const groupId = groupRes.body[0].id;

      await agentA.post('/api/exercises').send({
        name: 'Mi ejercicio secreto',
        muscleGroupId: groupId,
        isBodyweight: false,
      });

      const resB = await agentB.get('/api/exercises');
      const found = resB.body.find((e: any) => e.name === 'Mi ejercicio secreto');
      expect(found).toBeUndefined();
    });
  });

  // ── Aislamiento de datos ──────────────────────────────────────────────────

  describe('Aislamiento entre usuarios', () => {
    it('usuario B no puede modificar rutinas de usuario A con ID manipulado', async () => {
      const r = await agentA.post('/api/routines').send({ name: 'Solo de A' });
      const id = r.body.id;

      // B intenta editar
      const edit = await agentB.put(`/api/routines/${id}`).send({
        name: 'Rutina robada',
        exercises: [],
      });
      expect(edit.status).toBe(404);

      // B intenta eliminar
      const del = await agentB.delete(`/api/routines/${id}`);
      expect(del.status).toBe(404);

      // B intenta duplicar
      const dup = await agentB.post(`/api/routines/${id}/duplicate`);
      expect(dup.status).toBe(404);

      // B intenta archivar
      const arch = await agentB.patch(`/api/routines/${id}/archive`);
      expect(arch.status).toBe(404);
    });

    it('la rutina original de A queda intacta tras los intentos de B', async () => {
      const r = await agentA.post('/api/routines').send({ name: 'Intacta' });
      const id = r.body.id;

      // B intenta atacar
      await agentB.put(`/api/routines/${id}`).send({ name: 'Modificada', exercises: [] });

      // A puede leerla y sigue siendo la original
      const check = await agentA.get(`/api/routines/${id}`);
      expect(check.status).toBe(200);
      expect(check.body.name).toBe('Intacta');
    });
  });
});
