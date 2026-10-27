/** Garde l'écran allumé pendant un bloc (tablette au pupitre). Sans effet si le navigateur ne le permet pas. */
import { useEffect } from "react";

interface Sentinel { release(): Promise<void> }

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wl = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<Sentinel> } }).wakeLock;
    if (!wl) return;
    let sentinel: Sentinel | null = null;
    let live = true;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      wl.request("screen").then((s) => { if (live) sentinel = s; else void s.release(); }).catch(() => undefined);
    };
    acquire();
    // Le verrou tombe quand l'onglet passe en arrière-plan : on le reprend au retour.
    document.addEventListener("visibilitychange", acquire);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
