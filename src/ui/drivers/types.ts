import type { FC } from "react";
import type { BeatTick } from "../../audio/metronome";
import type { AppConfig } from "../../core/config";
import type { ResolvedMod } from "../../core/mods/resolve";
import type { Rng } from "../../core/rng";
import type { Dictionaries } from "../../core/theory/dictionaries";
import type { BlockRecord, ExerciseId } from "../../core/types";
import type { Repo } from "../../storage/repo";

/** Choix faits par toi au lancement, propres à certains exercices (mélodie, passage, standard…). */
export type LaunchChoice = Record<string, string | undefined>;

export interface PrepareContext {
  exerciseId: ExerciseId;
  cfg: AppConfig;
  dicts: Dictionaries;
  rng: Rng;
  repo: Repo;
  mod?: ResolvedMod;
  /** Tempo imposé au bloc (référence ± mod). */
  blockBpm: number;
  choice: LaunchChoice;
}

export interface Prepared {
  /** Paramètres tirés, enregistrés avec le bloc. */
  draws: Record<string, unknown>;
  /** Tempo de la mesure jouée n° i (MOD-01 progressif). Par défaut : tempo du bloc. */
  tempoAt?: (playedIndex: number) => number;
  beatsPerBar?: number;
  /** Mesures par chorus (4 par défaut : un tour d'accord). */
  chorusBars?: number;
  /** Préparation avant le métronome (déchiffrage), en secondes. */
  prepSeconds?: number;
  /** Mesures préremplies au débrief. */
  autoMeasures?: Record<string, number | string>;
}

export interface PanelProps {
  block: BlockRecord;
  draws: Record<string, unknown>;
  mod?: ResolvedMod;
  /** Dernier temps joué par le métronome (null avant le premier, ou sans métronome). */
  tick: BeatTick | null;
  cfg: AppConfig;
  dicts: Dictionaries;
  rng: Rng;
  paused: boolean;
  /** Phase de préparation (avant le métronome). */
  prep: boolean;
  /** Mesures par chorus, telles que fixées par prepare(). */
  chorusBars: number;
  /** L'exercice remonte des mesures automatiques pour le débrief. */
  report: (measures: Record<string, number | string>) => void;
}

export interface ExerciseDriver {
  prepare(ctx: PrepareContext): Promise<Prepared>;
  Panel: FC<PanelProps>;
  /** Choix demandés au lancement (ex. REP-01 : mélodie et passage). */
  Chooser?: FC<{ repo: Repo; choice: LaunchChoice; onChange: (c: LaunchChoice) => void }>;
}
