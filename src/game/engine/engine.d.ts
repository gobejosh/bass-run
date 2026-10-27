/**
 * Types du moteur LOW END (engine.js reste en JavaScript pur, partagé avec le simulateur).
 * Ce fichier décrit ce que l'app en utilise ; voir le document « LOW END — Conception du jeu parallèle ».
 */

export type Rarity = "recup" | "street" | "corpo" | "prototype" | "fantome";
export type ModRarity = Rarity | "none";
export type Stat = "PIR" | "CBT" | "MAT" | "SOC";
export type Slot = "arme" | "implant" | "outil";
export type RoleId = "netrunner" | "solo" | "techie" | "face";
export type Outcome = "critFail" | "fail" | "partial" | "success" | "critSuccess" | "aborted";
export type InjuryKind = "light" | "normal" | "severe";

export interface Effect {
  kind: string;
  stat?: Stat | "all";
  value: number;
  when?: { type?: string; stat?: Stat; crewMax?: number; tierMin?: number };
}

export interface Runner {
  id: string;
  role: RoleId;
  rarity: Rarity;
  level: number;
  xp: number;
  name: { first: string; handle: string; last: string };
  trait: string;
  talents: string[];
  pendingTalents: string[] | null;
  gear: Record<Slot, string | null>;
  injury: { kind: InjuryKind; blocksLeft: number } | null;
  avatarSeed: number;
  missions: number;
  successes: number;
  /** Candidats au recrutement seulement. */
  cost?: number;
}

export interface Item {
  id: string;
  slot: Slot;
  baseId: string;
  tier: number;
  rarity: Rarity;
  stats: Record<Stat, number>;
  affixes: (Effect & { id: string })[];
  signature: string | null;
  name: string;
  forged: { axis: string; blocks: number; exerciseId: string | null; tempo: number | null; standardTitle: string | null } | null;
}

export interface Contract {
  id: string;
  date: string;
  kind: "c" | "g" | "op";
  slot: string;
  tier: number;
  type: string;
  weights: Partial<Record<Stat, number>>;
  idealCrew: number;
  dcBase: number;
  complication: string | null;
  client: string;
  target: string;
  verb: string;
  rewardMult: number;
  gearRarityStep: number;
  stage?: number;
  taken: boolean;
}

export interface District {
  tier: number;
  name: string;
  faction: string;
  color: string;
  trait: string;
  revealed: boolean;
  alert: number;
  mapSeed: number;
}

export interface MissionSummary {
  blockId: string;
  date: string;
  kind: Contract["kind"];
  tier: number;
  type: string;
  outcome: Outcome;
  credits: number;
  rep: number;
  penalized?: boolean;
}

export interface GameState {
  version: number;
  seed: string;
  season: { start: string; end: string };
  credits: number;
  rep: number;
  maxTier: number;
  districts: District[];
  runners: Runner[];
  items: Record<string, Item>;
  inventory: string[];
  planque: Record<string, number>;
  board: { date: string; contracts: Contract[]; opAvailable: boolean } | null;
  candidates: Runner[];
  activeMission: { contract: Contract; squad: string[]; blockId: string } | null;
  grandCoup: { open: boolean; stage: number; done: boolean; lastAttemptDate: string | null };
  bestHeat: number;
  codex: unknown[];
  cosmetics: { owned: string[]; equipped: Record<string, string> };
  log: MissionSummary[];
  counters: {
    ids: number;
    blocksCompleted: number;
    blocksSinceForge: number;
    axisSinceForge: Record<string, number>;
    recruitRefresh: number;
    missions: number;
  };
}

export interface ReportEvent {
  kind: string;
  [k: string]: unknown;
}

export interface Evaluation {
  score: number;
  dc: number;
  alert: number;
  runnerRoll: number;
  envRoll: number;
  modBonus: number;
  exposure: number;
  modifier: number;
  perStat: Partial<Record<Stat, { lead: string; leadValue: number; supporter: string | null; support: number }>>;
  critAt: number;
  fumbleAt: number;
  ctx: { type: string; weights: Contract["weights"]; crew: number; tier: number };
}

export interface MissionReport {
  blockId: string;
  date: string;
  contract: Contract | null;
  squad: string[];
  events: ReportEvent[];
  outcome: Outcome | null;
  rewards: { credits: number; rep: number; xp: number; items: string[] };
  roll?: Evaluation & { dice: [number, number]; margin: number };
  catchUp?: { rep: number; xp: number };
  penalized?: boolean;
}

export type Odds = Record<Exclude<Outcome, "aborted">, number>;

/** Bloc tel que le moteur le lit. Jamais de standardTitle (anti-spoil). */
export interface EngineBlock {
  id: string;
  date: string;
  completed: boolean;
  modRarity: ModRarity;
  axis: string | null;
  exerciseId: string | null;
  tempo: number | null;
  xpBonusPct?: number;
  abandonPenalty?: boolean;
}

/** Tables JSON brutes (config/*.json). */
export interface RawConfig {
  core: any;
  roles: any;
  traits: any;
  districts: any;
  contracts: any;
  items: any;
  affixes: any;
  planque: any;
  names: any;
}

