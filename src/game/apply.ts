/**
 * Application d'un événement musical à la partie (fonction pure : renvoie une copie).
 *
 * Seuls les champs publics de l'événement sont lus : identifiants, type, horodatage, exercice,
 * mod équipé et sa rareté, mod vaincu, bonus d'XP. Ni note, ni tempo, ni titre : la note
 * n'entre jamais dans la résolution, et aucun titre de standard ne doit atteindre le jeu.
 */
import type { PublicEvent } from "../core/events";
import * as E from "./engine";
import type { Contract, EngineBlock, EngineConfig, GameState, ModRarity, MissionReport } from "./engine";
import {
  axisOf,
  INTENT_TTL_MS,
  localDate,
  SUPPORTED_EVENT_SCHEMAS,
  type GameRecord,
  type GameSettings,
  type Intent,
  type ProcessedStatus,
  type StoredReport,
} from "./model";
import { abortedNarrative, fallbackNarrative } from "./narrative";

export interface ApplyResult {
  record: GameRecord;
  status: ProcessedStatus;
  reason?: string;
  report?: StoredReport;
  /** L'intention armée a été consommée (à effacer). */
  intentConsumed: boolean;
}

export interface ApplyContext {
  cfg: EngineConfig;
  settings: GameSettings;
}

/** Rareté du mod équipé, telle que la mission la voit au lancement (chances affichées). */
const equippedRarity = (e: PublicEvent): ModRarity => e.mod?.rarity ?? "none";

/** Le contrat que la mission prend quand rien n'a été choisi : standard, sinon sûr, sinon petit boulot. Jamais le risqué. */
export function defaultContract(state: GameState, cfg: EngineConfig, date: string, blockId: string): Contract {
  const board = E.getBoard(state, cfg, date);
  for (const slot of ["standard", "sur"]) {
    const c = board.contracts.find((x) => x.slot === slot && !x.taken);
    if (c) return c;
  }
  return E.makeGig(state, cfg, date, blockId);
}

/** Toutes les cartes jouables aujourd'hui (contrats non pris, opération du Grand Coup si ouverte). */
export function openContracts(state: GameState, cfg: EngineConfig, date: string): Contract[] {
  const board = E.getBoard(state, cfg, date);
  const op = E.getOpContract(state, cfg, date);
  return [...board.contracts.filter((c) => !c.taken), ...(op ? [op] : [])];
}

function intentValid(intent: Intent | null, at: number, date: string): intent is Intent {
  return !!intent && intent.date === date && at - intent.armedAt <= INTENT_TTL_MS && intent.armedAt <= at + 5_000;
}

/** Ferme une mission restée liée à un bloc dont on n'a jamais reçu la fin (sans pénalité). */
function closeStale(state: GameState, cfg: EngineConfig, date: string): MissionReport | null {
  const m = state.activeMission;
  if (!m) return null;
  return E.endBlock(state, cfg, { id: m.blockId, date, completed: false, modRarity: "none", axis: null, exerciseId: null, tempo: null });
}

function storedReport(state: GameState, cfg: EngineConfig, e: PublicEvent, report: MissionReport): StoredReport {
  const items = report.rewards.items
    .map((id) => state.items[id])
    .filter((it): it is NonNullable<typeof it> => !!it)
    .map((it) => ({ id: it.id, name: it.name, rarity: it.rarity, slot: it.slot }));
  const hasMission = !!report.contract && report.outcome !== null;
  const facts = hasMission && report.outcome !== "aborted" ? E.narrativeInput(state, cfg, report) : null;
  return {
    blockId: e.blockId,
    at: e.at,
    type: e.type === "bloc_termine" ? "bloc_termine" : "bloc_abandonne",
    report,
    items,
    facts,
    narrative: report.outcome === "aborted" ? abortedNarrative(!!report.penalized) : facts ? fallbackNarrative(facts, `${state.seed}|${e.blockId}`) : null,
  };
}

