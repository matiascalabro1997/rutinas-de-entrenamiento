import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  RoutineFull,
  RoutineExerciseFull,
  UpsertRoutineExercisePayload,
  UpsertRoutinePayload,
  Exercise,
} from '../lib/api';
import ExerciseCard from '../components/ExerciseCard';
import ExercisePicker from '../components/ExercisePicker';

type LocalExercise = UpsertRoutineExercisePayload & {
  exerciseName: string;
  muscleGroupName: string;
  isBodyweight: boolean;
};

function routineToLocal(routine: RoutineFull): { name: string; exercises: LocalExercise[] } {
  return {
    name: routine.name,
    exercises: routine.exercises.map((re) => ({
      id: re.id,
      exerciseId: re.exerciseId,
      position: re.position,
      exerciseName: re.exerciseName,
      muscleGroupName: re.muscleGroupName,
      isBodyweight: re.isBodyweight,
      sets: re.sets.map((s) => ({
        id: s.id,
        setNumber: s.setNumber,
        weight: parseFloat(s.weight),
        reps: s.reps,
        rir: s.rir,
      })),
    })),
  };
}

/**
 * Tras cada save, sólo incorporamos los IDs asignados por el servidor para
 * ejercicios/series nuevos. NO sobreescribimos posiciones ni orden, para evitar
 * que el estado local "salte" si el usuario reordenó mientras el save estaba
 * en vuelo.
 */
