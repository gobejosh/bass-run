/**
 * Service worker : enregistrement et signal « nouvelle version installée ».
 * La nouvelle version prend la main tout de suite (skipWaiting dans sw.js), mais la page ouverte garde l'ancienne en mémoire :
 * on ne recharge jamais tout seul (un bloc peut être en cours). L'app affiche un avis, hors bloc, avec « Recharger ».
 */
type Listener = () => void;
let updated = false;
const listeners = new Set<Listener>();

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Premier passage (aucune version avant) : rien à signaler.
      if (!hadController || updated) return;
      updated = true;
      listeners.forEach((l) => l());
    });
    void navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        // App installée laissée ouverte des jours : on vérifie aussi au retour au premier plan.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);
  });
}

export function hasUpdate(): boolean {
  return updated;
}

export function onUpdate(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
