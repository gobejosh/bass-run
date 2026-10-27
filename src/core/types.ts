/** Modèle de données de la partie musicale. */

export const EXERCISE_IDS = [
  "MAN-01", "MAN-02", "MAN-03",
  "WLK-01", "WLK-02", "WLK-03",
  "MOD-01",
  "IMP-01", "IMP-02", "IMP-03",
  "RYT-01", "EAR-01",
  "REP-01",
  "DEC-01", "DEC-02",
] as const;
export type ExerciseId = (typeof EXERCISE_IDS)[number];

export const RARITIES = ["recup", "street", "corpo", "prototype", "fantome"] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_LABEL: Record<Rarity, string> = {
  recup: "Récup",
  street: "Street",
  corpo: "Corpo",
  prototype: "Prototype",
  fantome: "Fantôme",
};

export type RarityTable = Record<Rarity, number>;

/* ------------------------------------------------------------------ mods */

export type ModType = "simple" | "intensity";

/**
 * Qui fait respecter la contrainte.
 * - app : l'app la met en œuvre elle-même (métronome, masquage, tirages, chrono, transposition…)
 * - consigne : simple consigne affichée, c'est toi qui la respectes (ex. Black-out)
 * - mixte : certains niveaux sont appliqués par l'app, d'autres non
 * Dans tous les cas, le tempo du bloc est calculé et imposé par l'app.
 */
export type Enforcement = "app" | "consigne" | "mixte";

/** Comportement du clic, mesure par mesure. */
export interface MetronomeEffect {
  /** Temps qui cliquent (1 = premier temps). Absent : tous les temps. */
  beats?: number[];
  /** Le clic ne sonne qu'une mesure sur N ; les autres sont muettes. */
  everyNBars?: number;
  /** Coupures aléatoires : à chaque mesure cliquée, probabilité de lancer une coupure de min..max mesures. */
  dropouts?: { min: number; max: number; chancePerBar: number };
}

export type NoteValue = "blanches" | "noires" | "croches" | "triolets";

/** Effets machine d'un niveau de mod. Tous facultatifs ; l'app applique ceux qu'elle connaît. */
export interface ModEffects {
  metronome?: MetronomeEffect;
  /** Figure rythmique imposée (affichée ; le tempo, lui, est appliqué). */
  noteValue?: NoteValue;
  /** Chrono serré : multiplicateur du temps limite. */
  timeLimitFactor?: number;
  /** Mémoire vive. */
  hide?:
    | { mode: "after_first_chorus" }
    | { mode: "preview"; seconds: number }
    | { mode: "title_only"; randomKey?: boolean };
  /** Transposition, en distance sur le cycle des quintes (nombre d'altérations d'écart). */
  transpose?:
    | { mode: "distance"; min: number; max: number }
    | { mode: "any" }
    | { mode: "each_chorus" };
  /** Endurance : nombre de chorus à enchaîner (compteur affiché). */
  choruses?: number;
  /** Enharmonie : orthographe des notes tirées. */
  spelling?: "alternate" | "flats" | "edge" | "double_rare" | "double_frequent";
  /** Toutes positions : case maximale couverte (null = tout le manche). */
  maxFret?: number | null;
  /** Sur le temps : fenêtre de réponse calée sur le métronome. */
  beatWindow?: { beats: number } | { next: "beat" | "offbeat" };
  /** Arpège réflexe. */
  arpeggio?: { notes: 3 | 4; octaves: 1 | 2; roundTrip: boolean };
  /** Extensions : fonctions tirées en MAN-03. */
  functions?: string[];
  /** Cycle des quartes : la tonique monte d'une quarte toutes les N mesures. */
  fourthsEveryBars?: number;
  /** Rétrograde : 1 répétition sur N à l'envers, ou sens tiré et annoncé à chaque répétition. */
  retrograde?: { oneIn: number } | { announced: true };
  /** Palette réduite : nombre de notes tirées. */
  paletteSize?: number;
  /** Question-réponse : alternance N mesures de jeu / N de silence. */
  callResponse?: { bars: number; echoRhythm?: boolean };
  /** Motif imposé : durée sur laquelle développer le motif rythmique tiré. */
  rhythmMotifSpan?: { bars: number } | { choruses: number } | { wholeBlock: true };
  /** Tirages faits au lancement du bloc (sans crochets dans la spec). */
  launchDraws?: LaunchDraw[];
  /** Annonces faites par l'app pendant le bloc. */
  liveAnnounce?: LiveAnnounce;
}