function patchServerIds(
  prev: LocalExercise[],
  serverExercises: RoutineExerciseFull[],
): LocalExercise[] {
  const serverById = new Map(serverExercises.map((re) => [re.id, re]));

  return prev.map((ex) => {
    if (ex.id !== undefined) {
      // El ejercicio ya tiene ID — sólo parchamos IDs de series nuevas
      const serverEx = serverById.get(ex.id);
      if (!serverEx) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, j) => ({
          ...s,
          id: s.id ?? serverEx.sets[j]?.id,
        })),
      };
    }
    // Ejercicio nuevo — buscamos en la respuesta del servidor por exerciseId
    const serverEx = serverExercises.find((re) => re.exerciseId === ex.exerciseId);
    if (!serverEx) return ex;
    return {
      ...ex,
      id: serverEx.id,
      sets: ex.sets.map((s, j) => ({
        ...s,
        id: s.id ?? serverEx.sets[j]?.id,
      })),
    };
  });
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function RoutineEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const routineId = parseInt(id!, 10);

  const { data: routine, isLoading } = useQuery({
    queryKey: ['routines', routineId],
    queryFn: () => api.routines.get(routineId),
  });

  const [localName, setLocalName] = useState('');
  const [localExercises, setLocalExercises] = useState<LocalExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [initialized, setInitialized] = useState(false);

  // Refs que siempre contienen los valores más recientes para que el save
  // asíncrono nunca trabaje con closures obsoletas.
  const localNameRef = useRef('');
  const localExercisesRef = useRef<LocalExercise[]>([]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  // Si llega una solicitud de save mientras hay uno en vuelo, este flag
  // dispara un reintento inmediato cuando el save actual termina.
  const retryAfterSaveRef = useRef(false);
  // Ref a la función de save para evitar dependencias circulares en useCallback.
  const doSaveRef = useRef<(() => Promise<void>) | null>(null);

  // ── Inicializar estado local cuando llegan los datos del servidor ──────────
  useEffect(() => {
    if (routine && !initialized) {
      const local = routineToLocal(routine);
      localNameRef.current = local.name;
      localExercisesRef.current = local.exercises;
      setLocalName(local.name);
      setLocalExercises(local.exercises);
      setInitialized(true);
    }
  }, [routine, initialized]);

  // ── Lógica de auto-save ───────────────────────────────────────────────────

  /**
   * Ejecuta el save real. Lee siempre desde refs para tener los valores
   * más recientes, independientemente de cuándo se dispara el timeout.
   * Si ya hay un save en vuelo, marca retryAfterSaveRef para reintentar
   * en cuanto termine, en lugar de descartar el save silenciosamente.
   */
  const doSave = useCallback(async () => {
    if (isSavingRef.current) {
      // Habrá un reintento cuando el save en vuelo termine
      retryAfterSaveRef.current = true;
      return;
    }
    isSavingRef.current = true;

    const name = localNameRef.current;
    const exercises = localExercisesRef.current;

    try {
      const payload: UpsertRoutinePayload = {
        name,
        exercises: exercises.map((ex, idx) => ({
          id: ex.id,
          exerciseId: ex.exerciseId,
          position: idx, // posición = índice en el array local
          sets: ex.sets,
        })),
      };

      const updated = await api.routines.update(routineId, payload);

      // Solo incorporamos IDs nuevos del servidor; NO sobreescribimos el orden
      // que el usuario pueda haber cambiado mientras el save estaba en vuelo.
      setLocalExercises((prev) => patchServerIds(prev, updated.exercises));
      queryClient.setQueryData(['routines', routineId], updated);
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    } finally {
      isSavingRef.current = false;
      if (retryAfterSaveRef.current) {
        retryAfterSaveRef.current = false;
        // Reintentamos inmediatamente con los valores más recientes de los refs
        void doSaveRef.current?.();
      }
    }
  }, [routineId, queryClient]);

  // Mantenemos la ref en sync con la última versión del callback
  useEffect(() => {
    doSaveRef.current = doSave;
  }, [doSave]);

  /**
   * Encola un save con debounce de 800 ms.
   * No recibe parámetros: lee los valores desde los refs para evitar stale closures.
   */
  const scheduleSave = useCallback(() => {
    if (!initialized) return;
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void doSaveRef.current?.();
    }, 800);
  }, [initialized]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleNameChange(name: string) {
    localNameRef.current = name;
    setLocalName(name);
    scheduleSave();
  }

  function handleExerciseUpdate(index: number, updated: UpsertRoutineExercisePayload) {
    const newExercises = [...localExercises];
    newExercises[index] = { ...localExercises[index], ...updated };
    localExercisesRef.current = newExercises;
    setLocalExercises(newExercises);
    scheduleSave();
  }

  function handleExerciseRemove(index: number) {
    const newExercises = localExercises
      .filter((_, i) => i !== index)
      .map((ex, i) => ({ ...ex, position: i }));
    localExercisesRef.current = newExercises;
    setLocalExercises(newExercises);
    scheduleSave();
  }

  function moveExercise(from: number, to: number) {
    if (to < 0 || to >= localExercises.length) return;
    const newExercises = [...localExercises];
    [newExercises[from], newExercises[to]] = [newExercises[to], newExercises[from]];
    // Reasignamos position = índice para mantener coherencia
    const repositioned = newExercises.map((ex, i) => ({ ...ex, position: i }));
    localExercisesRef.current = repositioned;
    setLocalExercises(repositioned);
    scheduleSave();
  }

  function handleAddExercise(exercise: Exercise) {
    const newEx: LocalExercise = {
      exerciseId: exercise.id,
      position: localExercises.length,
      exerciseName: exercise.name,
      muscleGroupName: exercise.muscleGroupName,
      isBodyweight: exercise.isBodyweight,
      sets: [
        { setNumber: 1, weight: 0, reps: 10, rir: null },
        { setNumber: 2, weight: 0, reps: 10, rir: null },
        { setNumber: 3, weight: 0, reps: 10, rir: null },
      ],
    };
    const newExercises = [...localExercises, newEx];
    localExercisesRef.current = newExercises;
    setLocalExercises(newExercises);
    scheduleSave();
    setShowPicker(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!routine) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500">
        <p>Rutina no encontrada</p>
        <button onClick={() => navigate('/routines')} className="btn-secondary">
          Volver
        </button>
      </div>
    );
  }

  function SaveIndicator() {
    if (saveStatus === 'saving') return <span className="text-xs text-gray-400">Guardando...</span>;
    if (saveStatus === 'saved') return <span className="text-xs text-green-600">✓ Guardado</span>;
    if (saveStatus === 'error')
      return <span className="text-xs text-red-600">Error al guardar</span>;
    return null;
  }

  return (
    <>
      <div className="min-h-screen pb-32">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/routines')}
                className="text-brand-600 font-medium text-sm flex-shrink-0"
              >
                ← Rutinas
              </button>
              <div className="flex-1 min-w-0">
                <input
                  className="w-full text-lg font-bold text-gray-900 bg-transparent focus:outline-none truncate placeholder-gray-300"
                  value={localName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Nombre de la rutina"
                />
              </div>
              <SaveIndicator />
            </div>
          </div>
        </div>

        {/* Ejercicios */}
        <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
          {localExercises.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-3">💪</div>
              <p className="font-medium text-gray-500">Sin ejercicios</p>
              <p className="text-sm mt-1">Tocá el botón de abajo para agregar ejercicios</p>
            </div>
          ) : (
            localExercises.map((ex, i) => (
              <ExerciseCard
                // La key usa el ID de DB cuando existe, para que React mueva
                // el componente en lugar de desmontarlo/remontarlo en cada swap,
                // preservando el estado collapsed y evitando parpadeos.
                key={ex.id !== undefined ? `re-${ex.id}` : `new-${i}`}
                exercise={ex}
                isFirst={i === 0}
                isLast={i === localExercises.length - 1}
                onUpdate={(updated) => handleExerciseUpdate(i, updated)}
                onRemove={() => handleExerciseRemove(i)}
                onMoveUp={() => moveExercise(i, i - 1)}
                onMoveDown={() => moveExercise(i, i + 1)}
              />
            ))
          )}
        </div>
      </div>

      {/* FAB — Agregar ejercicio */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center z-20 px-4">
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="btn-primary flex items-center gap-2 shadow-lg shadow-brand-600/25 px-6"
        >
          <span className="text-xl font-light">+</span>
          Agregar ejercicio
        </button>
      </div>

      {/* Exercise Picker */}
      {showPicker && (
        <ExercisePicker onSelect={handleAddExercise} onClose={() => setShowPicker(false)} />
      )}
    </>
  );
}
