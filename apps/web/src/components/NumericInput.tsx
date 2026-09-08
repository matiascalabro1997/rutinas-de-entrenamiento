import React, { useState, useRef } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  unit?: string;
  className?: string;
}

export default function NumericInput({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  decimals = 0,
  unit,
  className = '',
}: NumericInputProps) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function clamp(v: number) {
    return Math.max(min, Math.min(max, v));
  }

  function decrement() {
    onChange(clamp(parseFloat((value - step).toFixed(decimals))));
  }

  function increment() {
    onChange(clamp(parseFloat((value + step).toFixed(decimals))));
  }

  function startEdit() {
    setRaw(String(value));
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  }

  function commitEdit() {
    const parsed = parseFloat(raw.replace(',', '.'));
    if (!isNaN(parsed)) {
      onChange(clamp(parseFloat(parsed.toFixed(decimals))));
    }
    setEditing(false);
  }

  const display = decimals > 0 ? value.toFixed(decimals) : String(value);

  return (
    <div className={`flex items-center gap-0 ${className}`}>
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          decrement();
        }}
        disabled={value <= min}
        className="w-9 h-9 flex items-center justify-center rounded-l-lg bg-gray-100 text-gray-700 text-lg font-bold active:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed select-none transition-colors"
        aria-label="Disminuir"
      >
        −
      </button>

      {editing ? (
        <input
          ref={inputRef}
          type="number"
          className="w-16 h-9 text-center text-sm font-semibold border-y border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-inset"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') setEditing(false);
          }}
          step={step}
          min={min}
          max={max}
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="w-16 h-9 text-center text-sm font-semibold border-y border-gray-200 bg-white select-none"
        >
          {display}
          {unit && <span className="text-xs text-gray-400 ml-0.5">{unit}</span>}
        </button>
      )}

      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          increment();
        }}
        disabled={value >= max}
        className="w-9 h-9 flex items-center justify-center rounded-r-lg bg-gray-100 text-gray-700 text-lg font-bold active:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed select-none transition-colors"
        aria-label="Aumentar"
      >
        +
      </button>
    </div>
  );
}
