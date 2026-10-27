/**
 * Thèmes de l'interface (voir docs/THEMES.md). Port en TypeScript de theme.js fourni avec les thèmes :
 * même clé de stockage, même attribut `data-theme` sur <html>, même événement. Le thème est posé avant
 * le premier affichage par le petit script en ligne de index.html.
 *
 * Préférence propre à chaque appareil (localStorage) : elle n'entre pas dans les sauvegardes.
 */
export const THEMES = [
  { id: "neon", label: "Pupitre néon", color: "#120f24", swatches: ["#120f24", "#4fe3ee", "#ffb04a"] },
  { id: "phosphore", label: "Terminal phosphore", color: "#040a06", swatches: ["#040a06", "#b9ffc8", "#ffb547"] },
  { id: "signal", label: "Signalétique industrielle", color: "#2a2c2e", swatches: ["#2a2c2e", "#ffd23a", "#7dbdff"] },
  { id: "tokyo", label: "Éditorial Néo-Tokyo", color: "#0a0a0a", swatches: ["#0a0a0a", "#ff3d81", "#ffe066"] },
  { id: "jour", label: "Pupitre de jour", color: "#f3f2ee", swatches: ["#f3f2ee", "#007380", "#9a5200"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "neon";
export const THEME_STORAGE_KEY = "basse-run.theme";

const find = (id: unknown) => THEMES.find((t) => t.id === id);

export function currentTheme(): ThemeId {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (find(saved)) return saved as ThemeId;
  } catch {
    // stockage indisponible : thème par défaut
  }
  return DEFAULT_THEME;
}

export function applyTheme(id: ThemeId, persist = true): ThemeId {
  const theme = find(id) ?? find(DEFAULT_THEME)!;
  document.documentElement.setAttribute("data-theme", theme.id);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", theme.color);
  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme.id);
    } catch {
      // rien : le thème reste appliqué pour cette visite
    }
  }
  document.dispatchEvent(new CustomEvent("basse-run:theme", { detail: { id: theme.id } }));
  return theme.id;
}
