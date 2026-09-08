import { z } from 'zod';

// ─── Requests ─────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  displayName: z.string().min(1, 'El nombre es requerido').max(255).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export type RegisterPayload = z.infer<typeof registerSchema>;
export type LoginPayload = z.infer<typeof loginSchema>;

// ─── Responses ────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  email: string;
  displayName: string | null;
}

/** Respuesta de `/register` y `/login`: sólo identidad, sin el perfil. */
export interface AuthSession {
  id: number;
  email: string;
}
