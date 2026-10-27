import { useEffect, useState } from "react";
import { EXERCISES } from "../../core/exercises";
import { getMod } from "../../core/mods/catalog";
import { UNLOCK_LABEL } from "../../core/mods/compat";
import { rarityRank } from "../../core/rarity";
import type { LootState, ModInstance } from "../../core/types";
import { ModChip } from "../components";
import { useApp } from "../context";

export function InventoryScreen() {
  const { repo, cfg } = useApp();
  const [items, setItems] = useState<ModInstance[] | null>(null);
  const [loot, setLoot] = useState<LootState>({ dropsSinceHigh: 0 });
  const [filter, setFilter] = useState("");

  useEffect(() => {
    void repo.inventory().then(setItems);
    void repo.lootState().then(setLoot);
  }, [repo]);

  if (!items) return null;
  const shown = items
    .filter((i) => !filter || getMod(i.modId).exercises.includes(filter as never))
    .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || getMod(a.modId).name.localeCompare(getMod(b.modId).name));

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>Inventaire</h1>
      <p className="dim" style={{ marginBottom: 20 }}>
        {items.length} mod{items.length > 1 ? "s" : ""} · drops sans Prototype ni Fantôme : {loot.dropsSinceHigh} / {cfg.loot.pityThreshold}
      </p>
      <div className="toolbar">
        <label className="field">
          <span>Compatible avec</span>
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Tous les exercices</option>
            {EXERCISES.map((e) => <option key={e.id} value={e.id}>{e.id} · {e.name}</option>)}
          </select>
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="empty">
          {items.length === 0 ? "Inventaire vide. Chaque bloc terminé te rapporte un mod." : "Aucun mod compatible avec cet exercice."}
        </p>
      ) : (
        <div className="inv-grid">
          {shown.map((i) => {
            const mod = getMod(i.modId);
            return (
              <ModChip
                key={i.id}
                inst={i}
                showExercises
                extra={mod.unlock ? <div className="dim">{UNLOCK_LABEL[mod.unlock]}</div> : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
