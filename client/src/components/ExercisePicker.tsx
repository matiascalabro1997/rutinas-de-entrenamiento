import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Exercise, MuscleGroup } from '../lib/api';

interface ExercisePickerProps {
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
}

export default function ExercisePicker({ onSelect, onClose }: ExercisePickerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newEx, setNewEx] = useState({
    name: '',
    muscleGroupId: 0,
    isBodyweight: false,
  });
  const [createError, setCreateError] = useState('');

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: api.exercises.list,
  });

  const { data: muscleGroups = [] } = useQuery({
    queryKey: ['muscle-groups'],
    queryFn: api.muscleGroups.list,
  });

  const createMutation = useMutation({
    mutationFn: api.exercises.create,
    onSuccess: (exercise) => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      onSelect(exercise);
    },
    onError: (err: any) => setCreateError(err.message),
  });

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      const matchesGroup = selectedGroup === null || ex.muscleGroupId === selectedGroup;
      const matchesSearch =
        search === '' || ex.name.toLowerCase().includes(search.toLowerCase());
      return matchesGroup && matchesSearch;
    });
  }, [exercises, selectedGroup, search]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newEx.name.trim()) { setCreateError('El nombre es requerido'); return; }
    if (!newEx.muscleGroupId) { setCreateError('Seleccioná un grupo muscular'); return; }
    setCreateError('');
    createMutation.mutate({
      name: newEx.name.trim(),
      muscleGroupId: newEx.muscleGroupId,
      isBodyweight: newEx.isBodyweight,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 safe-area-top">
        <button type="button" onClick={onClose} className="text-brand-600 font-medium">
          ← Volver
        </button>
        <h2 className="font-semibold text-gray-900 flex-1">
          {showCreate ? 'Nuevo ejercicio' : 'Agregar ejercicio'}
        </h2>
        {!showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="text-sm text-brand-600 font-medium"
          >
            + Crear
          </button>
        )}
      </div>

      {showCreate ? (
        /* ── Formulario crear ejercicio ── */
        <div className="flex-1 overflow-y-auto p-4">
          <form onSubmit={handleCreate} className="card p-5 space-y-4">
            {createError && (
              <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{createError}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
              <input
                className="input"
                placeholder="Ej: Curl concentrado"
                value={newEx.name}
                onChange={(e) => setNewEx({ ...newEx, name: e.target.value })}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Grupo muscular
              </label>
              <select
                className="input"
                value={newEx.muscleGroupId || ''}
                onChange={(e) => setNewEx({ ...newEx, muscleGroupId: Number(e.target.value) })}
              >
                <option value="">Seleccioná...</option>
                {muscleGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-5 h-5 rounded accent-brand-600"
                checked={newEx.isBodyweight}
                onChange={(e) => setNewEx({ ...newEx, isBodyweight: e.target.checked })}
              />
              <span className="text-sm text-gray-700">
                Peso corporal (sin carga externa)
              </span>
            </label>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="btn-primary flex-1"
              >
                {createMutation.isPending ? 'Guardando...' : 'Crear y agregar'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* ── Lista de ejercicios ── */
        <>
          {/* Búsqueda */}
          <div className="bg-white px-4 py-3 border-b border-gray-100">
            <input
              className="input"
              placeholder="Buscar ejercicio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Filtro por grupo muscular */}
          <div className="bg-white px-4 pb-3 border-b border-gray-100 overflow-x-auto">
            <div className="flex gap-2 py-1">
              <button
                type="button"
                onClick={() => setSelectedGroup(null)}
                className={`flex-shrink-0 text-sm px-3 py-1.5 rounded-full font-medium transition-colors ${
                  selectedGroup === null
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                Todos
              </button>
              {muscleGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGroup(g.id === selectedGroup ? null : g.id)}
                  className={`flex-shrink-0 text-sm px-3 py-1.5 rounded-full font-medium transition-colors ${
                    selectedGroup === g.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <div className="text-center text-gray-400 py-12 px-4">
                <p className="text-lg">Sin resultados</p>
                <p className="text-sm mt-1">Probá con otro término o creá un ejercicio personalizado</p>
              </div>
            ) : (
              filtered.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => onSelect(ex)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 bg-white active:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{ex.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ex.muscleGroupName}
                      {ex.isBodyweight && (
                        <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                          Peso corporal
                        </span>
                      )}
                      {ex.isCustom && (
                        <span className="ml-2 text-[10px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded-full">
                          Personalizado
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-gray-300">›</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
