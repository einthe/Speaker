export const palettes = {
  club: { label: "NTNUI – Klassisk", background: "#151512", accent: "#f3eb00" },
  "club-black": { label: "NTNUI – Sort", background: "#080a09", accent: "#f3eb00" },
  "club-green": { label: "NTNUI – Mørkegrønn", background: "#091d14", accent: "#f3eb00" },
  "club-forest": { label: "NTNUI – Skoggrønn", background: "#12251a", accent: "#8be094" },
  "club-charcoal": { label: "NTNUI – Koksgrå", background: "#202224", accent: "#f3eb00" },
  "club-slate": { label: "NTNUI – Stålgrå", background: "#2c3231", accent: "#9be4ac" },
  // Retain the original IDs so saved Skog/Petroleum preferences keep their colors.
  ntnui: { label: "Skog", background: "#101411", accent: "#c7df89" },
  petrol: { label: "Petroleum", background: "#0c191e", accent: "#8ad9d4" },
  midnight: { label: "Nattblå", background: "#111624", accent: "#aac6ff" },
  plum: { label: "Plomme", background: "#1c1420", accent: "#ddafe4" },
  amber: { label: "Rav", background: "#21180f", accent: "#f4c36c" },
  burgundy: { label: "Burgunder", background: "#201115", accent: "#f4a0ad" },
  graphite: { label: "Grafitt", background: "#151617", accent: "#d7dce2" },
} as const;
export type Palette = keyof typeof palettes;
export const paletteStorageKey = "ntnui-palette";
export function isPalette(value: unknown): value is Palette {
  return typeof value === "string" && Object.hasOwn(palettes, value);
}
// Static application constants only; never interpolate user content into this script.
export const paletteInitScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(paletteStorageKey)});if(${JSON.stringify(Object.keys(palettes))}.includes(p)){document.documentElement.dataset.palette=p;}}catch(e){}})();`;
