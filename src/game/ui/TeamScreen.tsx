/**
 * Onglet Équipe : la ville, l'équipe et les contrats, en lecture seule hors fenêtre de gestion.
 */
import { useEffect, useMemo, useState } from "react";
import * as E from "../engine";
import type { EngineConfig, GameState, Item, Runner } from "../engine";
import { localDate, OUTCOME_LABEL, type StoredReport } from "../model";
import { useGame } from "./hooks";
import { currentAct, effectsLabel, fmtInt, INJURY_NAME, RARITY_NAME, roleName, SLOT_LABEL, SLOT_NAME, SLOTS, STATS, typeName } from "./labels";
import { QuickManage, WindowBanner } from "./Manage";
import { ManageMore } from "./ManageMore";

export function TeamScreen() {
  const { rt, record, version } = useGame();
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [tab, setTab] = useState<"equipe" | "planque" | "ville" | "journal">("equipe");
  useEffect(() => {
    if (rt) void rt.store.reports(15).then(setReports);
  }, [rt, version]);

  const today = localDate(Date.now());
  const board = useMemo(() => {
    if (!rt || !record) return null;
    const s = structuredClone(record.state);
    const b = E.getBoard(s, rt.cfg, today);
    const op = E.getOpContract(s, rt.cfg, today);
    return { s, cards: [...b.contracts, ...(op ? [op] : [])] };
  }, [rt, record, today]);

  if (!rt) return <p className="empty">Le jeu démarre…</p>;
  if (!record || !board) return null;
  const cfg = rt.cfg;
  const s = record.state;
  const frac = E.seasonFraction(s, today);
  const act = currentAct(cfg, frac);
  const nextTier = s.maxTier < 6 ? cfg.tierDef(s.maxTier + 1) : null;

  return (
    <div className="stack lw-team" style={{ gap: 32 }}>
      <div className="screen-head">
        <h1>LOW END</h1>
        <span className="segmented" role="radiogroup" aria-label="Sections du jeu">
          {([["equipe", "Équipe"], ["planque", "Recrues et planque"], ["ville", "Ville"], ["journal", "Journal"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </span>
      </div>
      <section className="stack">
        <div className="lw-kpis">
          <Kpi label="Crédits" value={fmtInt(s.credits)} />
          <Kpi label="Réputation" value={fmtInt(s.rep)} hint={nextTier ? `palier ${s.maxTier + 1} à ${fmtInt(nextTier.repToUnlock)}` : "tous les paliers ouverts"} />
          <Kpi label="Palier" value={`${s.maxTier} / 6`} hint={act.name} />
          <Kpi label="Saison" value={`${Math.round(frac * 100)} %`} hint={`jusqu'au ${new Date(s.season.end).toLocaleDateString("fr-FR")}`} />
        </div>
        <WindowBanner />
        <QuickManage />
      </section>

      {tab === "equipe" && <>
      <section className="stack">
        <h2>Runners</h2>
        <div className="lw-grid">
          {s.runners.map((r) => <RunnerCard key={r.id} r={r} s={s} cfg={cfg} />)}
        </div>
      </section>

      <section className="stack">
        <h2>Équipement en stock</h2>
        {s.inventory.length === 0 ? <p className="dim">Rien en stock : tout est équipé.</p> : (
          <div className="lw-grid">
            {s.inventory.map((id) => s.items[id]).filter((x): x is Item => !!x).map((it) => <ItemLine key={it.id} it={it} cfg={cfg} />)}
          </div>
        )}
      </section>
      </>}

      {tab === "planque" && <ManageMore />}

      {tab === "ville" && <>
      <section className="stack">
        <h2>Contrats du jour</h2>
        <div className="lw-grid">
          {board.cards.map((c) => {
            const d = board.s.districts[c.tier - 1]!;
            return (
              <div key={c.id} className="lw-card static" style={{ ["--dc" as string]: d.color }} data-taken={c.taken}>
                <span className="lw-card-head"><span className="lw-slot">{SLOT_NAME[c.kind === "c" ? c.slot : c.kind]}</span><span className="dim">P{c.tier} · {typeName(cfg, c.type)}</span></span>
                <span className="lw-card-title">{c.verb} {c.target}</span>
                <span className="dim">{d.name} · pour {c.client}</span>
                {c.complication && <span className="lw-warn">{cfg.complicationById[c.complication]?.name} : {cfg.complicationById[c.complication]?.desc}</span>}
                <span className="lw-card-foot">{c.taken ? "Déjà pris aujourd'hui" : "Se choisit au lancement d'un bloc"}</span>
              </div>
            );
          })}
        </div>
        <p className="dim">Au-delà des contrats du jour, chaque bloc peut lancer un petit boulot.</p>
      </section>

      <section className="stack">
        <h2>Quartiers</h2>
        <div className="lw-grid">
          {s.districts.map((d) => (
            <div key={d.tier} className="lw-district" style={{ ["--dc" as string]: d.revealed ? d.color : "var(--line)" }}>
              {d.revealed ? (
                <>
                  <strong>{d.name}</strong>
                  <span className="dim">Palier {d.tier} · {d.faction}</span>
                  <span className="dim">{cfg.districtTraitById[d.trait]?.name} : {cfg.districtTraitById[d.trait]?.desc}</span>
                  <span>Alerte {d.alert}{d.tier === 6 && s.grandCoup.done ? " (Chaleur)" : ` / ${cfg.core.alert.cap}`}</span>
                </>
              ) : (
                <>
                  <strong className="dim">Palier {d.tier} · brouillé</strong>
                  <span className="dim">Réputation {fmtInt(cfg.tierDef(d.tier).repToUnlock)} et ouverture de l'acte requises.</span>
                </>
              )}
            </div>
          ))}
        </div>
        {s.grandCoup.open && <p>Grand Coup : étape {Math.min(s.grandCoup.stage + 1, cfg.core.grandCoup.stages)} sur {cfg.core.grandCoup.stages}{s.grandCoup.done ? " · bouclé" : ""}.</p>}
      </section>

      </>}

      {tab === "journal" && <section className="stack">
        <h2>Journal des missions</h2>
        {reports.filter((r) => r.report.contract).length === 0 ? <p className="dim">Aucune mission pour l'instant. La première partira avec ton prochain bloc.</p> : (
          <div className="scroll-x">
            <table className="hist">
              <thead><tr><th>Date</th><th>Contrat</th><th>Issue</th><th>Récit</th><th>Gains</th></tr></thead>
              <tbody>
                {reports.filter((r) => r.report.contract).map((r) => (
                  <tr key={r.blockId}>
                    <td>{new Date(r.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td>{SLOT_NAME[r.report.contract!.kind === "c" ? r.report.contract!.slot : r.report.contract!.kind]} · {typeName(cfg, r.report.contract!.type)} · P{r.report.contract!.tier}</td>
                    <td className={`o-text o-${r.report.outcome}`}>{OUTCOME_LABEL[r.report.outcome ?? ""] ?? "—"}{r.report.penalized ? " · malus" : ""}</td>
                    <td className="dim">{r.narrative?.rapport ?? ""}</td>
                    <td className="num">{r.report.rewards.credits ? `${fmtInt(r.report.rewards.credits)} cr.` : ""} {r.report.rewards.rep ? `${r.report.rewards.rep > 0 ? "+" : ""}${r.report.rewards.rep} rép.` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="lw-kpi">
      <span className="dim">{label}</span>
      <span className="num lw-kpi-value">{value}</span>
      {hint && <span className="dim lw-kpi-hint">{hint}</span>}
    </div>
  );
}

export function RunnerCard({ r, s, cfg }: { r: Runner; s: GameState; cfg: EngineConfig }) {
  const stats = E.runnerStats(s, cfg, r);
  const need = r.level >= cfg.core.progression.maxLevel ? 0 : E.xpToNext(cfg, r.level);
  const trait = cfg.traitById[r.trait];
  return (
    <div className={`lw-runner-card r-${r.rarity}`} data-hurt={!!r.injury}>
      <div className="lw-runner-head">
        <strong>{E.displayName(r)}</strong>
        <span className="dim">{roleName(cfg, r.role)} · <span className={`plate r-${r.rarity}`}>{RARITY_NAME[r.rarity]}</span> · niveau {r.level}</span>
      </div>
      {need > 0 && <div className="meter" role="img" aria-label={`XP ${r.xp} sur ${need}`}><div style={{ width: `${Math.min(100, (r.xp / need) * 100)}%` }} /></div>}
      <div className="lw-stats num">
        {STATS.map((k) => <span key={k}><span className="dim">{k}</span> {Math.round(stats[k] * 10) / 10}</span>)}
      </div>
      {r.injury && <span className="lw-warn">Blessure {INJURY_NAME[r.injury.kind]} : encore {r.injury.blocksLeft} bloc{r.injury.blocksLeft > 1 ? "s" : ""}</span>}
      <span className="dim">Trait : {trait?.name} — {trait?.desc}</span>
      {r.talents.length > 0 && <span className="dim">Talents : {r.talents.map((t) => cfg.talentById[t]?.name ?? t).join(", ")}</span>}
      <div className="lw-gear">
        {SLOTS.map((slot) => {
          const it = r.gear[slot] ? s.items[r.gear[slot]!] : undefined;
          return (
            <span key={slot}>
              <span className="dim">{SLOT_LABEL[slot]} : </span>
              {it ? <>{it.name} <span className={`plate r-${it.rarity}`}>{RARITY_NAME[it.rarity]}</span></> : <span className="dim">—</span>}
            </span>
          );
        })}
      </div>
      <span className="dim">{r.missions} mission{r.missions > 1 ? "s" : ""}, {r.successes} réussie{r.successes > 1 ? "s" : ""}</span>
    </div>
  );
}

export function ItemLine({ it, cfg }: { it: Item; cfg: EngineConfig }) {
  const stats = STATS.filter((k) => it.stats[k]).map((k) => `${k} +${String(it.stats[k]).replace(".", ",")}`).join(" · ");
  const extra = effectsLabel(cfg, it.affixes.filter((a) => a.kind !== "stat"));
  const sig = it.signature ? cfg.signatureById[it.signature]?.desc : null;
  return (
    <div className={`lw-item r-${it.rarity}`}>
      <span>{it.name}</span>
      <span className="dim">{SLOT_LABEL[it.slot]} · P{it.tier} · <span className={`plate r-${it.rarity}`}>{RARITY_NAME[it.rarity]}</span>{it.forged ? " · forgé" : ""}</span>
      <span className="dim">{[stats, extra, sig].filter(Boolean).join(" · ")}</span>
    </div>
  );
}
