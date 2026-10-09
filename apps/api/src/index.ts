import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import path from 'path';
import { pool } from './db/index';
import authRoutes from './routes/auth';
import routinesRoutes from './routes/routines';
import exercisesRoutes from './routes/exercises';
import workoutsRoutes from './routes/workouts';

const PgSession = connectPgSimple(session);
const app = express();
// PORT lo inyectan los servicios de hosting y manda sobre todo lo demás; sin
// leerlo, el deploy falla con "no se detectaron puertos abiertos".
// SERVER_PORT queda para desarrollo local.
const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;
const IS_TEST = process.env.NODE_ENV === 'test';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─── Configuración de sesión ──────────────────────────────────────────────────

const SESSION_SECRET = process.env.SESSION_SECRET;
if (IS_PRODUCTION && !SESSION_SECRET) {
  throw new Error(
    '[server] SESSION_SECRET es obligatorio en producción. Sin él, las cookies de ' +
      'sesión se firman con una clave pública y cualquiera puede falsificarlas.',
  );
}

// Detrás de un proxy (Replit, Fly, Render, nginx) Express necesita confiar en
// X-Forwarded-Proto para que las cookies `secure` se envíen realmente.
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// ─── Middlewares ──────────────────────────────────────────────────────────────

// En producción sólo se aceptan los orígenes declarados. `origin: true` refleja
// cualquier origen que pida, y combinado con `credentials` deja que cualquier
// sitio haga peticiones autenticadas en nombre del usuario.
const allowedOrigins = process.env.CORS_ORIGINS?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: IS_PRODUCTION ? (allowedOrigins ?? false) : true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(
  session({
    // En tests usamos MemoryStore para evitar la race condition de la tabla session.
    // En producción/dev usamos connect-pg-simple para sesiones persistentes.
    store: IS_TEST
      ? new session.MemoryStore()
      : new PgSession({ pool, createTableIfMissing: true }),
    secret: SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: IS_PRODUCTION,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
    },
  }),
);

// ─── API Routes ───────────────────────────────────────────────────────────────

// GET /api/health — lo consultan los servicios de hosting para saber si la
// instancia está viva. Toca la base a propósito: un proceso que responde pero
// no llega a PostgreSQL no sirve de nada, y conviene que el host lo note.
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ok', database: 'ok' });
  } catch (error) {
    console.error('health check error:', error);
    return res.status(503).json({ status: 'degraded', database: 'error' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/routines', routinesRoutes);
app.use('/api/workouts', workoutsRoutes);
app.use('/api', exercisesRoutes);

// ─── Serve frontend in production ─────────────────────────────────────────────

if (IS_PRODUCTION) {
  // Desde apps/api/dist/index.js hasta el build de Vite en apps/web/dist.
  const distPath = process.env.WEB_DIST_PATH ?? path.join(__dirname, '..', '..', 'web', 'dist');

  app.use(express.static(distPath));

  // Express 5 usa path-to-regexp v8, donde '*' dejó de ser un patrón válido y
  // el comodín tiene que ir nombrado. Con el '*' anterior el server ni siquiera
  // arrancaba en producción.
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

if (!IS_TEST) {
  app.listen(PORT, () => {
    console.log(`🚀 API server running on port ${PORT}`);
  });
}

export default app;
