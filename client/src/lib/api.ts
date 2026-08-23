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
    me: () => request<{ id: number; email: string; displayName: string | null }>('/api/auth/me'),
    login: (email: string, password: string) =>
      request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (email: string, password: string, displayName?: string) =>
      request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName }),
      }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
  },

  muscleGroups: {
    list: () => request<MuscleGroup[]>('/api/muscle-groups'),
  },

  exercises: {
    list: () => request<Exercise[]>('/api/exercises'),
    create: (data: { name: string; muscleGroupId: number; isBodyweight: boolean }) =>
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
    active: () => request<WorkoutFull | null>('/api/workouts/active'),
    get: (id: number) => request<WorkoutFull>(`/api/workouts/${id}`),
    update: (id: number, data: UpsertWorkoutPayload) =>
      request<WorkoutSaveResult>(`/api/workouts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    finish: (id: number) => request<WorkoutFull>(`/api/workouts/${id}/complete`, { method: 'POST' }),
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MuscleGroup {
  id: number;
  name: string;
}

export interface Exercise {
  id: number;
  name: string;
  muscleGroupId: number;
  muscleGroupName: string;
  isBodyweight: boolean;
  isCustom: boolean;
}

export interface RoutineSummary {
  id: number;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  exerciseCount: number;
}

export interface RoutineSet {
  id: number;
  setNumber: number;
  weight: string;
  reps: number;
  rir: number | null;
}

export interface RoutineExerciseFull {
  id: number;
  routineId: number;
  exerciseId: number;
  exerciseName: string;
  muscleGroupId: number;
  muscleGroupName: string;
  isBodyweight: boolean;
  position: number;
  sets: RoutineSet[];
}

export interface RoutineFull {
  id: number;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  exercises: RoutineExerciseFull[];
}

export interface UpsertSetPayload {
  id?: number;
  setNumber: number;
  weight: number;
  reps: number;
  rir: number | null;
}

export interface UpsertExercisePayload {
  id?: number;
  exerciseId: number;
  position: number;
  sets: UpsertSetPayload[];
}

export interface UpsertRoutinePayload {
  name: string;
  exercises: UpsertExercisePayload[];
}

export interface WorkoutSet {
  id: number;
  setNumber: number;
  weight: string;
  reps: number;
  rir: number | null;
}

export interface WorkoutExerciseFull {
  id: number;
  workoutId: number;
  exerciseId: number | null;
  exerciseName: string;
  muscleGroupName: string;
  isBodyweight: boolean;
  position: number;
  sets: WorkoutSet[];
}

export interface WorkoutFull {
  id: number;
  routineId: number | null;
  name: string;
  status: 'in_progress' | 'completed';
  version: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  exercises: WorkoutExerciseFull[];
  setIdMappings?: WorkoutSetIdMapping[];
}

export interface WorkoutSetIdMapping {
  clientId: string;
  id: number;
}

export interface WorkoutSaveResult {
  version: number;
  setIdMappings: WorkoutSetIdMapping[];
}

export interface UpsertWorkoutSetPayload {
  id?: number;
  clientId?: string;
  setNumber: number;
  weight: number;
  reps: number;
  rir: number | null;
}

export interface UpsertWorkoutExercisePayload {
  id: number;
  sets: UpsertWorkoutSetPayload[];
}

export interface UpsertWorkoutPayload {
  version: number;
  exercises: UpsertWorkoutExercisePayload[];
}
