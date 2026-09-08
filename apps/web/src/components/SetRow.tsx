import React, { useState } from 'react';
import NumericInput from './NumericInput';
import { UpsertRoutineSetPayload } from '../lib/api';

interface SetRowProps {
  set: UpsertRoutineSetPayload & { id?: number };
  isBodyweight: boolean;
  onChange: (updated: UpsertRoutineSetPayload) => void;
  onRemove: () => void;
}

export default function SetRow({ set, isBodyweight, onChange, onRemove }: SetRowProps) {
  const [showRir, setShowRir] = useState(set.rir !== null);

  function update(partial: Partial<UpsertRoutineSetPayload>) {
    onChange({ ...set, ...partial });
  }

  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
      {/* Número de serie */}
      <span className="w-5 text-xs font-bold text-gray-400 text-center flex-shrink-0">
        {set.setNumber}
      </span>

      {/* Peso */}
      {!isBodyweight && (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-gray-400 font-medium">kg</span>
          <NumericInput
            value={set.weight}
            onChange={(v) => update({ weight: v })}
            step={2.5}
            decimals={1}
            min={0}
            max={999.5}
          />
        </div>
      )}

      {/* Reps */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] text-gray-400 font-medium">reps</span>
        <NumericInput
          value={set.reps}
          onChange={(v) => update({ reps: v })}
          step={1}
          min={0}
          max={999}
        />
      </div>

      {/* RIR */}
      {showRir ? (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-gray-400 font-medium">RIR</span>
          <NumericInput
            value={set.rir ?? 0}
            onChange={(v) => update({ rir: v })}
            step={1}
            min={0}
            max={10}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setShowRir(true);
            update({ rir: 2 });
          }}
          className="text-[10px] text-gray-400 border border-dashed border-gray-300 rounded-lg px-2 py-1 mt-4 active:bg-gray-50"
        >
          + RIR
        </button>
      )}

      {/* Botón eliminar */}
      <button
        type="button"
        onClick={onRemove}
        className="ml-auto flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-300 active:text-red-500 transition-colors"
        aria-label="Eliminar serie"
      >
        ✕
      </button>
    </div>
  );
}
