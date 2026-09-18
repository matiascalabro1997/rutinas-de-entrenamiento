import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { cleanDb } from './setup';

const REGISTER_URL = '/api/auth/register';
const LOGIN_URL = '/api/auth/login';
const LOGOUT_URL = '/api/auth/logout';
const ME_URL = '/api/auth/me';

const TEST_EMAIL = `test-auth-${Date.now()}@example.com`;
const TEST_PASSWORD = 'password123';

describe('Autenticación', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  // ── Registro ──────────────────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('registra un usuario nuevo y devuelve id + email', async () => {
      const res = await request(app)
        .post(REGISTER_URL)
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ email: TEST_EMAIL });
      expect(res.body.id).toBeDefined();
    });

    it('establece la sesión al registrarse', async () => {
      const agent = request.agent(app);
      await agent.post(REGISTER_URL).send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      const me = await agent.get(ME_URL);
      expect(me.status).toBe(200);
      expect(me.body.email).toBe(TEST_EMAIL);
    });

    it('rechaza email duplicado con 409', async () => {
      await request(app).post(REGISTER_URL).send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      const res = await request(app)
        .post(REGISTER_URL)
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      expect(res.status).toBe(409);
    });

    it('rechaza email inválido con 400', async () => {
      const res = await request(app)
        .post(REGISTER_URL)
        .send({ email: 'not-an-email', password: TEST_PASSWORD });
      expect(res.status).toBe(400);
    });

    it('rechaza contraseña corta con 400', async () => {
      const res = await request(app)
        .post(REGISTER_URL)
        .send({ email: TEST_EMAIL, password: '123' });
      expect(res.status).toBe(400);
    });
  });

  // ── Login ─────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post(REGISTER_URL).send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    });

    it('hace login con credenciales correctas', async () => {
      const res = await request(app)
        .post(LOGIN_URL)
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(TEST_EMAIL);
    });

    it('establece la sesión al hacer login', async () => {
      const agent = request.agent(app);
      await agent.post(LOGIN_URL).send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      const me = await agent.get(ME_URL);
      expect(me.status).toBe(200);
    });

    it('rechaza contraseña incorrecta con 401', async () => {
      const res = await request(app)
        .post(LOGIN_URL)
        .send({ email: TEST_EMAIL, password: 'wrongpass' });
      expect(res.status).toBe(401);
    });

    it('rechaza email inexistente con 401', async () => {
      const res = await request(app)
        .post(LOGIN_URL)
        .send({ email: 'nobody@example.com', password: TEST_PASSWORD });
      expect(res.status).toBe(401);
    });
  });

  // ── Logout ────────────────────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('destruye la sesión al hacer logout', async () => {
      const agent = request.agent(app);
      await agent.post(REGISTER_URL).send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      await agent.post(LOGOUT_URL);
      const me = await agent.get(ME_URL);
      expect(me.status).toBe(401);
    });
  });

  // ── GET /me ───────────────────────────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    it('retorna 401 sin sesión', async () => {
      const res = await request(app).get(ME_URL);
      expect(res.status).toBe(401);
    });

    it('retorna el usuario autenticado', async () => {
      const agent = request.agent(app);
      await agent.post(REGISTER_URL).send({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        displayName: 'Tester',
      });
      const me = await agent.get(ME_URL);
      expect(me.status).toBe(200);
      expect(me.body.email).toBe(TEST_EMAIL);
      expect(me.body.displayName).toBe('Tester');
    });
  });

  // ── Autorización ──────────────────────────────────────────────────────────

  describe('Protección de rutas', () => {
    it('GET /api/routines retorna 401 sin autenticación', async () => {
      const res = await request(app).get('/api/routines');
      expect(res.status).toBe(401);
    });

    it('POST /api/routines retorna 401 sin autenticación', async () => {
      const res = await request(app).post('/api/routines').send({ name: 'test' });
      expect(res.status).toBe(401);
    });

    it('GET /api/exercises retorna 401 sin autenticación', async () => {
      const res = await request(app).get('/api/exercises');
      expect(res.status).toBe(401);
    });
  });
});
