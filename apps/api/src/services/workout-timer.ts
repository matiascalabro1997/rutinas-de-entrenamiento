import type { TimerStatus } from '@rutinas/shared';

/**
 * Matemática del tiempo efectivo de un entrenamiento.
 *
 * Todo acá es puro: recibe el estado y un instante, devuelve valores. No toca
 * la base ni lee el reloj, así que el `now` siempre entra por parámetro. Eso
 * permite testear los casos de borde —relojes que retroceden, pausas repetidas,
 * workouts heredados sin timer— sin levantar PostgreSQL.
 *
 * La regla que ordena todo esto: `elapsedSeconds` es aditivo y se persiste;
 * nunca se deriva de `completedAt - startedAt`. El tiempo de calendario incluye
 * las pausas, y convertirlo en tiempo efectivo inventaría duraciones enormes.
 */

/** Lo mínimo que necesitan estas funciones de una fila de `workouts`. */
export interface TimerState {
  elapsedSeconds: number;
  activeStartedAt: Date | null;
  timerStatus: TimerStatus;
  version: number;
}

/**
 * Segundos corridos desde que arrancó el período activo actual.
 *
 * Se recorta en 0 a propósito: si el reloj del server retrocede (ajuste de NTP,
 * cambio de hora), la resta da negativo y restaría tiempo ya acumulado.
 */
export function activeSecondsSince(startedAt: Date | null, now: Date): number {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
}

/**
 * Tiempo efectivo para mostrar: lo ya acumulado más el período activo en curso.
 *
 * Sólo suma el período en curso si el timer está corriendo. Un workout pausado
 * o terminado ya tiene todo su tiempo dentro de `elapsedSeconds`.
 */
export function effectiveElapsedSeconds(workout: TimerState, now: Date): number {
  if (workout.timerStatus !== 'running') return workout.elapsedSeconds;
  return workout.elapsedSeconds + activeSecondsSince(workout.activeStartedAt, now);
}

/** Campos a persistir al pausar: cierra el período activo y lo acumula. */
export function pausedTimerValues(workout: TimerState, now: Date) {
  return {
    elapsedSeconds: workout.elapsedSeconds + activeSecondsSince(workout.activeStartedAt, now),
    activeStartedAt: null,
    timerStatus: 'paused' as const,
    version: workout.version + 1,
    updatedAt: now,
  };
}

/** Campos a persistir al reanudar: abre un período activo nuevo. */
export function resumedTimerValues(workout: TimerState, now: Date) {
  return {
    activeStartedAt: now,
    timerStatus: 'running' as const,
    version: workout.version + 1,
    updatedAt: now,
  };
}

/**
 * Campos a persistir al finalizar: cierra el período activo y lo acumula.
 *
 * Suma el período en curso sin condicionar por `timerStatus`, igual que antes
 * del refactor. Es equivalente a `effectiveElapsedSeconds` mientras valga el
 * invariante de que pausar deja `activeStartedAt` en null, y además cierra
 * cualquier estado inconsistente en vez de descartar ese tiempo.
 */
export function completedTimerValues(workout: TimerState, now: Date) {
  return {
    status: 'completed' as const,
    completedAt: now,
    elapsedSeconds: workout.elapsedSeconds + activeSecondsSince(workout.activeStartedAt, now),
    activeStartedAt: null,
    timerStatus: 'completed' as const,
    version: workout.version + 1,
    updatedAt: now,
  };
}
