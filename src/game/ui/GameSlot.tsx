import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Isolation du jeu dans l'interface : une erreur dans un composant du jeu reste confinée ici.
 * La partie musicale autour (lancement, loot, onglets) continue normalement.
 */
export class GameSlot extends Component<{ children: ReactNode; quiet?: boolean }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[jeu] composant en erreur", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return this.props.quiet ? null : <p className="dim lw-off">Le jeu est momentanément indisponible ; la pratique n'est pas concernée.</p>;
    }
    return this.props.children;
  }
}
