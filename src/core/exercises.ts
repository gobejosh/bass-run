import type { ExerciseId } from "./types";

export type Axis = "MAN" | "WLK" | "MOD" | "IMP" | "RYT" | "EAR" | "REP" | "DEC";

export const AXIS_LABEL: Record<Axis, string> = {
  MAN: "Connaissance du manche et théorie",
  WLK: "Walking",
  MOD: "Modes",
  IMP: "Improvisation",
  RYT: "Rythme",
  EAR: "Ear Training",
  REP: "Répertoire",
  DEC: "Déchiffrage",
};

/** Libellés courts (barres, réglages). */
export const AXIS_SHORT: Record<Axis, string> = {
  MAN: "Manche", WLK: "Walking", MOD: "Modes", IMP: "Impro", RYT: "Rythme", EAR: "Oreille", REP: "Répertoire", DEC: "Déchiffrage",
};

export interface MeasureField {
  key: string;
  label: string;
  kind: "int" | "decimal" | "text" | "select";
  unit?: string;
  options?: string[];
  /** Prérempli par l'app à partir du déroulé du bloc (modifiable). */
  auto?: boolean;
}

export interface ExerciseDef {
  id: ExerciseId;
  axis: Axis;
  name: string;
  consigne: string;
  /** Métronome actif par défaut. */
  metronome: boolean;
  /** Le débrief demande un tempo propre (devient le tempo de référence). */
  asksCleanBpm: boolean;
  /** Mesures propres à l'exercice, en plus de la note et du tempo. */
  measures: MeasureField[];
  /** Données nécessaires (pour signaler ce qui manque avant le lancement). */
  needs?: ("grids" | "unknownBank" | "passages")[];
}

const CHORUS: MeasureField = { key: "chorus", label: "Chorus enchaînés sans perdre la forme", kind: "int" };
const DEC_MEASURES: MeasureField[] = [
  { key: "arrets", label: "Nombre d'arrêts", kind: "int" },
  { key: "mesuresPerdues", label: "Mesures perdues", kind: "int" },
];

export const EXERCISES: readonly ExerciseDef[] = [
  {
    id: "MAN-01", axis: "MAN", name: "Localisation d'une note",
    consigne: "Joue la note affichée sur chacune des 5 cordes dans le temps imparti.",
    metronome: true, asksCleanBpm: true,
    measures: [
      { key: "notes", label: "Notes présentées", kind: "int", auto: true },
      { key: "cordesTrouvees", label: "Cordes trouvées dans le temps (total)", kind: "int" },
    ],
  },
  {
    id: "MAN-02", axis: "MAN", name: "Mode nommé",
    consigne: "Joue le mode dans le sens indiqué en prononçant chaque note avec son altération.",
    metronome: true, asksCleanBpm: true, measures: [],
  },
  {
    id: "MAN-03", axis: "MAN", name: "Note d'accord réflexe",
    consigne: "Joue la note demandée le plus vite possible, puis tape l'écran (ou Espace).",
    metronome: true, asksCleanBpm: true,
    measures: [
      { key: "reactionMoy", label: "Temps de réaction moyen", kind: "decimal", unit: "s", auto: true },
      { key: "questions", label: "Questions", kind: "int", auto: true },
      { key: "rates", label: "Hors délai", kind: "int", auto: true },
    ],
  },
  {
    id: "WLK-01", axis: "WLK", name: "Walk sur 1 accord",
    consigne: "Joue une ligne de walking bass sur l'accord.",
    metronome: true, asksCleanBpm: true, measures: [],
  },
  {
    id: "WLK-02", axis: "WLK", name: "Walk sur un fragment de grille",
    consigne: "Joue une ligne de walking bass sur le fragment.",
    metronome: true, asksCleanBpm: true, measures: [], needs: ["grids"],
  },
  {
    id: "WLK-03", axis: "WLK", name: "Walk sur une grille entière",
    consigne: "Joue une ligne de walking bass sur toute la grille.",
    metronome: true, asksCleanBpm: true, measures: [CHORUS], needs: ["grids"],
  },
  {
    id: "MOD-01", axis: "MOD", name: "Motif modal à tempo progressif",
    consigne: "Joue le motif à travers le mode, depuis la tonique, en montant le tempo par paliers.",
    metronome: true, asksCleanBpm: true, measures: [],
  },
  {
    id: "IMP-01", axis: "IMP", name: "Impro sur 1 accord",
    consigne: "Improvise sur l'accord.",
    metronome: true, asksCleanBpm: true, measures: [],
  },
  {
    id: "IMP-02", axis: "IMP", name: "Impro sur un fragment de grille",
    consigne: "Improvise sur le fragment.",
    metronome: true, asksCleanBpm: true, measures: [], needs: ["grids"],
  },
  {
    id: "IMP-03", axis: "IMP", name: "Impro sur une grille entière",
    consigne: "Improvise sur toute la grille.",
    metronome: true, asksCleanBpm: true, measures: [CHORUS], needs: ["grids"],
  },
  {
    id: "RYT-01", axis: "RYT", name: "Exercices Ritmica",
    consigne: "Bloc minuté (contenu à définir en V2).",
    metronome: true, asksCleanBpm: true, measures: [],
  },
  {
    id: "EAR-01", axis: "EAR", name: "Travail sur outil externe",
    consigne: "Travaille sur ton outil d'ear training, puis reporte son résultat.",
    metronome: false, asksCleanBpm: false,
    measures: [{ key: "resultat", label: "Résultat donné par l'outil", kind: "text" }],
  },
  {
    id: "REP-01", axis: "REP", name: "Mélodies imposées",
    consigne: "Travaille le passage de la mélodie imposée.",
    metronome: true, asksCleanBpm: true,
    measures: [
      { key: "passage", label: "Passage travaillé", kind: "text", auto: true },
      { key: "palier", label: "Palier de maîtrise", kind: "select", options: ["decouverte", "en-place", "fiable", "maitrise"] },
    ],
    needs: ["passages"],
  },
  {
    id: "DEC-01", axis: "DEC", name: "Walking à vue",
    consigne: "Joue une walking bass sur la grille du standard inconnu.",
    metronome: true, asksCleanBpm: true, measures: DEC_MEASURES, needs: ["unknownBank"],
  },
  {
    id: "DEC-02", axis: "DEC", name: "Thème à vue",
    consigne: "Joue le thème du standard inconnu.",
    metronome: true, asksCleanBpm: true, measures: DEC_MEASURES, needs: ["unknownBank"],
  },
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
export function getExercise(id: ExerciseId): ExerciseDef {
  return BY_ID.get(id)!;
}
