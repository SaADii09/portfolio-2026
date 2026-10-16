"use client";

export interface GlassSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  ariaLabel: string;
  compact?: boolean;
}

/**
 * Shared glass/volume slider row: fixed-width label + range input + optional readout.
 * `compact` drops the fixed label width for tight mobile rows; an empty `label`
 * renders icon-only rows (e.g. volume next to a Volume2 icon).
 */
export function GlassSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  ariaLabel,
  compact,
}: GlassSliderProps) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <label
          className={compact ? "text-[10px] flex-shrink-0" : "text-[10px] w-12 flex-shrink-0"}
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </label>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-os-accent cursor-pointer"
        aria-label={ariaLabel}
      />
      {format && (
        <span className="text-[9px] w-6 text-right" style={{ color: "var(--text-secondary)" }}>
          {format(value)}
        </span>
      )}
    </div>
  );
}
