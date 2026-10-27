/** Données saisies ou importées par toi : standards, banque inconnue, mélodies. */
export type { Dictionaries } from "./theory/dictionaries";

/** Tonalité : tonique écrite (« Fa », « Sib », « Eb ») + majeur/mineur. */
export interface KeySig {
  tonic: string;
  minor: boolean;
}

/** Grille : une entrée par mesure, chaque mesure contient 1 ou plusieurs symboles d'accords. */
export type Grid = string[][];

export interface Standard {
  id: string;
  title: string;
  key: KeySig;
  beatsPerBar: number;
  grid: Grid;
  createdAt: number;
}

export type BankStatus = "jamais_tire" | "tire";

export interface UnknownStandard {
  id: string;
  status: BankStatus;
  importedAt: number;
  drawnAt?: number;
  title: string;
  key?: KeySig;
  beatsPerBar: number;
  grid?: Grid;
  /** Partition du thème (fichier importé), pour DEC-02. */
  themeBlobId?: string;
}

export const TIERS = ["decouverte", "en-place", "fiable", "maitrise"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_LABEL: Record<Tier, string> = {
  decouverte: "Découverte",
  "en-place": "En place",
  fiable: "Fiable",
  maitrise: "Maîtrisé",
};

export interface Passage {
  id: string;
  label: string;
  /** Mesures de début et de fin (facultatif). */
  fromBar?: number;
  toBar?: number;
  /** Tempo visé pour ce passage (sert au calcul des paliers). */
  targetBpm?: number;
  tier: Tier;
}

export interface Melody {
  id: string;
  title: string;
  /** Tonalité d'écriture (facultative, sert à Transposition). */
  key?: KeySig;
  /** Temps par mesure (4 par défaut). */
  beatsPerBar?: number;
  scoreBlobId?: string;
  passages: Passage[];
  createdAt: number;
}
