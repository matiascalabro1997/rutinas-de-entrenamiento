import type {
  AuthSession,
  AuthUser,
  CreateExercisePayload,
  Exercise,
  MuscleGroup,
  RoutineFull,
  RoutineSummary,
  UpsertRoutinePayload,
  UpsertWorkoutPayload,
  WorkoutFull,
  WorkoutSaveResult,
} from '@rutinas/shared';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Error de red' }));
    const error = new Error(body.error ?? `HTTP ${res.status}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    me: () => request<AuthUser>('/api/auth/me'),
    login: (email: string, password: string) =>
      request<AuthSession>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (email: string, password: string, displayName?: string) =>
      request<AuthSession>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName }),
      }),
    logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  },

  muscleGroups: {
    list: () => request<MuscleGroup[]>('/api/muscle-groups'),
  },

  exercises: {
    list: () => request<Exercise[]>('/api/exercises'),
    create: (data: CreateExercisePayload) =>
      request<Exercise>('/api/exercises', { method: 'POST', body: JSON.stringify(data) }),
  },

  routines: {
    list: () => request<RoutineSummary[]>('/api/routines'),
    get: (id: number) => request<RoutineFull>(`/api/routines/${id}`),
    create: (data: { name: string }) =>
      request<RoutineFull>('/api/routines', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: UpsertRoutinePayload) =>
      request<RoutineFull>(`/api/routines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    duplicate: (id: number) =>
      request<RoutineFull>(`/api/routines/${id}/duplicate`, { method: 'POST' }),
    archive: (id: number) =>
      request<RoutineSummary>(`/api/routines/${id}/archive`, { method: 'PATCH' }),
    delete: (id: number) =>
      request<{ ok: boolean }>(`/api/routines/${id}`, { method: 'DELETE' }),
  },

  workouts: {
    start: (routineId: number) =>
      request<WorkoutFull>('/api/workouts', {
        method: 'POST',
        body: JSON.stringify({ routineId }),
      }),
    inProgress: () => request<WorkoutFull[]>('/api/workouts/active'),
    get: (id: number) => request<WorkoutFull>(`/api/workouts/${id}`),
    update: (id: number, data: UpsertWorkoutPayload) =>
      request<WorkoutSaveResult>(`/api/workouts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    pause: (id: number) =>
      request<WorkoutFull>(`/api/workouts/${id}/pause`, { method: 'POST' }),
    resume: (id: number) =>
      request<WorkoutFull>(`/api/workouts/${id}/resume`, { method: 'POST' }),
    finish: (id: number) => request<WorkoutFull>(`/api/workouts/${id}/complete`, { method: 'POST' }),
  },
};

// ─── Contrato ────────────────────────────────────────────────────────────────
// Los tipos viven en @rutinas/shared, al lado de los schemas zod con los que la
// API valida cada payload. Se re-exportan acá para que las páginas sigan
// importando desde './lib/api' sin conocer el paquete compartido.

export type {
  AuthSession,
  AuthUser,
  CreateExercisePayload,
  Exercise,
  MuscleGroup,
  RoutineExerciseFull,
  RoutineFull,
  RoutineSet,
  RoutineSummary,
  TimerStatus,
  UpsertRoutineExercisePayload,
  UpsertRoutinePayload,
  UpsertRoutineSetPayload,
  UpsertWorkoutExercisePayload,
  UpsertWorkoutPayload,
  UpsertWorkoutSetPayload,
  WorkoutExerciseFull,
  WorkoutFull,
  WorkoutSaveResult,
  WorkoutSet,
  WorkoutSetIdMapping,
  WorkoutStatus,
} from '@rutinas/shared';
