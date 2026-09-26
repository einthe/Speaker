"use client";
import { useCallback, useId, useSyncExternalStore } from "react";
import { Contrast } from "lucide-react";

type CardHighlighting = "standard" | "full";
type CardColors = "soft" | "classic";
const changedEvent = "card-highlighting-changed";
const memory = new Map<string, string>();

function useCardPreference<T extends string>(
  userId: string,
  name: string,
  fallback: T,
  alternate: T,
) {
  const key = `ntnui-${name}:${userId}`;
  const serverSnapshot = useCallback(() => fallback, [fallback]);
  const snapshot = useCallback((): T => {
    const cached = memory.get(key);
    if (cached) return cached === alternate ? alternate : fallback;
    try {
      return localStorage.getItem(key) === alternate ? alternate : fallback;
    } catch {
      return fallback;
    }
  }, [key, alternate, fallback]);
  const subscribe = useCallback(
    (callback: () => void) => {
      const stored = (event: StorageEvent) => {
        if (event.key === key || event.key === null) {
          memory.delete(key);
          callback();
        }
      };
      window.addEventListener(changedEvent, callback);
      window.addEventListener("storage", stored);
      return () => {
        window.removeEventListener(changedEvent, callback);
        window.removeEventListener("storage", stored);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const setValue = (next: T) => {
    memory.set(key, next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // The setting still works for this session if browser storage is blocked.
    }
    window.dispatchEvent(new Event(changedEvent));
  };
  return [value, setValue] as const;
}

export function useCardHighlighting(userId: string) {
  return useCardPreference<CardHighlighting>(userId, "card-highlighting", "standard", "full");
}

export function useCardColors(userId: string) {
  return useCardPreference<CardColors>(userId, "card-colors", "soft", "classic");
}

export function useHighContrast(userId: string) {
  return useCardPreference(userId, "high-contrast", "off", "on");
}

export function HighContrastToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="contrast-toggle"
      aria-pressed={enabled}
      onClick={() => onChange(!enabled)}
    >
      <Contrast size={16} aria-hidden="true" />
      Høy kontrast
      <span aria-hidden="true">{enabled ? "På" : "Av"}</span>
    </button>
  );
}

export function CardColorSelector({
  value,
  onChange,
}: {
  value: CardColors;
  onChange: (value: CardColors) => void;
}) {
  const id = useId();
  return (
    <div className="palette-selector">
      <label htmlFor={id}>Farger på innlegg og hendelser</label>
      <div className="palette-choice">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value === "classic" ? "classic" : "soft")}
        >
          <option value="soft">Myke</option>
          <option value="classic">Klassiske</option>
        </select>
      </div>
    </div>
  );
}

export function CardHighlightSelector({
  value,
  onChange,
}: {
  value: CardHighlighting;
  onChange: (value: CardHighlighting) => void;
}) {
  const id = useId();
  return (
    <div className="palette-selector">
      <label htmlFor={id}>Fremheving av innlegg og hendelser</label>
      <div className="palette-choice">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value === "full" ? "full" : "standard")}
        >
          <option value="standard">Standard</option>
          <option value="full">Hele kortet</option>
        </select>
      </div>
    </div>
  );
}
