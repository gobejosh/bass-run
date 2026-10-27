import { useState, type ReactNode } from "react";
import { getMod } from "../core/mods/catalog";
import { describeInstance } from "../core/mods/resolve";
import { RARITY_LABEL, type ModInstance, type Rarity } from "../core/types";

export function Uses({ left, total = 3 }: { left: number; total?: number }) {
  return (
    <span className="uses" role="img" aria-label={`${left} utilisation${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""}`}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < left ? "on" : ""} />)}
    </span>
  );
}

export function EnforcementTag({ app }: { app: boolean }) {
  return <span className={`enf ${app ? "app" : ""}`}>{app ? "Appliqué par l'app" : "Consigne"}</span>;
}

export function RarityName({ rarity }: { rarity: Rarity }) {
  return <span className={`plate r-${rarity}`}>{RARITY_LABEL[rarity]}</span>;
}

interface ModChipProps {
  inst: ModInstance;
  onClick?: () => void;
  pressed?: boolean;
  lockedReason?: string;
  showExercises?: boolean;
  extra?: ReactNode;
}

export function ModChip({ inst, onClick, pressed, lockedReason, showExercises, extra }: ModChipProps) {
  const mod = getMod(inst.modId);
  const d = describeInstance(inst);
  const lvl = mod.levels[inst.rarity];
  const body = (
    <>
      <div className="head">
        <span className="name">{mod.name}</span>
        <span className={`plate r-${inst.rarity}`}>{RARITY_LABEL[inst.rarity]}</span>
      </div>
      <div className="level">{d.level}</div>
      <div className="dim">{d.constraint}</div>
      <div className="meta">
        <Uses left={inst.usesLeft} />
        <EnforcementTag app={lvl.enforcement === "app"} />
        {lockedReason && <span>{lockedReason}</span>}
        {showExercises && <span>{mod.exercises.join(", ")}</span>}
      </div>
      {extra}
    </>
  );
  const cls = `mod r-${inst.rarity}`;
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-pressed={pressed} data-locked={!!lockedReason} disabled={!!lockedReason}>
      {body}
    </button>
  ) : (
    <div className={cls} data-locked={!!lockedReason}>{body}</div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 999, step = 1, label }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <span className="stepper">
      <button type="button" aria-label={`${label} : moins`} onClick={() => onChange(clamp(value - step))}>−</button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const v = Number(e.target.value.replace(",", "."));
          if (Number.isFinite(v)) onChange(v);
        }}
        onBlur={() => onChange(clamp(value))}
      />
      <button type="button" aria-label={`${label} : plus`} onClick={() => onChange(clamp(value + step))}>+</button>
    </span>
  );
}

export const fmtClock = (s: number): string => {
  const neg = s < 0;
  const a = Math.abs(Math.round(s));
  return `${neg ? "+" : ""}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
};

/**
 * Action à confirmer dans la page (pas de boîte native : elles sont bloquées dans certains
 * cadres d'affichage et peu pratiques sur un pupitre). Premier clic : la question s'affiche.
 */
export function ConfirmAction({ label, question, confirmLabel, onConfirm, className = "btn danger" }: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className={className} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="confirm" role="group" aria-label={question}>
      <span>{question}</span>
      <button type="button" className="btn danger" onClick={() => { setAsking(false); void onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="btn ghost" onClick={() => setAsking(false)}>Annuler</button>
    </span>
  );
}

/** Choix de fichier en français (les champs natifs s'affichent dans la langue du navigateur). */
export function FilePick({ label, accept, multiple, files, onFiles }: {
  label: string; accept?: string; multiple?: boolean; files: readonly File[]; onFiles: (f: File[]) => void;
}) {
  return (
    <span className="file-pick">
      <label className="btn">
        {label}
        <input type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </label>
      <span className="dim">{files.length === 0 ? "Aucun fichier choisi" : files.length === 1 ? files[0]!.name : `${files.length} fichiers`}</span>
    </span>
  );
}

/** Choix exclusif en ligne (statut, priorité…). */
export function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void;
}) {
  return (
    <span className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)}>{l}</button>
      ))}
    </span>
  );
}

export function Tag({ tone = "plain", children }: { tone?: "plain" | "holo" | "sodium" | "strong"; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}
