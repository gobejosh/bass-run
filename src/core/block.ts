/**
 * Cycle de vie d'un bloc, en fonctions pures.
 * Le stockage (storage/repo.ts) applique le résultat dans une seule transaction.
 */
import type { AppConfig } from "./config";
import type { BlockAbandonedEvent, BlockFinishedEvent, BlockStartedEvent, PublicMod } from "./events";
import { EVENTS_SCHEMA_VERSION } from "./events";
import { getMod } from "./mods/catalog";
import { lootMod, newId } from "./mods/drop";
import { updateInventory } from "./mods/inventory";
import type { Rng } from "./rng";
import type { BlockRecord, Debrief, EquippedMod, ExerciseId, LootState, ModInstance } from "./types";

export function equippedFrom(inst: ModInstance): EquippedMod {
  return { instanceId: inst.id, modId: inst.modId, name: getMod(inst.modId).name, rarity: inst.rarity, params: { ...inst.params } };
}

const publicMod = (m: { modId: string; rarity: EquippedMod["rarity"] }): PublicMod => ({
  modId: m.modId,
  name: getMod(m.modId).name,
  rarity: m.rarity,
});

export interface StartInput {
  exerciseId: ExerciseId;
  tempoKey: string;
  plannedMinutes: number;
  refBpm: number;
  targetBpm: number;
  mod?: ModInstance;
  draws: Record<string, unknown>;
  sessionBlockId?: string;
  now?: number;
  id?: string;
}

export function startBlock(input: StartInput): { block: BlockRecord; event: BlockStartedEvent } {
  const now = input.now ?? Date.now();
  const block: BlockRecord = {
    id: input.id ?? newId(),
    exerciseId: input.exerciseId,
    tempoKey: input.tempoKey,
    plannedMinutes: input.plannedMinutes,
    startedAt: now,
    status: "en_cours",
    refBpm: input.refBpm,
    targetBpm: input.targetBpm,
    draws: input.draws,
    ...(input.mod ? { mod: equippedFrom(input.mod) } : {}),
    ...(input.sessionBlockId ? { sessionBlockId: input.sessionBlockId } : {}),
  };
  return {
    block,
    event: {
      schema: EVENTS_SCHEMA_VERSION,
      type: "bloc_lance",
      eventId: newId(),
      at: now,
      blockId: block.id,
      exerciseId: block.exerciseId,
      plannedMinutes: block.plannedMinutes,
      mod: block.mod ? publicMod(block.mod) : null,
    },
  };
}

export interface FinishContext {
  inventory: readonly ModInstance[];
  lootState: LootState;
  /** Tempo de référence actuel de la clé du bloc (pour la règle des blocs moddés). */
  currentRefBpm?: number;
  rng: Rng;
  cfg: AppConfig;
  now?: number;
}

/** Nouveau tempo de référence après un débrief, ou undefined s'il ne change pas. */
export function nextRefBpm(
  cleanBpm: number | undefined,
  hasMod: boolean,
  currentRef: number | undefined,
  rule: AppConfig["tempo"]["moddedBlocksUpdateRef"],
): number | undefined {
  if (!cleanBpm || cleanBpm <= 0) return undefined;
  if (!hasMod || rule === "always") return cleanBpm;
  if (rule === "never") return undefined;
  return currentRef === undefined || cleanBpm > currentRef ? cleanBpm : undefined;
}

export interface FinishResult {
  block: BlockRecord;
  inventory: ModInstance[];
  lootState: LootState;
  loot: ModInstance;
  pity: boolean;
  /** Nouveau tempo de référence à enregistrer (absent si aucun tempo propre noté). */
  newRefBpm?: number;
  event: BlockFinishedEvent;
}

export function finishBlock(block: BlockRecord, debrief: Debrief, playedSeconds: number, ctx: FinishContext): FinishResult {
  if (block.status !== "en_cours") throw new Error(`Bloc ${block.id} déjà clos`);
  const now = ctx.now ?? Date.now();
  const { instance: loot, pity, next } = lootMod(ctx.rng, debrief.note, ctx.lootState, ctx.cfg, { now });
  const inventory = updateInventory(ctx.inventory, block.mod?.instanceId, "termine", loot);
  const done: BlockRecord = {
    ...block,
    status: "termine",
    endedAt: now,
    playedSeconds,
    debrief,
    loot: { instanceId: loot.id, modId: loot.modId, rarity: loot.rarity, params: loot.params },
  };
  const mod = block.mod ? publicMod(block.mod) : null;
  const newRefBpm = nextRefBpm(debrief.cleanBpm, !!block.mod, ctx.currentRefBpm, ctx.cfg.tempo.moddedBlocksUpdateRef);
  return {
    block: done,
    inventory,
    lootState: next,
    loot,
    pity,
    ...(newRefBpm !== undefined ? { newRefBpm } : {}),
    event: {
      schema: EVENTS_SCHEMA_VERSION,
      type: "bloc_termine",
      eventId: newId(),
      at: now,
      blockId: block.id,
      exerciseId: block.exerciseId,
      note: debrief.note,
      playedSeconds,
      mod,
      modVaincu: mod !== null,
      bonusXpPct: mod ? ctx.cfg.xpBonusPct[mod.rarity] : 0,
      loot: publicMod(loot),
    },
  };
}

export function abandonBlock(block: BlockRecord, playedSeconds: number, now = Date.now()): { block: BlockRecord; event: BlockAbandonedEvent } {
  if (block.status !== "en_cours") throw new Error(`Bloc ${block.id} déjà clos`);
  return {
    block: { ...block, status: "abandonne", endedAt: now, playedSeconds },
    event: {
      schema: EVENTS_SCHEMA_VERSION,
      type: "bloc_abandonne",
      eventId: newId(),
      at: now,
      blockId: block.id,
      exerciseId: block.exerciseId,
      playedSeconds,
      mod: block.mod ? publicMod(block.mod) : null,
    },
  };
}

/**
 * Palier avancé MAN-03 : sur les N derniers blocs MAN-03 terminés, note ≥ minNote
 * et temps de réaction moyen ≤ maxAvgReactionSec pour chacun.
 */
export function isMan03Advanced(history: readonly BlockRecord[], cfg: AppConfig): boolean {
  const { lastBlocks, maxAvgReactionSec, minNote } = cfg.man03.advanced;
  const recent = history
    .filter((b) => b.exerciseId === "MAN-03" && b.status === "termine" && !b.mod)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    .slice(0, lastBlocks);
  if (recent.length < lastBlocks) return false;
  return recent.every((b) => {
    const r = Number(b.debrief?.measures.reactionMoy);
    return (b.debrief?.note ?? 0) >= minNote && Number.isFinite(r) && r > 0 && r <= maxAvgReactionSec;
  });
}
