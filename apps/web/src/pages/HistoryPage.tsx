import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, WorkoutSummary } from '../lib/api';

const PAGE_SIZE = 20;

/**
 * "1h 12m", "24m" o "45s".
 *
 * Los segundos sólo aparecen por debajo del minuto: sin ese caso, una sesión
 * corta se mostraba como "0m" y parecía un error en vez de un dato.
 */
function formatDuration(totalSeconds: number) {
  if (totalSeconds < 60) return `${Math.max(0, Math.round(totalSeconds))}s`;

  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "Hoy" / "Ayer" / "mar 23 sep" — lo reciente es lo que más se mira. */
function formatDate(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);

  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return date.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatVolume(kg: number) {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace('.0', '')}t`;
  return `${Math.round(kg)} kg`;
}

function WorkoutCard({ workout, onOpen }: { workout: WorkoutSummary; onOpen: () => void }) {
  const allDone = workout.totalSets > 0 && workout.completedSets === workout.totalSets;

  return (
    <button type="button" onClick={onOpen} className="card w-full p-4 text-left active:bg-gray-50">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="truncate font-semibold text-gray-900">{workout.name}</h3>
        <span className="flex-shrink-0 text-xs text-gray-400">
          {formatDate(workout.completedAt)}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4 text-sm">
        <span className="text-gray-500">
          <span className="font-medium text-gray-900">
            {formatDuration(workout.elapsedSeconds)}
          </span>
        </span>
        <span className={allDone ? 'text-emerald-600' : 'text-gray-500'}>
          <span className="font-medium">
            {workout.completedSets}/{workout.totalSets}
          </span>{' '}
          series
        </span>
        {workout.totalVolume > 0 && (
          <span className="text-gray-500">
            <span className="font-medium text-gray-900">{formatVolume(workout.totalVolume)}</span>{' '}
            total
          </span>
        )}
      </div>
    </button>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['workouts', 'history'],
      initialPageParam: 0,
      queryFn: ({ pageParam }) => api.workouts.history({ limit: PAGE_SIZE, offset: pageParam }),
      getNextPageParam: (lastPage, allPages) =>
        lastPage.hasMore ? allPages.length * PAGE_SIZE : undefined,
    });

  const workouts = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-4">
          <button
            type="button"
            onClick={() => navigate('/routines')}
            className="text-sm text-gray-500 active:text-gray-700"
          >
            ← Rutinas
          </button>
          <h1 className="text-xl font-bold text-gray-900">Historial</h1>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-3 px-4 py-5">
        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          </div>
        )}

        {isError && (
          <div className="card p-6 text-center">
            <p className="text-sm text-gray-500">No se pudo cargar el historial.</p>
          </div>
        )}

        {!isLoading && !isError && workouts.length === 0 && (
          <div className="card p-8 text-center">
            <div className="mb-3 text-4xl">📋</div>
            <p className="font-medium text-gray-900">Todavía no terminaste ningún entrenamiento</p>
            <p className="mt-1 text-sm text-gray-400">
              Cuando finalices una sesión, va a aparecer acá
            </p>
          </div>
        )}

        {workouts.map((workout) => (
          <WorkoutCard
            key={workout.id}
            workout={workout}
            // `from` le dice al detalle a dónde volver: sin esto mandaría a
            // rutinas, y en PWA a pantalla completa no hay otra salida.
            onOpen={() => navigate(`/workouts/${workout.id}`, { state: { from: 'history' } })}
          />
        ))}

        {hasNextPage && (
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="btn-secondary w-full"
          >
            {isFetchingNextPage ? 'Cargando...' : 'Ver más'}
          </button>
        )}
      </div>
    </div>
  );
}
