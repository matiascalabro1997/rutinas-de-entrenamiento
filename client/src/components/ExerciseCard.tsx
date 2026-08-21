import React, { useState } from 'react';
import SetRow from './SetRow';
import { UpsertExercisePayload, UpsertSetPayload } from '../lib/api';

interface ExerciseCardProps {
  exercise: UpsertExercisePayload & {
    exerciseName: string;
    muscleGroupName: string;
    isBodyweight: boolean;
  };
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (updated: UpsertExercisePayload) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export default function ExerciseCard({
  exercise,
  isFirst,
  isLast,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: ExerciseCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  function updateSet(index: number, updated: UpsertSetPayload) {
    const newSets = [...exercise.sets];
    newSets[index] = updated;
    onUpdate({ ...exercise, sets: newSets });
  }

  function removeSet(index: number) {
    const newSets = exercise.sets.filter((_, i) => i !== index);
    // Renumerar
    const renumbered = newSets.map((s, i) => ({ ...s, setNumber: i + 1 }));
    onUpdate({ ...exercise, sets: renumbered });
  }

  function addSet() {
    const lastSet = exercise.sets[exercise.sets.length - 1];
    const newSet: UpsertSetPayload = {
      setNumber: exercise.sets.length + 1,
      weight: lastSet?.weight ?? 0,
      reps: lastSet?.reps ?? 10,
      rir: lastSet?.rir ?? null,
    };
    onUpdate({ ...exercise, sets: [...exercise.sets, newSet] });
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className="w-6 h-6 flex items-center justify-center text-gray-300 disabled:opacity-20 active:text-gray-600 transition-colors"
            aria-label="Subir"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className="w-6 h-6 flex items-center justify-center text-gray-300 disabled:opacity-20 active:text-gray-600 transition-colors"
            aria-label="Bajar"
          >
            ▼
          </button>
        </div>

        {/* Exercise info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{exercise.exerciseName}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {exercise.muscleGroupName}
            {exercise.isBodyweight && (
              <span className="ml-2 bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full">
                Peso corporal
              </span>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Chevron para colapsar/expandir — visualmente distinto de ▲▼ de reordenamiento */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 active:text-gray-700 transition-colors"
            aria-label={collapsed ? 'Expandir' : 'Colapsar'}
          >
            {collapsed ? (
              /* Chevron-down: contenido oculto → tap para expandir */
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                   strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            ) : (
              /* Chevron-up: contenido visible → tap para colapsar */
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                   strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="w-8 h-8 flex items-center justify-center text-gray-300 active:text-red-500 transition-colors"
            aria-label="Eliminar ejercicio"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Sets */}
      {!collapsed && (
        <div className="border-t border-gray-100 px-4 pt-3 pb-2">
          {exercise.sets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">Sin series. Agregá una.</p>
          ) : (
            <div>
              {exercise.sets.map((set, i) => (
                <SetRow
                  key={`set-${set.id ?? 'new'}-${i}`}
                  set={set}
                  isBodyweight={exercise.isBodyweight}
                  onChange={(updated) => updateSet(i, updated)}
                  onRemove={() => removeSet(i)}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addSet}
            className="mt-2 w-full py-2 text-sm text-brand-600 font-medium rounded-xl border border-dashed border-brand-200 active:bg-brand-50 transition-colors"
          >
            + Agregar serie
          </button>
        </div>
      )}
    </div>
  );
}