/** Configuration indexée par buildConfig(). */
export interface EngineConfig extends RawConfig {
  rarityById: Record<string, any>;
  rarityByRank: Record<number, any>;
  roleById: Record<string, any>;
  traitById: Record<string, any>;
  talentById: Record<string, any>;
  typeById: Record<string, any>;
  complicationById: Record<string, any>;
  baseById: Record<string, any>;
  affixById: Record<string, any>;
  signatureById: Record<string, any>;
  districtTraitById: Record<string, any>;
  tierDef: (t: number) => any;
  moduleById: Record<string, any>;
}

export interface EngineRng {
  next(): number;
  int(lo: number, hi: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  weighted(obj: any): any;
  shuffle<T>(arr: readonly T[]): T[];
}

export function hash32(...parts: unknown[]): number;
export function makeRng(seed: number): EngineRng;
export function buildConfig(raw: RawConfig): EngineConfig;
export function sumEffects(effects: Effect[], kind: string, ctx: unknown, stat?: Stat): number;
export function runnerEffects(state: GameState, cfg: EngineConfig, runner: Runner): Effect[];
export function runnerStats(state: GameState, cfg: EngineConfig, runner: Runner, effects?: Effect[]): Record<Stat, number>;
export function displayName(r: Runner): string;
export function newGame(cfg: EngineConfig, opts: { seed: string; seasonStart: string; seasonEnd: string }): GameState;
export function seasonFraction(state: GameState, date: string): number;
export function tierOpen(state: GameState, cfg: EngineConfig, tier: number, date: string): boolean;
export function catchUp(state: GameState, cfg: EngineConfig, date: string): { rep: number; xp: number };
export function getBoard(state: GameState, cfg: EngineConfig, date: string): NonNullable<GameState["board"]>;
export function getOpContract(state: GameState, cfg: EngineConfig, date: string): Contract | null;
export function makeGig(state: GameState, cfg: EngineConfig, date: string, blockId: string): Contract;
export function alertOf(state: GameState, contract: Contract): number;
export function evaluate(state: GameState, cfg: EngineConfig, contract: Contract, squadIds: string[], modRarity?: ModRarity): Evaluation;
export function odds(ev: Evaluation, cfg: EngineConfig): Odds;
export function availableRunners(state: GameState): Runner[];
export function suggestSquad(state: GameState, cfg: EngineConfig, contract: Contract, modRarity?: ModRarity): { ids: string[]; value: number; odds: Odds } | null;
export function xpToNext(cfg: EngineConfig, level: number): number;
export function chooseTalent(state: GameState, runnerId: string, talentId: string): boolean;
export function injure(state: GameState, cfg: EngineConfig, rng: EngineRng, runner: Runner, kind: InjuryKind, tier: number, events: ReportEvent[]): void;
export function startMission(state: GameState, contract: Contract, squadIds: string[], blockId: string): void;
export function endBlock(state: GameState, cfg: EngineConfig, block: EngineBlock): MissionReport;
export function forgeItem(state: GameState, cfg: EngineConfig, rng: EngineRng, block: EngineBlock): Item;
export function itemScore(cfg: EngineConfig, item: Item, runner: Runner): number;
export function equip(state: GameState, runnerId: string, itemId: string): void;
export function autoEquip(state: GameState, cfg: EngineConfig): void;
export function scrapItem(state: GameState, cfg: EngineConfig, itemId: string): number;
export function trimInventory(state: GameState, cfg: EngineConfig): number;
export function refreshCandidates(state: GameState, cfg: EngineConfig): void;
export function recruitCost(state: GameState, cfg: EngineConfig, r: Runner): number;
export function recruit(state: GameState, cfg: EngineConfig, candidateId: string, dismissId?: string | null): boolean;
export function upgradeCost(state: GameState, cfg: EngineConfig, item: Item): number | null;
export function upgradeItem(state: GameState, cfg: EngineConfig, itemId: string): boolean;
export function clinicCost(state: GameState, cfg: EngineConfig, runner: Runner): number;
export function heal(state: GameState, cfg: EngineConfig, runnerId: string): boolean;
export function buyModule(state: GameState, cfg: EngineConfig, moduleId: string): boolean;
export function narrativeInput(state: GameState, cfg: EngineConfig, report: MissionReport): NarrativeFacts;

export interface NarrativeFacts {
  contrat: {
    verbe: string;
    cible: string;
    type: string;
    client: string;
    quartier: string;
    faction: string;
    palier: number;
    complication: string | null;
    grandCoup: { etape: number; sur: number } | null;
    petitBoulot: boolean;
  };
  equipe: { nom: string; role: string; trait: string; niveau: number }[];
  issue: Outcome | null;
  jet: { des: [number, number]; marge: number; modVaincu: boolean } | null;
  blesses: { nom?: string; role?: string; trait?: string; niveau?: number; gravite: InjuryKind; blocs: number }[];
  butin: string[];
  credits: number;
}
