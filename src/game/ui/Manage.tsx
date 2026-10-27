/**
 * Fenêtre de gestion : ouverte après chaque bloc terminé (core.debrief.windowSeconds), puis verrouillée
 * jusqu'au bloc suivant. Hors fenêtre, tout est en lecture seule (« pas de jeu sans pratique »).
 */
import { useState, type ReactNode } from "react";
import * as E from "../engine";
import { useGame, useNow } from "./hooks";
import { effectsLabel, fmtClock, handle } from "./labels";

export function useWindow(): { left: number; open: boolean } {
  const { rt, record } = useGame();
  const until = record?.windowUntil ?? 0;
  const now = useNow(!!until && until > Date.now(), 500);
  const left = rt && until ? Math.max(0, until - now) : 0;
  return { left, open: left > 0 };
}

export function WindowBanner() {
  const { left, open } = useWindow();
  return open ? (
    <div className="lw-window on" role="status">
      <span className="num">{fmtClock(left)}</span>
      <span>Fenêtre de gestion ouverte : équipe, recrues, soins. Elle se verrouille à 0:00.</span>
    </div>
  ) : (
    <div className="lw-window">
      <span>Lecture seule. Les actions s'ouvrent pendant 2 minutes après chaque bloc terminé.</span>
    </div>
  );
}

/** Bouton d'action de gestion : actif seulement pendant la fenêtre. */
export function ActButton({ label, onAct, disabled, className = "btn", title }: { label: ReactNode; onAct: () => Promise<boolean>; disabled?: boolean; className?: string; title?: string }) {
  const { open } = useWindow();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={className} title={title} disabled={!open || disabled || busy} onClick={async () => {
      setBusy(true);
      try {
        await onAct();
      } finally {
        setBusy(false);
      }
    }}>{label}</button>
  );
}

/** Actions rapides de la fenêtre : équiper le meilleur, choix de talent. */
export function QuickManage() {
  const { rt, record } = useGame();
  const { open } = useWindow();
  if (!rt || !record) return null;
  const cfg = rt.cfg;
  const pending = record.state.runners.filter((r) => r.pendingTalents?.length);
  return (
    <div className="stack lw-manage">
      <div className="row">
        <ActButton label="Équiper le meilleur" className="btn" onAct={() => rt.act((s) => E.autoEquip(s, cfg))} />
        {!open && <span className="dim">Gestion verrouillée jusqu'au prochain bloc terminé.</span>}
      </div>
      {pending.map((r) => (
        <div key={r.id} className="stack lw-talent">
          <span><strong>{handle(r)}</strong> choisit un talent :</span>
          <div className="row">
            {r.pendingTalents!.map((t) => {
              const def = cfg.talentById[t];
              return (
                <ActButton key={t} className="btn" label={<span className="lw-talent-btn"><strong>{def?.name ?? t}</strong><span className="dim">{effectsLabel(cfg, def?.effects ?? [])}</span></span>}
                  onAct={() => rt.act((s) => E.chooseTalent(s, r.id, t))} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
