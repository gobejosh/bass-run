/**
 * Configuration par défaut.
 *
 * Toutes les valeurs provisoires et toutes les décisions prises sur les « points à préciser »
 * de la spec vivent ici (voir docs/DECISIONS.md pour la justification de chacune).
 * Les surcharges saisies dans l'écran Réglages sont fusionnées par-dessus (deepMerge).
 */
import type { Axis } from "./exercises";
import type { PieceStatus } from "./repertoire";
import type { ExerciseId, Rarity, RarityTable } from "./types";

export interface AppConfig {
  display: {
    /** Noms de notes et d'accords : « fr » (Ré m7) ou « en » (Dm7). */
    notation: "fr" | "en";
  };
  instrument: {
    /** Cordes du grave à l'aigu : nom affiché + hauteur MIDI à vide. */
    strings: { name: string; midi: number }[];
    /** Nombre de cases du manche. */
    frets: number;
  };
  loot: {
    /** Table de drop selon la note d'auto-évaluation (pourcentages). */
    dropTable: { low: RarityTable; four: RarityTable; five: RarityTable };
    /** Après N drops consécutifs sans Prototype ou mieux, le suivant est au moins Prototype. */
    pityThreshold: number;
    usesPerMod: number;
  };
  /** Bonus d'XP du mod vaincu selon sa rareté (%, provisoire). */
  xpBonusPct: Record<Rarity, number>;
  tempo: {
    minBpm: number;
    maxBpm: number;
    /** Tempo de référence initial tant qu'aucun débrief n'en a fixé un. */
    initialRefBpm: Record<ExerciseId, number>;
    /**
     * Effet d'un bloc moddé sur le tempo de référence.
     * - "raise-only" : il peut le faire monter, jamais baisser (évite qu'un Black-out à -30 % tire la référence vers le bas)
     * - "always" : lecture littérale de la spec, le dernier tempo propre noté fait foi
     * - "never" : seuls les blocs sans mod comptent
     */
    moddedBlocksUpdateRef: "raise-only" | "always" | "never";
  };
  block: {
    defaultMinutes: number;
    beatsPerBar: number;
    /** Mesures de décompte jouées en entier avant que les mods ne s'appliquent. */
    countInBars: number;
    /** Autoriser « Terminer maintenant » avant l'échéance (sinon : seulement Abandonner). */
    allowEarlyFinish: boolean;
  };
  man01: {
    /** Temps limite pour trouver la note sur les 5 cordes (secondes). */
    timeLimitSec: number;
    /** Case maximale prise en compte sans mod. */
    maxFret: number;
  };
  man02: {
    octaves: 1 | 2;
    /** Variante enchaînement : nombre d'accords consécutifs pris dans la grille. */
    chainLength: { min: number; max: number };
    /** Familles de modes tirées. */
    families: ("majeur" | "mineur-melodique" | "mineur-harmonique")[];
  };
  man03: {
    /** Délai au-delà duquel la réponse compte comme ratée (secondes). */
    timeoutSec: number;
    /** Palier avancé (débloque Extensions) : sur les N derniers blocs MAN-03 terminés… */
    advanced: { lastBlocks: number; maxAvgReactionSec: number; minNote: number };
  };
  chords: {
    /** Qualités tirées par défaut (identifiants du dictionnaire). */
    enabledQualities: string[];
  };
  mod01: {
    /** Rétrograde Fantôme : une répétition = N mesures. */
    repetitionBars: number;
    /** Tempo de départ en % du tempo du bloc, pas en BPM, toutes les N mesures, plafond en % du tempo du bloc. */
    startPct: number;
    stepBpm: number;
    stepEveryBars: number;
    capPct: number;
  };
  rep01: {
    /** Seuils des paliers en % du tempo cible du passage. */
    tiers: { enPlacePct: number; fiablePct: number; maitrisePct: number };
    /** Longueur d'un « chorus » quand le passage n'a pas de mesures de début et de fin. */
    defaultPassageBars: number;
  };
  dec: {
    /** Temps de préparation avant le démarrage du métronome (secondes). */
    prepSeconds: number;
  };
  /** Séances générées (voir core/session.ts et docs/DECISIONS.md, étape 4). */
  session: {
    /** Durée d'un bloc de séance (minutes jouées). */
    blockMinutes: number;
    /** Pause chronométrée entre deux blocs (minutes, 0 = aucune). Non comptée dans l'objectif. */
    pauseMinutes: number;
    /** En dessous, un reste de temps n'est pas un bloc : il allonge le dernier. */
    minBlockMinutes: number;
    /** Premier bloc du jour pris dans cet axe (null : aucun). */
    openingAxis: Axis | null;
    /** Part cible du temps hebdomadaire par axe (proportions, normalisées). 0 : jamais proposé par l'équilibre. */
    axisShares: Record<Axis, number>;
    /** Priorité par axe : −1 moins, 0 normal, +1 plus. */
    axisPriority: Partial<Record<Axis, -1 | 0 | 1>>;
    /** Poids d'un cran de priorité sur le retard d'un axe (0,5 = ±50 %). */
    priorityWeight: number;
    /** Un devoir entre dans les séances quand son échéance est à N jours ou moins. */
    homeworkHorizonDays: number;
    /** Part maximale d'une séance consacrée aux devoirs (au moins un bloc s'il y en a). */
    homeworkMaxShare: number;
    /** Blocs par devoir et par séance, au plus. */
    homeworkBlocksPerPiece: number;
    /** Un morceau su devient « à entretenir » après N jours sans être joué. */
    maintenanceAfterDays: number;
    /** Blocs d'entretien au plus par séance. */
    maintenancePerDay: number;
    /** Statuts des morceaux proposés par l'équilibre et le tirage « au hasard ». */
    drawStatuses: PieceStatus[];
    /** Exercices jamais proposés par le générateur (tu peux toujours les lancer à la main). */
    excludedExercises: ExerciseId[];
    /** Son doux à la fin d'une pause. */
    pauseChime: boolean;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  display: { notation: "fr" },
  instrument: {
    strings: [
      { name: "Si", midi: 23 },
      { name: "Mi", midi: 28 },
      { name: "La", midi: 33 },
      { name: "Ré", midi: 38 },
      { name: "Sol", midi: 43 },
    ],
    frets: 24,
  },
  loot: {
    dropTable: {
      low: { recup: 40, street: 30, corpo: 18, prototype: 9, fantome: 3 },
      four: { recup: 30, street: 30, corpo: 22, prototype: 13, fantome: 5 },
      five: { recup: 20, street: 30, corpo: 26, prototype: 17, fantome: 7 },
    },
    pityThreshold: 15,
    usesPerMod: 3,
  },
  xpBonusPct: { recup: 10, street: 20, corpo: 35, prototype: 50, fantome: 75 },
  tempo: {
    minBpm: 30,
    maxBpm: 400,
    initialRefBpm: {
      "MAN-01": 60, "MAN-02": 80, "MAN-03": 60,
      "WLK-01": 120, "WLK-02": 120, "WLK-03": 120,
      "MOD-01": 80,
      "IMP-01": 120, "IMP-02": 120, "IMP-03": 120,
      "RYT-01": 80, "EAR-01": 0,
      "REP-01": 100,
      "DEC-01": 110, "DEC-02": 90,
    },
    moddedBlocksUpdateRef: "raise-only",
  },
  block: { defaultMinutes: 10, beatsPerBar: 4, countInBars: 1, allowEarlyFinish: false },
  man01: { timeLimitSec: 12, maxFret: 12 },
  man02: { octaves: 1, chainLength: { min: 4, max: 8 }, families: ["majeur"] },
  man03: { timeoutSec: 5, advanced: { lastBlocks: 3, maxAvgReactionSec: 2.0, minNote: 4 } },
  chords: { enabledQualities: ["maj7", "6", "7", "m7", "m6", "mMaj7", "m7b5", "dim7", "7sus4"] },
  mod01: { repetitionBars: 2, startPct: 70, stepBpm: 4, stepEveryBars: 8, capPct: 110 },
  rep01: { tiers: { enPlacePct: 60, fiablePct: 85, maitrisePct: 100 }, defaultPassageBars: 16 },
  dec: { prepSeconds: 60 },
  session: {
    blockMinutes: 25,
    pauseMinutes: 5,
    minBlockMinutes: 10,
    openingAxis: "MAN",
    axisShares: { MAN: 15, WLK: 20, MOD: 10, IMP: 15, RYT: 10, EAR: 5, REP: 15, DEC: 10 },
    axisPriority: {},
    priorityWeight: 0.5,
    homeworkHorizonDays: 7,
    homeworkMaxShare: 0.5,
    homeworkBlocksPerPiece: 1,
    maintenanceAfterDays: 21,
    maintenancePerDay: 1,
    drawStatuses: ["a-apprendre", "en-cours", "su"],
    excludedExercises: [],
    pauseChime: true,
  },
};

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);

/** Fusion profonde : les tableaux et scalaires de `over` remplacent ceux de `base`. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isPlain(base) || !isPlain(over)) return (over === undefined ? base : (over as T));
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export function resolveConfig(overrides?: unknown): AppConfig {
  return overrides ? deepMerge(DEFAULT_CONFIG, overrides) : DEFAULT_CONFIG;
}
