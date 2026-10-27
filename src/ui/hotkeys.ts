/**
 * Raccourcis clavier (et pédales Bluetooth qui envoient des touches) : Espace, Entrée, P, 1 à 5, Échap…
 * Ignorés quand on écrit dans un champ, ou avec Ctrl / Alt / Cmd.
 */
import { useEffect, useRef } from "react";

export type HotkeyMap = Partial<Record<string, () => void>>;

const typing = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);

/**
 * Après un toucher ou un clic, le bouton touché garde le focus ; Espace (ou une pédale) doit alors déclencher
 * l'action de l'écran, pas ce bouton. Si tu navigues au clavier (Tab), le bouton qui a le focus garde la main.
 */
let pointerMode = true;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => { pointerMode = true; }, true);
  window.addEventListener("keydown", (e) => { if (e.key === "Tab") pointerMode = false; }, true);
}

/** Les clés sont des `KeyboardEvent.key` en minuscules (" " pour Espace, "enter", "p", "1"…). */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || typing(e.target)) return;
      // Espace ou Entrée sur un bouton qui a le focus : on laisse le bouton agir.
      if ((e.key === " " || e.key === "Enter") && e.target instanceof HTMLButtonElement && !pointerMode) return;
      const fn = ref.current[e.key.toLowerCase()] ?? (e.code === "Space" ? ref.current[" "] : undefined);
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [enabled]);
}
