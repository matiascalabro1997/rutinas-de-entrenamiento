import { describe, expect, it } from 'vitest';

class TestWorkoutSyncChannel {
  private listeners = new Set<(event: MessageEvent<unknown>) => void>();
  readonly messages: unknown[] = [];

  addEventListener(_: 'message', listener: (event: MessageEvent<unknown>) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_: 'message', listener: (event: MessageEvent<unknown>) => void) {
    this.listeners.delete(listener);
  }

  postMessage(message: unknown) {
    this.messages.push(message);
  }

  receive(message: unknown) {
    for (const listener of this.listeners) listener({ data: message } as MessageEvent<unknown>);
  }
}

describe('sincronización de consultas de workouts', () => {
  async function loadSyncTools() {
    const [{ QueryClient }, syncTools] = await Promise.all([
      import('@tanstack/react-query'),
      import('../client/src/lib/queryClient.js'),
    ]);
    return { QueryClient, ...syncTools };
  }

  it('invalida la lista y todos los detalles de workouts', async () => {
    const { QueryClient, invalidateWorkoutQueries, workoutQueryKeys } = await loadSyncTools();
    const queryClient = new QueryClient() as any;
    queryClient.setQueryData(workoutQueryKeys.inProgress, []);
    queryClient.setQueryData(workoutQueryKeys.detail(11), { id: 11 });
    queryClient.setQueryData(workoutQueryKeys.detail(22), { id: 22 });

    await invalidateWorkoutQueries(queryClient);

    expect(queryClient.getQueryState(workoutQueryKeys.inProgress)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(workoutQueryKeys.detail(11))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(workoutQueryKeys.detail(22))?.isInvalidated).toBe(true);
  });

  it('notifica y refresca el caché de otra pestaña tras una transición', async () => {
    const { QueryClient, syncWorkoutQueries, subscribeToWorkoutQuerySync, workoutQueryKeys } =
      await loadSyncTools();
    const sourceClient = new QueryClient() as any;
    const otherTabClient = new QueryClient() as any;
    const channel = new TestWorkoutSyncChannel();

    sourceClient.setQueryData(workoutQueryKeys.inProgress, []);
    otherTabClient.setQueryData(workoutQueryKeys.inProgress, []);
    const unsubscribe = subscribeToWorkoutQuerySync(otherTabClient, channel as any);

    await syncWorkoutQueries(sourceClient, channel as any);
    channel.receive(channel.messages[0]);

    expect(sourceClient.getQueryState(workoutQueryKeys.inProgress)?.isInvalidated).toBe(true);
    expect(otherTabClient.getQueryState(workoutQueryKeys.inProgress)?.isInvalidated).toBe(true);

    unsubscribe();
  });
});