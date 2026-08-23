import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  UpsertWorkoutExercisePayload,
  WorkoutExerciseFull,
  WorkoutSaveResult,
} from '../lib/api';
import NumericInput from '../components/NumericInput';

type LocalSet = {
  id?: number;
  clientId?: string;
  setNumber: number;
  weight: number;
  reps: number;
  rir: number | null;
};

type LocalExercise = {
  id: number;
  exerciseName: string;
  muscleGroupName?: string;
  isBodyweight: boolean;
  sets: LocalSet[];
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function parseExercise(exercise: WorkoutExerciseFull): LocalExercise {
  return {
    id: exercise.id,
    exerciseName: exercise.exerciseName,
    muscleGroupName: exercise.muscleGroupName,
    isBodyweight: exercise.isBodyweight,
    sets: exercise.sets.map((set) => ({
      id: set.id,
      setNumber: set.setNumber,
      weight: Number(set.weight) || 0,
      reps: set.reps,
      rir: set.rir,
    })),
  };
}

function payloadFrom(exercises: LocalExercise[]): UpsertWorkoutExercisePayload[] {
  return exercises.map((exercise) => ({
    id: exercise.id,
    sets: exercise.sets.map((set) => ({
      id: set.id,
      clientId: set.clientId,
      setNumber: set.setNumber,
      weight: set.weight,
      reps: set.reps,
      rir: set.rir,
    })),
  }));
}

function patchIds(current: LocalExercise[], result: WorkoutSaveResult) {
  const createdIds = new Map(result.setIdMappings.map((mapping) => [mapping.clientId, mapping.id]));
  return current.map((exercise) => {
    return {
      ...exercise,
      sets: exercise.sets.map((set) => ({
        ...set,
        id: set.id ?? (set.clientId ? createdIds.get(set.clientId) : undefined),
      })),
    };
  });
}

function Status({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === 'saving') return <span className="text-xs font-medium text-gray-400">Guardando</span>;
  if (status === 'saved') return <span className="text-xs font-medium text-green-700">Guardado</span>;
  if (status === 'error') return <span className="text-xs font-medium text-red-600">{error ?? 'No se pudo guardar'}</span>;
  return <span className="text-xs font-medium text-gray-400">Sin cambios</span>;
}

export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workoutId = Number(id);
  const [exercises, setExercises] = useState<LocalExercise[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const exercisesRef = useRef<LocalExercise[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const saveRef = useRef<() => Promise<void>>(async () => undefined);
  const initializedIdRef = useRef<number | null>(null);
  const changeRevisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const workoutVersionRef = useRef(1);

  const workoutQuery = useQuery({
    queryKey: ['workouts', workoutId],
    queryFn: () => api.workouts.get(workoutId),
    enabled: Number.isFinite(workoutId),
  });

  useEffect(() => {
    if (workoutQuery.data && initializedIdRef.current !== workoutId) {
      const local = workoutQuery.data.exercises.map(parseExercise);
      initializedIdRef.current = workoutId;
      workoutVersionRef.current = workoutQuery.data.version;
      exercisesRef.current = local;
      setExercises(local);
      setInitialized(true);
    }
  }, [workoutQuery.data, workoutId]);

  const save = useCallback(async () => {
    if (!initialized) return;
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }
    savingRef.current = true;
    const savingRevision = changeRevisionRef.current;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const updated = await api.workouts.update(workoutId, {
        version: workoutVersionRef.current,
        exercises: payloadFrom(exercisesRef.current),
      });
      const patched = patchIds(exercisesRef.current, updated);
      exercisesRef.current = patched;
      setExercises(patched);
      workoutVersionRef.current = updated.version;
      savedRevisionRef.current = savingRevision;
      if (changeRevisionRef.current === savingRevision) {
        setSaveStatus('saved');
      } else {
        queuedRef.current = true;
        setSaveStatus('saving');
      }
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        try {
          const refreshed = await api.workouts.get(workoutId);
          queryClient.setQueryData(['workouts', workoutId], refreshed);
          if (refreshed.status !== 'in_progress') {
            savedRevisionRef.current = changeRevisionRef.current;
            setSaveError('Este entrenamiento fue finalizado en otra sesión.');
            setSaveStatus('error');
            return;
          }
          const local = refreshed.exercises.map(parseExercise);
          exercisesRef.current = local;
          setExercises(local);
          workoutVersionRef.current = refreshed.version;
          changeRevisionRef.current = 0;
          savedRevisionRef.current = 0;
          setSaveError('Hubo cambios en otra sesión. Se recargó el entrenamiento; aplicá tus cambios de nuevo.');
        } catch {
          setSaveError('El entrenamiento cambió en otra sesión. Recargá para continuar.');
        }
      } else {
        setSaveError(error instanceof Error ? error.message : 'No se pudo guardar');
      }
      setSaveStatus('error');
      throw error;
    } finally {
      savingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void saveRef.current().catch(() => undefined);
      }
    }
  }, [initialized, queryClient, workoutId]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const scheduleSave = useCallback(() => {
    if (!initialized) return;
    setSaveStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void saveRef.current().catch(() => undefined);
    }, 650);
  }, [initialized]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  async function flushSave() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // A save may have started just before the finish tap. Wait for it and
    // then drain the queued pass so the server receives the latest edit.
    while (savingRef.current || queuedRef.current) {
      if (!savingRef.current && queuedRef.current) {
        queuedRef.current = false;
        await saveRef.current();
      } else {
        await new Promise<void>((resolve) => setTimeout(resolve, 30));
      }
    }
    if (initialized && changeRevisionRef.current !== savedRevisionRef.current) {
      await saveRef.current();
    }
  }

  useEffect(() => {
    function saveBeforePageExit() {
      if (
        !initialized ||
        changeRevisionRef.current === savedRevisionRef.current ||
        !Number.isFinite(workoutId)
      ) {
        return;
      }

      // `pagehide` cannot await work. keepalive gives the browser a best-effort
      // chance to deliver the latest snapshot when the tab or app is closed.
      void fetch(`/api/workouts/${workoutId}`, {
        method: 'PUT',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: workoutVersionRef.current,
          exercises: payloadFrom(exercisesRef.current),
        }),
      });
    }

    window.addEventListener('pagehide', saveBeforePageExit);
    return () => window.removeEventListener('pagehide', saveBeforePageExit);
  }, [initialized, workoutId]);

  function updateExercise(index: number, next: LocalExercise) {
    const updated = exercisesRef.current.map((exercise, i) => (i === index ? next : exercise));
    changeRevisionRef.current += 1;
    exercisesRef.current = updated;
    setExercises(updated);
    scheduleSave();
  }

  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<LocalSet>) {
    const exercise = exercisesRef.current[exerciseIndex];
    if (!exercise) return;
    updateExercise(exerciseIndex, {
      ...exercise,
      sets: exercise.sets.map((set, i) => (i === setIndex ? { ...set, ...patch } : set)),
    });
  }

  function addSet(index: number) {
    const exercise = exercisesRef.current[index];
    if (!exercise) return;
    const previous = exercise.sets[exercise.sets.length - 1];
    updateExercise(index, {
      ...exercise,
      sets: [
        ...exercise.sets,
        {
          setNumber: exercise.sets.length + 1,
          clientId: crypto.randomUUID(),
          weight: previous?.weight ?? 0,
          reps: previous?.reps ?? 0,
          rir: previous?.rir ?? null,
        },
      ],
    });
  }

  function removeSet(exerciseIndex: number, setIndex: number) {
    const exercise = exercisesRef.current[exerciseIndex];
    if (!exercise || exercise.sets.length <= 1) return;
    updateExercise(exerciseIndex, {
      ...exercise,
      sets: exercise.sets.filter((_, i) => i !== setIndex).map((set, i) => ({ ...set, setNumber: i + 1 })),
    });
  }

  async function finishWorkout() {
    if (isFinishing) return;
    setFinishError(null);
    setIsFinishing(true);
    try {
      await flushSave();
      await api.workouts.finish(workoutId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workouts', 'in-progress'] }),
        queryClient.invalidateQueries({ queryKey: ['workouts', workoutId] }),
      ]);
      navigate('/routines');
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        try {
          const refreshed = await api.workouts.get(workoutId);
          queryClient.setQueryData(['workouts', workoutId], refreshed);
          if (refreshed.status !== 'in_progress') {
            setFinishError('Este entrenamiento fue finalizado en otra sesión.');
            return;
          }
        } catch {
          // Conserva el mensaje original si no se puede confirmar el estado remoto.
        }
      }
      setFinishError(error instanceof Error ? error.message : 'No se pudo finalizar el entrenamiento');
    } finally {
      setIsFinishing(false);
    }
  }

  async function leaveWorkout() {
    if (isLeaving || isFinishing) return;
    setFinishError(null);
    setIsLeaving(true);
    try {
      await flushSave();
      navigate('/routines');
    } catch (error) {
      setFinishError(
        error instanceof Error
          ? `No se pudo guardar antes de volver: ${error.message}`
          : 'No se pudo guardar antes de volver. Intentá nuevamente.',
      );
    } finally {
      setIsLeaving(false);
    }
  }

  if (workoutQuery.isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-6">
        <div className="mx-auto max-w-lg space-y-4 animate-pulse">
          <div className="h-8 w-2/3 rounded-lg bg-gray-200" />
          <div className="h-40 rounded-2xl bg-gray-200" />
          <div className="h-52 rounded-2xl bg-gray-200" />
        </div>
      </main>
    );
  }

  if (workoutQuery.isError || !workoutQuery.data) {
    return (
      <main className="min-h-screen bg-gray-50 px-5 py-16">
        <div className="mx-auto max-w-sm rounded-2xl border border-red-100 bg-white p-6 text-center shadow-sm">
          <p className="font-semibold text-gray-900">No se pudo abrir el entrenamiento</p>
          <p className="mt-2 text-sm text-gray-500">Comprueba tu conexión e inténtalo de nuevo.</p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" onClick={() => workoutQuery.refetch()} className="btn-primary">Reintentar</button>
            <button type="button" onClick={() => navigate('/routines')} className="btn-secondary">Rutinas</button>
          </div>
        </div>
      </main>
    );
  }

  const workout = workoutQuery.data;
  if (workout.status !== 'in_progress') {
    return (
      <main className="min-h-screen bg-gray-50 px-5 py-16">
        <div className="mx-auto max-w-sm rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
          <p className="font-semibold text-gray-900">Este entrenamiento ya fue finalizado</p>
          <p className="mt-2 text-sm text-gray-500">Las series quedaron guardadas y no pueden editarse.</p>
          <button type="button" onClick={() => navigate('/routines')} className="btn-primary mt-5">
            Volver a rutinas
          </button>
        </div>
      </main>
    );
  }
  const title = 'name' in workout && workout.name ? workout.name : 'Entrenamiento activo';
  const totalSets = exercises.reduce((total, exercise) => total + exercise.sets.length, 0);

  return (
    <main className="min-h-screen bg-gray-50 pb-28">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <button type="button" onClick={leaveWorkout} disabled={isLeaving || isFinishing} className="btn-ghost -ml-2 px-2 text-sm disabled:opacity-50">
            {isLeaving ? 'Guardando…' : 'Volver'}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Sesión en curso</p>
            <h1 className="truncate text-lg font-bold text-gray-900">{title}</h1>
          </div>
          <Status status={saveStatus} error={saveError} />
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 pt-5">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-sm text-gray-500">{exercises.length} {exercises.length === 1 ? 'ejercicio' : 'ejercicios'}</p>
            <p className="mt-1 text-xs text-gray-400">{totalSets} series registradas</p>
          </div>
          <div className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">Entrenando</div>
        </div>

        <div className="space-y-4">
          {exercises.map((exercise, exerciseIndex) => (
            <section key={exercise.id} className="card overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Ejercicio {exerciseIndex + 1}</p>
                <h2 className="mt-1 text-lg font-bold text-gray-900">{exercise.exerciseName}</h2>
                {exercise.muscleGroupName && <p className="mt-0.5 text-xs text-gray-500">{exercise.muscleGroupName}</p>}
              </div>
              <div className="px-3">
                <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1.5rem] items-center gap-2 border-b border-gray-100 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  <span>Serie</span><span className="text-center">{exercise.isBodyweight ? 'Carga' : 'Peso'}</span><span className="text-center">Reps</span><span className="text-center">RIR</span><span />
                </div>
                {exercise.sets.map((set, setIndex) => (
                  <div key={set.id ?? set.clientId ?? `new-${setIndex}`} className="grid grid-cols-[2rem_1fr_1fr_1fr_1.5rem] items-center gap-2 border-b border-gray-50 py-3 last:border-0">
                    <span className="text-center text-sm font-bold text-gray-400">{set.setNumber}</span>
                    <div className="flex justify-center">
                      {exercise.isBodyweight ? <span className="text-xs font-medium text-gray-400">Peso corporal</span> : <NumericInput value={set.weight} onChange={(value) => updateSet(exerciseIndex, setIndex, { weight: value })} step={2.5} decimals={1} max={999.5} />}
                    </div>
                    <div className="flex justify-center"><NumericInput value={set.reps} onChange={(value) => updateSet(exerciseIndex, setIndex, { reps: value })} max={999} /></div>
                    <div className="flex justify-center"><NumericInput value={set.rir ?? 0} onChange={(value) => updateSet(exerciseIndex, setIndex, { rir: value })} max={10} /></div>
                    <button type="button" onClick={() => removeSet(exerciseIndex, setIndex)} disabled={exercise.sets.length <= 1} className="text-lg text-gray-300 transition-colors active:text-red-500 disabled:opacity-20" aria-label={`Eliminar serie ${set.setNumber}`}>×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addSet(exerciseIndex)} className="w-full border-t border-gray-100 px-4 py-3 text-sm font-semibold text-brand-700 active:bg-brand-50">+ Añadir serie</button>
            </section>
          ))}
        </div>

        {finishError && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{finishError}</p>}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-gray-50/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <button type="button" onClick={finishWorkout} disabled={isFinishing} className="btn-primary w-full py-3.5">
            {isFinishing ? 'Finalizando…' : 'Finalizar entrenamiento'}
          </button>
          {saveStatus === 'error' && <button type="button" onClick={() => void saveRef.current()} className="mt-2 w-full text-center text-xs font-semibold text-red-600">Reintentar guardado</button>}
        </div>
      </div>
    </main>
  );
}