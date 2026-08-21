import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, RoutineSummary } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

export default function RoutinesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [actionMenuId, setActionMenuId] = useState<number | null>(null);

  const { data: routines = [], isLoading } = useQuery({
    queryKey: ['routines'],
    queryFn: api.routines.list,
  });

  const createMutation = useMutation({
    mutationFn: api.routines.create,
    onSuccess: (routine) => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      navigate(`/routines/${routine.id}`);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: api.routines.duplicate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routines'] }),
  });

  const archiveMutation = useMutation({
    mutationFn: api.routines.archive,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routines'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: api.routines.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routines'] }),
  });

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim() });
  }

  const active = routines.filter((r) => !r.archivedAt);
  const archived = routines.filter((r) => r.archivedAt);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
    });
  }

  function RoutineCard({ routine }: { routine: RoutineSummary }) {
    const isMenuOpen = actionMenuId === routine.id;

    return (
      <div className="card relative overflow-visible">
        <button
          type="button"
          onClick={() => navigate(`/routines/${routine.id}`)}
          className="w-full text-left p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{routine.name}</h3>
              <p className="text-xs text-gray-400 mt-1">
                {routine.exerciseCount} ejercicio{routine.exerciseCount !== 1 ? 's' : ''} ·{' '}
                {formatDate(routine.updatedAt)}
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActionMenuId(isMenuOpen ? null : routine.id);
              }}
              className="w-8 h-8 flex items-center justify-center text-gray-400 rounded-full active:bg-gray-100 flex-shrink-0"
              aria-label="Opciones"
            >
              •••
            </button>
          </div>
        </button>

        {/* Menú de acciones */}
        {isMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setActionMenuId(null)}
            />
            <div className="absolute right-3 top-12 z-20 bg-white rounded-2xl shadow-lg border border-gray-100 py-1 min-w-[160px]">
              <button
                type="button"
                onClick={() => {
                  navigate(`/routines/${routine.id}`);
                  setActionMenuId(null);
                }}
                className="w-full text-left px-4 py-3 text-sm text-gray-700 active:bg-gray-50"
              >
                ✏️ Editar
              </button>
              <button
                type="button"
                onClick={() => {
                  duplicateMutation.mutate(routine.id);
                  setActionMenuId(null);
                }}
                className="w-full text-left px-4 py-3 text-sm text-gray-700 active:bg-gray-50"
              >
                📋 Duplicar
              </button>
              <button
                type="button"
                onClick={() => {
                  archiveMutation.mutate(routine.id);
                  setActionMenuId(null);
                }}
                className="w-full text-left px-4 py-3 text-sm text-gray-700 active:bg-gray-50"
              >
                {routine.archivedAt ? '📤 Desarchivar' : '📦 Archivar'}
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Eliminar "${routine.name}"? Esta acción no se puede deshacer.`)) {
                    deleteMutation.mutate(routine.id);
                  }
                  setActionMenuId(null);
                }}
                className="w-full text-left px-4 py-3 text-sm text-red-600 active:bg-red-50"
              >
                🗑 Eliminar
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-xl text-gray-900">Mis rutinas</h1>
            {user?.displayName && (
              <p className="text-xs text-gray-400">{user.displayName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-gray-500 active:text-gray-700"
          >
            Salir
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* Crear nueva rutina */}
        {creating ? (
          <form onSubmit={handleCreate} className="card p-4 flex gap-2">
            <input
              className="input flex-1"
              placeholder="Nombre de la rutina"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <button type="submit" disabled={createMutation.isPending} className="btn-primary px-4">
              {createMutation.isPending ? '...' : 'Crear'}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewName(''); }}
              className="btn-ghost"
            >
              ✕
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="w-full card p-4 flex items-center gap-3 text-brand-600 active:bg-brand-50 transition-colors"
          >
            <span className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center text-xl font-light">
              +
            </span>
            <span className="font-semibold">Nueva rutina</span>
          </button>
        )}

        {/* Lista de rutinas activas */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : active.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">🏋️</div>
            <p className="font-medium text-gray-500">Sin rutinas activas</p>
            <p className="text-sm mt-1">Creá tu primera rutina para empezar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((r) => (
              <RoutineCard key={r.id} routine={r} />
            ))}
          </div>
        )}

        {/* Rutinas archivadas */}
        {archived.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 text-sm text-gray-400 font-medium py-2 w-full"
            >
              <span className={`transition-transform ${showArchived ? 'rotate-90' : ''}`}>▶</span>
              Archivadas ({archived.length})
            </button>

            {showArchived && (
              <div className="space-y-3 mt-2">
                {archived.map((r) => (
                  <div key={r.id} className="opacity-60">
                    <RoutineCard routine={r} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
