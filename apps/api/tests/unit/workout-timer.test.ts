import { describe, expect, it } from 'vitest';
import {
  activeSecondsSince,
  effectiveElapsedSeconds,
  completedTimerValues,
  pausedTimerValues,
  resumedTimerValues,
  type TimerState,
} from '../../src/services/workout-timer';

const T0 = new Date('2026-01-01T10:00:00.000Z');
const at = (segundos: number) => new Date(T0.getTime() + segundos * 1000);

function estado(overrides: Partial<TimerState> = {}): TimerState {
  return {
    elapsedSeconds: 0,
    activeStartedAt: null,
    timerStatus: 'paused',
    version: 1,
    ...overrides,
  };
}

describe('activeSecondsSince', () => {
  it('devuelve 0 cuando no hay período activo abierto', () => {
    expect(activeSecondsSince(null, at(500))).toBe(0);
  });

  it('cuenta los segundos transcurridos', () => {
    expect(activeSecondsSince(T0, at(75))).toBe(75);
  });

  it('trunca hacia abajo en vez de redondear', () => {
    expect(activeSecondsSince(T0, new Date(T0.getTime() + 1999))).toBe(1);
  });

  it('nunca devuelve negativo si el reloj del server retrocede', () => {
    // Un ajuste de NTP hacia atrás restaría tiempo ya acumulado.
    expect(activeSecondsSince(T0, at(-3600))).toBe(0);
  });
});

describe('effectiveElapsedSeconds', () => {
  it('suma el período en curso mientras corre', () => {
    const w = estado({ elapsedSeconds: 100, activeStartedAt: T0, timerStatus: 'running' });
    expect(effectiveElapsedSeconds(w, at(25))).toBe(125);
  });

  it('ignora el reloj si está pausado', () => {
    const w = estado({ elapsedSeconds: 100, activeStartedAt: T0, timerStatus: 'paused' });
    expect(effectiveElapsedSeconds(w, at(9999))).toBe(100);
  });

  it('ignora el reloj si ya terminó', () => {
    const w = estado({ elapsedSeconds: 100, activeStartedAt: T0, timerStatus: 'completed' });
    expect(effectiveElapsedSeconds(w, at(9999))).toBe(100);
  });

  it('devuelve lo acumulado si dice correr pero no tiene período abierto', () => {
    // Estado heredado de los workouts anteriores a la existencia del timer.
    const w = estado({ elapsedSeconds: 42, activeStartedAt: null, timerStatus: 'running' });
    expect(effectiveElapsedSeconds(w, at(9999))).toBe(42);
  });
});

describe('pausedTimerValues', () => {
  it('acumula el período activo y cierra el timer', () => {
    const w = estado({ elapsedSeconds: 100, activeStartedAt: T0, timerStatus: 'running' });
    const v = pausedTimerValues(w, at(50));

    expect(v.elapsedSeconds).toBe(150);
    expect(v.activeStartedAt).toBeNull();
    expect(v.timerStatus).toBe('paused');
    expect(v.version).toBe(2);
    expect(v.updatedAt).toEqual(at(50));
  });

  it('no duplica tiempo al pausar algo que ya estaba pausado', () => {
    // Dos pedidos de pausa concurrentes no pueden sumar el período dos veces.
    const w = estado({ elapsedSeconds: 150, activeStartedAt: null, timerStatus: 'paused' });
    expect(pausedTimerValues(w, at(999)).elapsedSeconds).toBe(150);
  });
});

describe('resumedTimerValues', () => {
  it('abre un período nuevo sin tocar lo ya acumulado', () => {
    const w = estado({ elapsedSeconds: 150, timerStatus: 'paused', version: 4 });
    const v = resumedTimerValues(w, at(200));

    expect(v.activeStartedAt).toEqual(at(200));
    expect(v.timerStatus).toBe('running');
    expect(v.version).toBe(5);
  });
});

describe('completedTimerValues', () => {
  it('acumula el período en curso al finalizar', () => {
    const w = estado({ elapsedSeconds: 100, activeStartedAt: T0, timerStatus: 'running' });
    const v = completedTimerValues(w, at(50));

    expect(v.elapsedSeconds).toBe(150);
    expect(v.status).toBe('completed');
    expect(v.timerStatus).toBe('completed');
    expect(v.activeStartedAt).toBeNull();
    expect(v.completedAt).toEqual(at(50));
  });

  it('no agrega tiempo si ya estaba pausado', () => {
    const w = estado({ elapsedSeconds: 150, activeStartedAt: null, timerStatus: 'paused' });
    expect(completedTimerValues(w, at(999)).elapsedSeconds).toBe(150);
  });
});

describe('ciclo completo', () => {
  it('sólo cuenta el tiempo en ejecución, no el de calendario', () => {
    // Arranca, corre 60s, pausa 1 hora, reanuda, corre 30s más.
    let w: TimerState = estado({ activeStartedAt: T0, timerStatus: 'running' });

    const pausa = pausedTimerValues(w, at(60));
    w = { ...w, ...pausa, timerStatus: 'paused' };
    expect(w.elapsedSeconds).toBe(60);

    const reanudar = resumedTimerValues(w, at(3660));
    w = { ...w, ...reanudar, timerStatus: 'running' };

    const final = pausedTimerValues(w, at(3690));
    expect(final.elapsedSeconds).toBe(90);

    // Calendario: 3690s. Efectivo: 90s. La diferencia es la pausa.
    expect(final.elapsedSeconds).toBeLessThan(3690);
  });
});
