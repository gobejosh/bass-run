/**
 * Gestion complète (onglet Équipe) : recrues, clinique, planque, recalibrage, équipement manuel.
 * Tout est consultable ; les boutons ne s'activent que pendant la fenêtre de gestion.
 */
import { useState } from "react";
import * as E from "../engine";
import type { EngineConfig, GameState, Item, Runner } from "../engine";
import { useGame } from "./hooks";
import { effectsLabel, fmtInt, handle, INJURY_NAME, RARITY_NAME, roleName, SLOT_LABEL } from "./labels";
import { ActButton } from "./Manage";
import { ItemLine } from "./TeamScreen";

function moduleLevelLabel(cfg: EngineConfig, lvl: { kind: string; value: number; rarityUp?: number }): string {
  switch (lvl.kind) {
    case "benchXp":
      return `runners restés à la planque : ${Math.round(lvl.value * 100)} % de l'XP`;
    case "complicationReduce":
      return `complications −${lvl.value} au DD`;
    case "gearChance":
      return `équipement +${Math.round(lvl.value * 100)} %, rareté +${Math.round((lvl.rarityUp ?? 0) * 100)} %`;
    default:
      return effectsLabel(cfg, [lvl]);
  }
}

export function ManageMore() {
  const { rt, record } = useGame();
  if (!rt || !record) return null;
  const cfg = rt.cfg;
  const s = record.state;
  const act = (fn: (st: GameState) => boolean | void) => rt.act((st) => fn(st));

  const hurt = s.runners.filter((r) => r.injury);
  const upgradable = [
    ...s.runners.flatMap((r) => E_SLOTS.map((slot) => r.gear[slot]).filter((id): id is string => !!id)),
    ...s.inventory,
  ]
    .map((id) => s.items[id])
    .filter((it): it is Item => !!it && E.upgradeCost(s, cfg, it) !== null);

  return (
    <>
      <section className="stack">
        <h2>Recrues</h2>
        <p className="dim">Renouvelées tous les {cfg.core.recruit.refreshBlocks} blocs terminés. {s.runners.length}/{cfg.core.recruit.maxRoster} runners, {cfg.core.recruit.maxSameRole} au plus par rôle.</p>
        <div className="lw-grid">
          {s.candidates.map((c) => <Candidate key={c.id} c={c} s={s} cfg={cfg} onRecruit={(dismiss) => act((st) => E.recruit(st, cfg, c.id, dismiss))} />)}
        </div>
      </section>

      {hurt.length > 0 && (
        <section className="stack">
          <h2>Clinique</h2>
          <div className="lw-grid">
            {hurt.map((r) => {
              const cost = E.clinicCost(s, cfg, r);
              return (
                <div key={r.id} className="lw-item">
                  <span><strong>{handle(r)}</strong> · blessure {INJURY_NAME[r.injury!.kind]}, encore {r.injury!.blocksLeft} bloc{r.injury!.blocksLeft > 1 ? "s" : ""}</span>
                  <ActButton className="btn" label={`Soigner tout de suite (${fmtInt(cost)} cr.)`} disabled={s.credits < cost} onAct={() => act((st) => E.heal(st, cfg, r.id))} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="stack">
        <h2>Planque</h2>
        <div className="lw-grid">
          {(cfg.planque.modules as { id: string; name: string; desc: string; costs: number[]; levels: { kind: string; value: number; rarityUp?: number }[] }[]).map((m) => {
            const lvl = s.planque[m.id] ?? 0;
            const cost = m.costs[lvl];
            return (
              <div key={m.id} className="lw-item">
                <span><strong>{m.name}</strong> · niveau {lvl}/{m.costs.length}</span>
                <span className="dim">{m.desc}{lvl > 0 ? ` Actuel : ${moduleLevelLabel(cfg, m.levels[lvl - 1]!)}.` : ""}</span>
                {cost !== undefined ? (
                  <>
                    <span className="dim">Niveau {lvl + 1} : {moduleLevelLabel(cfg, m.levels[lvl]!)}.</span>
                    <ActButton className="btn" label={`Améliorer (${fmtInt(cost)} cr.)`} disabled={s.credits < cost} onAct={() => act((st) => E.buyModule(st, cfg, m.id))} />
                  </>
                ) : <span className="dim">Niveau maximal.</span>}
              </div>
            );
          })}
        </div>
      </section>

      {s.inventory.length > 0 && (
        <section className="stack">
          <h2>Équiper un objet</h2>
          <div className="lw-grid">
            {s.inventory.map((id) => s.items[id]).filter((x): x is Item => !!x).map((it) => (
              <div key={it.id} className="stack" style={{ gap: 6 }}>
                <ItemLine it={it} cfg={cfg} />
                <div className="row" style={{ gap: 6 }}>
                  {s.runners.map((r) => (
                    <ActButton key={r.id} className="btn ghost lw-small" label={`Équiper ${handle(r)}`} title={`Remplace : ${r.gear[it.slot] ? s.items[r.gear[it.slot]!]?.name : "rien"}`}
                      onAct={() => act((st) => E.equip(st, r.id, it.id))} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {upgradable.length > 0 && (
        <section className="stack">
          <h2>Recalibrage</h2>
          <p className="dim">Monte un objet d'un palier (jusqu'au palier débloqué) : stats et affixes suivent, la rareté et le nom restent.</p>
          <div className="lw-grid">
            {upgradable.map((it) => {
              const cost = E.upgradeCost(s, cfg, it)!;
              return (
                <div key={it.id} className={`lw-item r-${it.rarity}`}>
                  <span>{it.name}</span>
                  <span className="dim">{SLOT_LABEL[it.slot]} · {RARITY_NAME[it.rarity]} · P{it.tier} puis P{it.tier + 1}</span>
                  <ActButton className="btn" label={`Recalibrer (${fmtInt(cost)} cr.)`} disabled={s.credits < cost} onAct={() => act((st) => E.upgradeItem(st, cfg, it.id))} />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

const E_SLOTS = ["arme", "implant", "outil"] as const;

function Candidate({ c, s, cfg, onRecruit }: { c: Runner; s: GameState; cfg: EngineConfig; onRecruit: (dismiss: string | null) => Promise<boolean> }) {
  const full = s.runners.length >= (cfg.core.recruit.maxRoster as number);
  const [dismiss, setDismiss] = useState<string>("");
  const cost = E.recruitCost(s, cfg, c);
  const sameRole = s.runners.filter((r) => r.role === c.role && r.id !== dismiss).length;
  const blocked = sameRole >= (cfg.core.recruit.maxSameRole as number) ? `déjà ${sameRole} ${roleName(cfg, c.role)}` : s.credits < cost ? "crédits insuffisants" : full && !dismiss ? "choisis qui part" : null;
  const trait = cfg.traitById[c.trait];
  return (
    <div className={`lw-runner-card r-${c.rarity}`}>
      <div className="lw-runner-head">
        <strong>{E.displayName(c)}</strong>
        <span className="dim">{roleName(cfg, c.role)} · <span className={`plate r-${c.rarity}`}>{RARITY_NAME[c.rarity]}</span> · niveau {c.level}</span>
      </div>
      <span className="dim">Trait : {trait?.name} — {trait?.desc}</span>
      {full && (
        <label className="field">
          <span>Équipe pleine : qui part ? (son équipement revient au stock)</span>
          <select className="input" value={dismiss} onChange={(e) => setDismiss(e.target.value)}>
            <option value="">—</option>
            {s.runners.map((r) => <option key={r.id} value={r.id}>{handle(r)} · {roleName(cfg, r.role)} {r.level}</option>)}
          </select>
        </label>
      )}
      <ActButton className="btn" label={`Recruter (${fmtInt(cost)} cr.)`} disabled={!!blocked} title={blocked ?? undefined} onAct={() => onRecruit(dismiss || null)} />
      {blocked && <span className="dim">{blocked}</span>}
    </div>
  );
}
