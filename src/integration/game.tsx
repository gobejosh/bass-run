/**
 * Greffe du jeu sur l'interface musicale. La partie musicale n'importe le jeu que par ce fichier :
 * un démarrage qui ne lève jamais, des emplacements isolés par une error boundary, et la sauvegarde.
 */
import type { ModRarity } from "../game/engine";
import { gameRuntime, startGame } from "../game/runtime";
import type { GameBackup } from "../game/store";
import { GameSettings } from "../game/ui/GameSettings";
import { GameSlot } from "../game/ui/GameSlot";
import { MissionPicker } from "../game/ui/MissionPicker";
import { MissionCell } from "../game/ui/MissionCell";
import { MissionReport } from "../game/ui/MissionReport";
import { TeamScreen } from "../game/ui/TeamScreen";
import "../game/ui/game.css";
import type { Repo } from "../storage/repo";
import { eventFeed } from "./gameFeed";

/** Démarre le jeu en arrière-plan. Ne bloque ni ne fait échouer le démarrage de l'app. */
export function bootGame(repo: Repo): void {
  try {
    void startGame(eventFeed(repo));
  } catch (err) {
    console.error("[jeu] démarrage", err);
  }
}

export function LaunchMission({ modRarity }: { modRarity: ModRarity }) {
  return (
    <GameSlot quiet>
      <MissionPicker modRarity={modRarity} />
    </GameSlot>
  );
}

export function AfterBlockReport({ blockId }: { blockId: string }) {
  return (
    <GameSlot>
      <MissionReport blockId={blockId} />
    </GameSlot>
  );
}

export function GameSettingsSection() {
  return (
    <GameSlot>
      <GameSettings />
    </GameSlot>
  );
}

/** Données du jeu pour la sauvegarde unique (sans la clé d'API). null si le jeu est indisponible. */
export async function gameBackup(): Promise<GameBackup | null> {
  const rt = gameRuntime();
  if (!rt) return null;
  await rt.bridge.idle();
  return rt.store.exportAll();
}

/** Vérifie la partie jeu d'une sauvegarde avant toute restauration. */
export function checkGameBackup(game: unknown): void {
  if (game !== undefined && (game as GameBackup | null)?.format !== "basse-lowend-backup") {
    throw new Error("La partie jeu de cette sauvegarde est illisible : rien n'a été restauré.");
  }
}

/** Restaure la partie jeu d'une sauvegarde. Sans partie jeu dans le fichier, la partie en cours est conservée. */
export async function restoreGameBackup(game: unknown): Promise<"restored" | "kept" | "unavailable"> {
  if (game === undefined) return "kept";
  const rt = gameRuntime();
  if (!rt) return "unavailable";
  await rt.bridge.idle();
  await rt.store.importAll(game as GameBackup);
  await rt.reload();
  return "restored";
}

export function MissionOutcome({ blockId }: { blockId: string }) {
  return (
    <GameSlot quiet>
      <MissionCell blockId={blockId} />
    </GameSlot>
  );
}

export function TeamTab() {
  return (
    <GameSlot>
      <TeamScreen />
    </GameSlot>
  );
}