export type LaunchDraw = "sens" | "cible";

export type LiveAnnounce =
  | { kind: "cible"; everyBars: number }            // Fondamentale interdite, Prototype
  | { kind: "bascule-two-four"; randomBetweenBars: [number, number] }; // Two-feel, Prototype

export interface ModLevel {
  /** Texte de la spec, mot pour mot. */
  label: string;
  /** Variation du tempo de référence en % (0 = tempo de référence). */
  tempoPct: number;
  effects?: ModEffects;
  /** Ce niveau est-il appliqué par l'app (au-delà du tempo) ? */
  enforcement: "app" | "consigne";
}

export interface DropParamSpec {
  /** Nom du paramètre (ex. "corde"). */
  key: string;
  /** Valeurs possibles. */
  values: string[];
  /** Raretés où ce paramètre existe (absent : toutes). */
  rarities?: Rarity[];
}

export type UnlockRule = "man03-avance" | "rep-fiable";

export interface ModDef {
  id: string;
  name: string;
  constraint: string;
  type: ModType;
  exercises: ExerciseId[];
  enforcement: Enforcement;
  dropParams: DropParamSpec[];
  unlock: UnlockRule | null;
  levels: Record<Rarity, ModLevel>;
}

/** Un mod possédé. */
export interface ModInstance {
  id: string;
  modId: string;
  rarity: Rarity;
  /** Paramètres entre crochets, tirés au drop. */
  params: Record<string, string>;
  usesLeft: number;
  obtainedAt: number;
}

/* ------------------------------------------------------------------ blocs */

export type BlockStatus = "en_cours" | "termine" | "abandonne";

export interface Debrief {
  /** Auto-évaluation 1..5. */
  note: 1 | 2 | 3 | 4 | 5;
  /** Tempo propre atteint (devient le tempo de référence). Absent pour EAR-01. */
  cleanBpm?: number;
  /** Mesures propres à l'exercice (clé définie dans la fiche). */
  measures: Record<string, number | string>;
  comment?: string;
}

/** Copie figée du mod équipé au moment du lancement. */
export interface EquippedMod {
  instanceId: string;
  modId: string;
  name: string;
  rarity: Rarity;
  params: Record<string, string>;
}

export interface BlockRecord {
  id: string;
  exerciseId: ExerciseId;
  /** Clé du tempo de référence (exercice, ou exercice + passage pour REP-01). */
  tempoKey: string;
  plannedMinutes: number;
  startedAt: number;
  endedAt?: number;
  /** Durée effectivement jouée, pauses exclues (secondes). */
  playedSeconds?: number;
  status: BlockStatus;
  mod?: EquippedMod;
  /** Tempo de référence au lancement et tempo imposé au bloc. */
  refBpm: number;
  targetBpm: number;
  /** Paramètres tirés pour l'exercice et pour le mod au lancement. */
  draws: Record<string, unknown>;
  debrief?: Debrief;
  /** Bloc de la séance du jour que ce bloc réalise (absent : bloc libre). Jamais transmis au jeu. */
  sessionBlockId?: string;
  loot?: { instanceId: string; modId: string; rarity: Rarity; params: Record<string, string> };
}

export interface LootState {
  /** Drops consécutifs sans Prototype ni Fantôme. */
  dropsSinceHigh: number;
}
