import { useEffect, useRef, useState } from "react";
import type { RhythmMotif } from "../../core/theory/dictionaries";
import { noteName, type Notation, type SpelledNote } from "../../core/theory/notes";

/** Motif rythmique de 2 temps : 8 doubles-croches. */
export function RhythmGrid({ motif }: { motif: RhythmMotif }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="rgrid" aria-label={motif.label}>
        {[...motif.grid].map((c, i) => (
          <span key={i} className={`rc ${c === "x" ? "hit" : c === "-" ? "tie" : ""} ${i % 4 === 0 ? "beat" : ""}`} />
        ))}
      </div>
      <span className="dim">{motif.label}</span>
    </div>
  );
}

export function NoteRow({ notes, notation }: { notes: SpelledNote[]; notation: Notation }) {
  return <div className="mid">{notes.map((n) => noteName(n, notation)).join("  ")}</div>;
}

/** Bouton d'action principal, déclenché aussi par Entrée ou Espace (mains sur la basse : un pied, une télécommande…). */
export function NextButton({ label, onNext, disabled }: { label: string; onNext: () => void; disabled?: boolean }) {
  const cb = useRef(onNext);
  cb.current = onNext;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        cb.current();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [disabled]);
  return (
    <button type="button" className="btn big next" onClick={onNext} disabled={disabled}>
      {label} <span className="dim kbd">Espace</span>
    </button>
  );
}

/** Compte à rebours en secondes, suspendu pendant la pause. Renvoie le temps restant (s). */
export function useCountdown(seconds: number, paused: boolean, key: unknown, onDone: () => void): number {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => setLeft(seconds), [seconds, key]);
  useEffect(() => {
    if (paused) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setLeft((l) => {
        const next = l - dt;
        if (next <= 0 && l > 0) queueMicrotask(() => done.current());
        return Math.max(0, next);
      });
    }, 50);
    return () => clearInterval(id);
  }, [paused, key]);
  return left;
}

export function Meter({ ratio }: { ratio: number }) {
  return (
    <div className="meter" aria-hidden="true">
      <div style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
    </div>
  );
}

export function RevealToggle({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button type="button" className="btn ghost" style={{ justifySelf: "start" }} onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Masquer" : label}
      </button>
      {open && children}
    </div>
  );
}
