import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import path from 'path';
import { pool } from './db/index';
import authRoutes from './routes/auth';
import routinesRoutes from './routes/routines';
import exercisesRoutes from './routes/exercises';

const PgSession = connectPgSimple(session);
const app = express();
const PORT = process.env.SERVER_PORT || 3001;
const IS_TEST = process.env.NODE_ENV === 'test';

// ─── Middlewares ──────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: true,
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
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // el proxy de Replit no propaga HTTPS en dev
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
    },
  }),
);

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/routines', routinesRoutes);
app.use('/api', exercisesRoutes);

// ─── Serve frontend in production ─────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 API server running on port ${PORT}`);
  });
}

export default app;