export function applyEvent(input: GameRecord, e: Readonly<PublicEvent>, intent: Intent | null, ctx: ApplyContext): ApplyResult {
  const { cfg, settings } = ctx;
  if (!SUPPORTED_EVENT_SCHEMAS.includes(e.schema)) {
    return { record: input, status: "unsupported", reason: `schéma ${String(e.schema)} inconnu`, intentConsumed: false };
  }
  if (e.at < input.createdAt) {
    return { record: input, status: "ignored", reason: "antérieur à la partie", intentConsumed: false };
  }

  const record: GameRecord = structuredClone(input);
  const state = record.state;
  const date = localDate(e.at);
  record.cursorAt = Math.max(record.cursorAt, e.at);

  // Une mission liée à un autre bloc ne peut plus aboutir : la partie musicale n'a qu'un bloc ouvert à la fois.
  if (state.activeMission && state.activeMission.blockId !== e.blockId) closeStale(state, cfg, date);

  switch (e.type) {
    case "bloc_lance": {
      if (state.activeMission?.blockId === e.blockId) return { record, status: "ignored", reason: "mission déjà liée", intentConsumed: false };
      const choice = intentValid(intent, e.at, date) ? intent : null;
      const mode = choice?.kind ?? (settings.defaultMission === "none" ? "none" : settings.defaultMission === "gig" ? "gig" : "auto");
      if (mode === "none") return { record, status: "applied", reason: "sans mission", intentConsumed: !!intent };

      let contract: Contract;
      if (choice?.kind === "contract") {
        contract = openContracts(state, cfg, date).find((c) => c.id === choice.contractId) ?? defaultContract(state, cfg, date, e.blockId);
      } else if (mode === "gig") {
        contract = E.makeGig(state, cfg, date, e.blockId);
      } else {
        contract = defaultContract(state, cfg, date, e.blockId);
      }
      const available = new Set(E.availableRunners(state).map((r) => r.id));
      let squad = choice?.kind === "contract" && contract.id === choice.contractId ? choice.squad.filter((id) => available.has(id)) : [];
      squad = squad.slice(0, cfg.core.squad.max as number);
      if (squad.length === 0) squad = E.suggestSquad(state, cfg, contract, equippedRarity(e))?.ids ?? [];
      if (squad.length === 0) return { record, status: "applied", reason: "toute l'équipe est blessée", intentConsumed: !!intent };
      E.startMission(state, contract, squad, e.blockId);
      return { record, status: "applied", intentConsumed: !!intent };
    }

    case "bloc_termine": {
      const block: EngineBlock = {
        id: e.blockId,
        date,
        completed: true,
        modRarity: e.modVaincu && e.mod ? e.mod.rarity : "none",
        axis: axisOf(e.exerciseId),
        exerciseId: e.exerciseId,
        tempo: null,
        xpBonusPct: cfg.core.modXpBonus?.apply && e.modVaincu ? e.bonusXpPct : 0,
      };
      const report = E.endBlock(state, cfg, block);
      record.windowUntil = e.at + (cfg.core.debrief.windowSeconds as number) * 1000;
      return { record, status: "applied", report: storedReport(state, cfg, e, report), intentConsumed: false };
    }

    case "bloc_abandonne": {
      const before = record.abandons.date === date ? record.abandons.count : 0;
      record.abandons = { date, count: before + 1 };
      if (state.activeMission?.blockId !== e.blockId) return { record, status: "applied", reason: "sans mission", intentConsumed: false };
      const free = (cfg.core.abandon?.freePerDay as number | undefined) ?? Infinity;
      const block: EngineBlock = {
        id: e.blockId,
        date,
        completed: false,
        modRarity: "none",
        axis: axisOf(e.exerciseId),
        exerciseId: e.exerciseId,
        tempo: null,
        abandonPenalty: before >= free,
      };
      const report = E.endBlock(state, cfg, block);
      return { record, status: "applied", report: storedReport(state, cfg, e, report), intentConsumed: false };
    }
  }
}

/** Nouvelle partie. La saison commence le jour de création. */
export function newRecord(cfg: EngineConfig, settings: GameSettings, now: number, seed: string): GameRecord {
  const start = localDate(now);
  const end = settings.seasonEnd > start ? settings.seasonEnd : `${Number(start.slice(0, 4)) + 1}-06-30`;
  return {
    version: 1,
    createdAt: now,
    state: E.newGame(cfg, { seed, seasonStart: start, seasonEnd: end }),
    cursorAt: now,
    abandons: { date: start, count: 0 },
    windowUntil: null,
  };
}
