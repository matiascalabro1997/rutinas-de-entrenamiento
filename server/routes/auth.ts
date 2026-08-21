import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/index';
import { users, userProfiles } from '../db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

const registerSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  displayName: z.string().min(1, 'El nombre es requerido').max(255).optional(),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
    }
    const { email, password, displayName } = parsed.data;

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let newUser: typeof users.$inferSelect;
    await db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values({ email, passwordHash }).returning();
      await tx.insert(userProfiles).values({
        userId: u.id,
        displayName: displayName ?? email.split('@')[0],
      });
      newUser = u;
    });

    req.session.userId = newUser!.id;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );
    return res.status(201).json({ id: newUser!.id, email: newUser!.email });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    const { email, password } = parsed.data;

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );
    return res.json({ id: user.id, email: user.email });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Error al cerrar sesión' });
    }
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: userProfiles.displayName,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, req.session.userId))
      .limit(1);

    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    return res.json(user);
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
