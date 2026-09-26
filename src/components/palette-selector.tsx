"use client";
import { useId, useSyncExternalStore } from "react";
import { isPalette, palettes, paletteStorageKey, type Palette } from "@/lib/palettes";
function applyPalette(palette: Palette) {
  document.documentElement.dataset.palette = palette;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", palettes[palette].background);
}
function subscribe(callback: () => void) {
  const changed = () => {
    applyPalette(snapshot());
    callback();
  };
  const stored = (event: StorageEvent) => {
    if (event.key === paletteStorageKey || event.key === null) {
      applyPalette(isPalette(event.newValue) ? event.newValue : "ntnui");
      callback();
    }
  };
  applyPalette(snapshot());
  window.addEventListener("palette-changed", changed);
  window.addEventListener("storage", stored);
  return () => {
    window.removeEventListener("palette-changed", changed);
    window.removeEventListener("storage", stored);
  };
}
function snapshot(): Palette {
  const value = document.documentElement.dataset.palette;
  return isPalette(value) ? value : "ntnui";
}
const serverSnapshot = (): Palette => "ntnui";
export function PaletteSelector() {
  const palette = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const id = useId();
  return (
    <div className="palette-selector">
      <label htmlFor={id}>Fargepalett</label>
      <div className="palette-choice">
        <span
          className="palette-swatch"
          aria-hidden="true"
          style={{ background: palettes[palette].accent }}
        />
        <select
          id={id}
          value={palette}
          onChange={(event) => {
            const next = event.target.value;
            if (!isPalette(next)) return;
            applyPalette(next);
            try {
              localStorage.setItem(paletteStorageKey, next);
            } catch {
              /* Keep the choice usable when browser storage is unavailable. */
            }
            window.dispatchEvent(new Event("palette-changed"));
          }}
        >
          {Object.entries(palettes).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
