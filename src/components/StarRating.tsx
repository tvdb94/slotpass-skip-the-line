import { useState } from "react";

export function StarRating({
  value,
  onChange,
  size = 28,
  readOnly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <div className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= shown;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onMouseEnter={() => !readOnly && setHover(n)}
            onMouseLeave={() => !readOnly && setHover(null)}
            onClick={() => !readOnly && onChange?.(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className={`leading-none transition-transform ${readOnly ? "" : "hover:scale-110 active:scale-95"}`}
            style={{ fontSize: size, color: filled ? "#f5a524" : "#e5e5e5", cursor: readOnly ? "default" : "pointer" }}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}