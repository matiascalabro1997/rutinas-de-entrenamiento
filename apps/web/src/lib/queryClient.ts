import { QueryClient } from '@tanstack/react-query';

export const workoutQueryKeys = {
  all: ['workouts'] as const,
  inProgress: ['workouts', 'in-progress'] as const,
  detail: (id: number) => ['workouts', id] as const,
};

const workoutSyncMessageType = 'workout-state-changed';
type WorkoutSyncChannel = Pick<
  BroadcastChannel,
  'addEventListener' | 'removeEventListener' | 'postMessage'
>;

let workoutSyncChannel: WorkoutSyncChannel | null | undefined;

function getWorkoutSyncChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  workoutSyncChannel ??= new BroadcastChannel('fitness-tracker-workouts');
  return workoutSyncChannel;
}

/**
 * A timer transition can pause a different workout for the same user.
 * Invalidating the whole workouts namespace refreshes every mounted workout
 * view and marks cached details stale so they are fetched again on return.
 */
export function invalidateWorkoutQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: workoutQueryKeys.all });
}

export async function syncWorkoutQueries(
  queryClient: QueryClient,
  channel = getWorkoutSyncChannel(),
) {
  channel?.postMessage({ type: workoutSyncMessageType });
  await invalidateWorkoutQueries(queryClient);
}

export function subscribeToWorkoutQuerySync(
  queryClient: QueryClient,
  channel = getWorkoutSyncChannel(),
) {
  if (!channel) return () => undefined;

  const onMessage = (event: MessageEvent<unknown>) => {
    if (
      !event.data ||
      typeof event.data !== 'object' ||
      !('type' in event.data) ||
      event.data.type !== workoutSyncMessageType
    ) {
      return;
    }
    void invalidateWorkoutQueries(queryClient);
  };

  channel.addEventListener('message', onMessage);
  return () => channel.removeEventListener('message', onMessage);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
