import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { unlockAudio } from "../../audio/context";
import { AXIS_LABEL, EXERCISES, getExercise, type Axis } from "../../core/exercises";
import { getMod, MODS } from "../../core/mods/catalog";
import { canEquip, exercisesWithMods, type UnlockContext } from "../../core/mods/compat";
import { horizonBars, switchBars, targetSequence, TARGETS } from "../../core/mods/live";
import { resolveMod } from "../../core/mods/resolve";
import { cryptoRng } from "../../core/rng";
import { applyPct, referenceBpm, tempoKey } from "../../core/tempo";
import { hasGrid, hasPassages } from "../../core/repertoire";
import type { ExerciseId, ModInstance } from "../../core/types";
import { ModChip, Stepper } from "../components";
import { useApp, type Session } from "../context";
import { driverFor } from "../drivers";
import { LaunchMission } from "../../integration/game";
import type { LaunchChoice } from "../drivers/types";
import { useHotkeys } from "../hotkeys";
import type { LaunchPreset } from "./Today";

const DURATIONS = [10, 15, 20, 25, 30];

export function LaunchScreen({ onLaunched, preset, onBack }: { onLaunched: (s: Session) => void; preset?: LaunchPreset; onBack?: () => void }) {
  const { repo, cfg, dicts } = useApp();
  const [exerciseId, setExerciseId] = useState<ExerciseId>(preset?.exerciseId ?? "WLK-01");
  const [minutes, setMinutes] = useState(preset?.minutes ?? cfg.block.defaultMinutes);
  const [ref, setRef] = useState<number>(0);
  const [storedRef, setStoredRef] = useState<number | undefined>();
  const [inventory, setInventory] = useState<ModInstance[]>([]);
  const [modId, setModId] = useState<string | null>(null);
  const [choice, setChoice] = useState<LaunchChoice>(preset ? { ...(preset.pieceId ? { pieceId: preset.pieceId } : {}), ...(preset.passageId ? { passageId: preset.passageId } : {}) } : {});
  const firstExercise = useRef(true);
  const [man03Advanced, setMan03Advanced] = useState(false);
  const [counts, setCounts] = useState({ grids: 0, unknownBank: 0, passages: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ex = getExercise(exerciseId);
  const driver = driverFor(exerciseId);
  const key = tempoKey(exerciseId, choice.pieceId && choice.passageId ? { pieceId: choice.pieceId, passageId: choice.passageId } : undefined);

  useEffect(() => {
    void (async () => {
      setInventory(await repo.inventory());
      setMan03Advanced(await repo.man03Advanced());
      const pieces = await repo.pieces();
      setCounts({
        grids: pieces.filter(hasGrid).length,
        unknownBank: await repo.raw.countFromIndex("unknownBank", "byStatus", "jamais_tire"),
        passages: pieces.filter(hasPassages).length,
      });
    })();
  }, [repo]);

  useEffect(() => {
    void repo.refBpm(key).then((stored) => {
      setStoredRef(stored);
      setRef(referenceBpm(stored, exerciseId, cfg));
    });
  }, [repo, key, exerciseId, cfg]);

  // Changement d'exercice : on oublie le mod et les choix propres à l'exercice (pas au premier rendu : préréglage de la séance).
  useEffect(() => {
    if (firstExercise.current) {
      firstExercise.current = false;
      return;
    }
    setModId(null);
    setChoice({});
    setError(null);
  }, [exerciseId]);

  const unlock: UnlockContext = { man03Advanced, repPassageReliable: choice.passageTier === "fiable" || choice.passageTier === "maitrise" };
  const offers = useMemo(
    () =>
      inventory
        .map((inst) => ({ inst, check: canEquip(inst, exerciseId, unlock) }))
        .filter(({ inst }) => getMod(inst.modId).exercises.includes(exerciseId))
        .sort((a, b) => Number(b.check.ok) - Number(a.check.ok)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inventory, exerciseId, man03Advanced, choice.passageTier],
  );
  const selected = offers.find((o) => o.inst.id === modId && o.check.ok)?.inst;
  const preview = selected ? resolveMod(selected, ref, cfg, cryptoRng) : undefined;
  const targetBpm = preview ? preview.targetBpm : applyPct(ref, 0, cfg);

  const missing = (ex.needs ?? []).filter((n) => counts[n] === 0);
  const missingLabel: Record<string, string> = {
    grids: "Ajoute d'abord un morceau avec sa grille (onglet Répertoire).",
    unknownBank: "La banque de déchiffrage est vide ou entièrement tirée (Répertoire > Banque de déchiffrage).",
    passages: "Ajoute d'abord un morceau avec une mélodie découpée en passages (onglet Répertoire).",
  };
  const needsChoice = exerciseId === "REP-01" && !choice.passageId;

  async function launch() {
    unlockAudio(); // synchrone, dans le geste
    setBusy(true);
    setError(null);
    try {
      const rng = cryptoRng;
      // Avant tout tirage : un standard inconnu tiré pour rien serait grillé.
      if (await repo.openBlock()) throw new Error("Un bloc est déjà ouvert : débriefe-le ou abandonne-le d'abord.");
      if (ex.asksCleanBpm && ref !== storedRef) await repo.setRefBpm(key, ref);
      const resolved = selected ? resolveMod(selected, ref, cfg, rng) : undefined;
      const blockBpm = resolved ? resolved.targetBpm : applyPct(ref, 0, cfg);
      const prepared = await driver.prepare({ exerciseId, cfg, dicts, rng, repo, mod: resolved, blockBpm, choice });
      const live: Record<string, unknown> = {};
      const la = resolved?.effects.liveAnnounce;
      const horizon = horizonBars(minutes, blockBpm, prepared.beatsPerBar ?? cfg.block.beatsPerBar);
      if (la?.kind === "cible") live.targets = targetSequence(rng, TARGETS, Math.ceil(horizon / la.everyBars) + 1);
      if (la?.kind === "bascule-two-four") live.switches = switchBars(rng, la.randomBetweenBars, horizon);
      const block = await repo.start({
        exerciseId,
        tempoKey: key,
        plannedMinutes: minutes,
        refBpm: ref,
        targetBpm: blockBpm,
        mod: selected,
        draws: { ...prepared.draws, ...(resolved ? { mod: { ...resolved.launch, ...live } } : {}) },
        ...(preset && preset.exerciseId === exerciseId ? { sessionBlockId: preset.sessionBlockId } : {}),
      });
      onLaunched({ block, resolved, prepared });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const axes = [...new Set(EXERCISES.map((e) => e.axis))] as Axis[];
  const [axis, setAxis] = useState<Axis>(ex.axis);
  const canLaunch = !busy && missing.length === 0 && !needsChoice;
  useHotkeys({ " ": () => canLaunch && void launch(), escape: () => onBack?.() }, canLaunch || !!onBack);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <header className="screen-head">
        <div className="row" style={{ gap: 14 }}>
          {onBack && <button type="button" className="icon-btn" aria-label="Retour à la séance" onClick={onBack}><Icon name="back" /></button>}
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">{preset ? `SÉANCE DU JOUR · BLOC ${preset.position.index} SUR ${preset.position.count}` : "BLOC LIBRE, HORS SÉANCE"}</span>
            <h1>Préparer le bloc</h1>
          </div>
        </div>
        {preset && <span className="dim">Prérempli depuis la séance ; tu peux tout changer.</span>}
      </header>
    <div className="launch">
      <section className="panel stack" aria-label="Exercices">
        <div className="axis-tabs" role="tablist" aria-label="Axe">
          {axes.map((a) => (
            <button key={a} type="button" role="tab" aria-selected={a === axis} title={AXIS_LABEL[a]} onClick={() => setAxis(a)}>{a}</button>
          ))}
        </div>
        <span className="dim">{AXIS_LABEL[axis]}</span>
        <div className="ex-list">
          {EXERCISES.filter((e) => e.axis === axis).map((e) => (
            <button key={e.id} type="button" className="ex" aria-pressed={e.id === exerciseId} onClick={() => setExerciseId(e.id)}>
              <span className="code">{e.id}</span>
              <span>{e.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel" aria-label="Réglages du bloc">
        <div>
          <h2><span className="code">{ex.id}</span> · {ex.name}</h2>
          <p className="dim" style={{ marginTop: 6 }}>{ex.consigne}</p>
        </div>

        {driver.Chooser && <driver.Chooser repo={repo} choice={choice} onChange={setChoice} />}

        <div className="field">
          <span>Durée</span>
          <div className="row">
            <div className="chips">
              {DURATIONS.map((d) => (
                <button key={d} type="button" className="chip" aria-pressed={d === minutes} onClick={() => setMinutes(d)}>{d} min</button>
              ))}
            </div>
            <Stepper label="Durée en minutes" value={minutes} onChange={setMinutes} min={1} max={180} />
          </div>
        </div>

        {ex.metronome && (
          <div className="field">
            <span>Tempo de référence {storedRef === undefined ? "(valeur de départ, aucun débrief encore)" : "(dernier tempo propre)"}</span>
            <Stepper label="Tempo de référence" value={ref} onChange={setRef} min={cfg.tempo.minBpm} max={cfg.tempo.maxBpm} />
          </div>
        )}

        <div className="field">
          <span>Mod</span>
          {offers.length === 0 ? (
            <p className="dim">
              {!WITH_MODS.has(exerciseId) ? "Aucun mod n'existe pour cet exercice." : "Aucun mod compatible dans l'inventaire."}
            </p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <button type="button" className="chip" aria-pressed={modId === null} onClick={() => setModId(null)} style={{ justifySelf: "start" }}>
                Sans mod
              </button>
              {offers.map(({ inst, check }) => (
                <ModChip
                  key={inst.id}
                  inst={inst}
                  pressed={inst.id === modId}
                  lockedReason={check.ok ? undefined : check.reason}
                  onClick={() => setModId(inst.id === modId ? null : inst.id)}
                />
              ))}
            </div>
          )}
        </div>

        {ex.metronome && (
          <div className="summary-bpm">
            <span className="num">{targetBpm}</span>
            <span className="dim">BPM imposés{preview && preview.level.tempoPct !== 0 ? ` (${preview.level.tempoPct > 0 ? "+" : ""}${preview.level.tempoPct} %)` : ""}</span>
          </div>
        )}

        <LaunchMission modRarity={selected?.rarity ?? "none"} />

        {missing.map((m) => <p key={m} className="error">{missingLabel[m]}</p>)}
        {error && <p className="error">{error}</p>}

        <div className="launch-go">
          <button type="button" className="btn primary big" disabled={!canLaunch} onClick={launch}>
            Lancer le bloc <span className="kbd">Espace</span>
          </button>
        </div>
      </section>
    </div>
    </div>
  );
}

const WITH_MODS = exercisesWithMods(MODS);
