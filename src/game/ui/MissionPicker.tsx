/**
 * Choix de la mission, intégré à l'écran de lancement. Facultatif et replié par défaut :
 * une ligne de résumé (contrat standard, équipe suggérée). Ce qui est affiché est « armé »
 * et sera lié au prochain bloc lancé ; si rien n'est touché, le bloc part sur ce résumé.
 */
import { useEffect, useMemo, useState } from "react";
import * as E from "../engine";
import type { Contract, GameState, ModRarity, Odds } from "../engine";
import { defaultContract } from "../apply";
import { localDate, type IntentChoice } from "../model";
import { useGame } from "./hooks";
import { fmtInt, fmtPct, handle, INJURY_NAME, RARITY_NAME, roleName, SLOT_NAME, typeName } from "./labels";

type Sel = { kind: "contract"; id: string } | { kind: "gig" } | { kind: "none" };

const winRate = (o: Odds | undefined) => (o ? o.success + o.critSuccess : 0);

export function MissionPicker({ modRarity }: { modRarity: ModRarity }) {
  const { rt, record } = useGame();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const [squad, setSquad] = useState<string[] | null>(null); // null : équipe suggérée
  const date = localDate(Date.now());

  // Le moteur met le tableau du jour en cache dans l'état : on travaille sur une copie.
  const view = useMemo(() => {
    if (!rt || !record) return null;
    const s: GameState = structuredClone(record.state);
    const cfg = rt.cfg;
    const board = E.getBoard(s, cfg, date);
    const op = E.getOpContract(s, cfg, date);
    const cards: Contract[] = [...board.contracts, ...(op ? [op] : [])];
    const gig = E.makeGig(s, cfg, date, "apercu");
    const fallback = defaultContract(structuredClone(s), cfg, date, "apercu");
    const available = E.availableRunners(s);
    return { s, cfg, cards, gig, fallback, available };
  }, [rt, record, date]);

  const current: Sel = sel ?? (view ? (view.fallback.kind === "g" ? { kind: "gig" } : { kind: "contract", id: view.fallback.id }) : { kind: "none" });
  const contract: Contract | null = !view ? null : current.kind === "gig" ? view.gig : current.kind === "contract" ? (view.cards.find((c) => c.id === current.id) ?? null) : null;

  const suggestion = useMemo(
    () => (view && contract ? E.suggestSquad(view.s, view.cfg, contract, modRarity) : null),
    [view, contract, modRarity],
  );
  const availableIds = new Set(view?.available.map((r) => r.id));
  const effective = (squad ?? suggestion?.ids ?? []).filter((id) => availableIds.has(id));
  const odds = useMemo(
    () => (view && contract && effective.length ? E.odds(E.evaluate(view.s, view.cfg, contract, effective, modRarity), view.cfg) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, contract, modRarity, effective.join(",")],
  );
  const nobody = !!view && view.available.length === 0;

  // Arme le choix affiché (au montage et à chaque changement).
  const choice: IntentChoice = nobody || current.kind === "none" ? { kind: "none" } : current.kind === "gig" ? { kind: "gig" } : { kind: "contract", contractId: current.id, squad: effective };
  const choiceKey = JSON.stringify(choice);
  useEffect(() => {
    if (rt) void rt.arm(choice).catch((e) => console.error("[jeu] armement", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt, choiceKey]);

  if (!view) return null;
  const { s, cfg } = view;
  const district = (c: Contract) => s.districts[c.tier - 1]!;

  const summary = nobody
    ? "Toute l'équipe est blessée : ce bloc se joue sans mission."
    : current.kind === "none"
      ? "Aucune mission pour ce bloc."
      : contract
        ? `${SLOT_NAME[contract.kind === "c" ? contract.slot : contract.kind]} · ${contract.verb} ${contract.target} · ${district(contract).name} — ${fmtPct(winRate(odds))} de succès, ${effective.length} runner${effective.length > 1 ? "s" : ""}`
        : "";

  const pickSel = (v: Sel) => {
    setSel(v);
    setSquad(null);
  };
  const toggle = (id: string) => {
    const cur = effective;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, cfg.core.squad.max as number);
    setSquad(next);
  };

  return (
    <div className="field lw-picker">
      <span>Mission <span className="dim">(facultative)</span></span>
      <div className="lw-summary">
        <span>{summary}</span>
        {!nobody && (
          <button type="button" className="btn ghost lw-small" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Replier" : "Modifier"}
          </button>
        )}
      </div>

      {open && !nobody && (
        <div className="stack lw-picker-body">
          <div className="lw-cards" role="group" aria-label="Contrats du jour">
            {view.cards.map((c) => {
              const d = district(c);
              const sug = c.taken ? null : E.suggestSquad(s, cfg, c, modRarity);
              const pressed = current.kind === "contract" && current.id === c.id;
              return (
                <button key={c.id} type="button" className="lw-card" style={{ ["--dc" as string]: d.color }} aria-pressed={pressed} disabled={c.taken} onClick={() => pickSel({ kind: "contract", id: c.id })}>
                  <span className="lw-card-head">
                    <span className="lw-slot">{SLOT_NAME[c.kind === "c" ? c.slot : c.kind]}</span>
                    <span className="dim">P{c.tier} · {typeName(cfg, c.type)}</span>
                  </span>
                  <span className="lw-card-title">{c.verb} {c.target}</span>
                  <span className="dim">{d.name} · pour {c.client}</span>
                  {c.complication && <span className="lw-warn">{cfg.complicationById[c.complication]?.name}</span>}
                  {E.alertOf(s, c) > 0 && <span className="dim">Alerte {E.alertOf(s, c)}</span>}
                  <span className="lw-card-foot">
                    {c.taken ? "Déjà pris aujourd'hui" : <>{fmtPct(winRate(sug?.odds))} de succès · ~{fmtInt(cfg.tierDef(c.tier).credits * (cfg.typeById[c.type]?.creditMult ?? 1) * c.rewardMult)} cr.</>}
                  </span>
                </button>
              );
            })}
            <button type="button" className="lw-card" aria-pressed={current.kind === "gig"} onClick={() => pickSel({ kind: "gig" })}>
              <span className="lw-card-head"><span className="lw-slot">Petit boulot</span></span>
              <span className="lw-card-title">Une course sans histoire</span>
              <span className="dim">Ni blessure, ni réputation, ni équipement.</span>
              <span className="lw-card-foot">{fmtPct(winRate(E.suggestSquad(s, cfg, view.gig, modRarity)?.odds))} de succès</span>
            </button>
            <button type="button" className="lw-card" aria-pressed={current.kind === "none"} onClick={() => pickSel({ kind: "none" })}>
              <span className="lw-card-head"><span className="lw-slot">Aucune mission</span></span>
              <span className="dim">Le bloc se joue seul.</span>
            </button>
          </div>

          {contract && current.kind !== "none" && (
            <>
              <div className="lw-runners" role="group" aria-label="Équipe envoyée">
                {s.runners.map((r) => {
                  const hurt = r.injury;
                  const on = effective.includes(r.id);
                  return (
                    <button key={r.id} type="button" className={`chip lw-runner r-${r.rarity}`} aria-pressed={on} disabled={!!hurt || current.kind === "gig"} onClick={() => toggle(r.id)}
                      title={`${roleName(cfg, r.role)} ${RARITY_NAME[r.rarity]} niveau ${r.level}`}>
                      <strong>{handle(r)}</strong> <span className="dim">{roleName(cfg, r.role)} {r.level}</span>
                      {hurt && <span className="lw-warn"> · blessure {INJURY_NAME[hurt.kind]}, {hurt.blocksLeft} bloc{hurt.blocksLeft > 1 ? "s" : ""}</span>}
                    </button>
                  );
                })}
              </div>
              {squad !== null && current.kind === "contract" && (
                <button type="button" className="btn ghost lw-small" style={{ justifySelf: "start" }} onClick={() => setSquad(null)}>Revenir à l'équipe suggérée</button>
              )}
              {effective.length === 0 ? (
                <p className="error">Choisis au moins un runner (sinon l'équipe suggérée partira).</p>
              ) : (
                odds && <OddsBar odds={odds} />
              )}
              {modRarity !== "none" && <p className="dim">Chances calculées avec le mod équipé ({RARITY_NAME[modRarity]}) : son bonus ne compte que si tu termines le bloc.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function OddsBar({ odds }: { odds: Odds }) {
  const parts: [keyof Odds, string][] = [
    ["critSuccess", "Critique"],
    ["success", "Succès"],
    ["partial", "Partiel"],
    ["fail", "Échec"],
    ["critFail", "Désastre"],
  ];
  return (
    <div className="lw-odds" aria-label="Chances">
      <div className="lw-odds-bar">
        {parts.map(([k]) => (odds[k] > 0 ? <span key={k} className={`o-${k}`} style={{ flexGrow: odds[k] }} /> : null))}
      </div>
      <div className="lw-odds-legend dim">
        {parts.filter(([k]) => odds[k] >= 0.005).map(([k, l]) => <span key={k}><i className={`o-${k}`} /> {l} {fmtPct(odds[k])}</span>)}
      </div>
    </div>
  );
}
