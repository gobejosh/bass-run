import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { FinishResult } from "../core/block";
import { TIERS, type Tier } from "../core/library";
import type { AppConfig } from "../core/config";
import { isoDate } from "../core/planning";
import { followUp } from "../core/session";
import type { Dictionaries } from "../core/theory/dictionaries";
import type { BlockRecord } from "../core/types";
import { Repo } from "../storage/repo";
import { bootGame, TeamTab } from "../integration/game";
import { Ctx, type AppCtx, type Session } from "./context";
import { DebriefScreen } from "./screens/Debrief";
import { HistoryScreen } from "./screens/History";
import { InventoryScreen } from "./screens/Inventory";
import { LaunchScreen } from "./screens/Launch";
import { LootScreen, type NextInSession } from "./screens/Loot";
import { PlanningScreen } from "./screens/Planning";
import { RepertoireScreen } from "./screens/Repertoire";
import { RunScreen, type RunResult } from "./screens/Run";
import { SettingsScreen } from "./screens/Settings";
import { hasUpdate, onUpdate } from "./swUpdate";
import { blockTitle, presetFor, TodayScreen, type LaunchPreset } from "./screens/Today";

type Tab = "aujourdhui" | "planning" | "repertoire" | "mods" | "lowend" | "journal" | "reglages";

const ICON: Record<Tab, string> = {
  aujourdhui: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2",
  planning: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  repertoire: "M9 18V5l11-2v13M6 21a3 3 0 1 0 0-6a3 3 0 1 0 0 6M17 19a3 3 0 1 0 0-6a3 3 0 1 0 0 6",
  mods: "M4 7l8-4l8 4v10l-8 4l-8-4zM4 7l8 4l8-4M12 11v10",
  lowend: "M3 21V10l6-4v15M9 21V3l9 4v14M2 21h20M13 9h1M13 13h1M13 17h1",
  journal: "M5 4h11l3 3v13H5zM9 10h6M9 14h6",
  reglages: "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
};
const TABS: [Tab, string][] = [
  ["aujourdhui", "Aujourd'hui"],
  ["planning", "Planning"],
  ["repertoire", "Répertoire"],
  ["mods", "Mods"],
  ["lowend", "LOW END"],
  ["journal", "Journal"],
];

type Phase =
  | { kind: "idle" }
  | { kind: "launch"; preset?: LaunchPreset }
  | { kind: "run"; session: Session }
  | { kind: "debrief"; block: BlockRecord; run: RunResult }
  | { kind: "loot"; result: FinishResult; session: { next: NextInSession | null } | null };

export function App() {
  const [ctx, setCtx] = useState<AppCtx | null>(null);
  const [tab, setTab] = useState<Tab>("aujourdhui");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [orphan, setOrphan] = useState<BlockRecord | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [update, setUpdate] = useState(hasUpdate());
  useEffect(() => onUpdate(() => setUpdate(true)), []);

  const load = useCallback(async (repo: Repo) => {
    const [cfg, dicts]: [AppConfig, Dictionaries] = await Promise.all([repo.config(), repo.dictionaries()]);
    setCtx({ repo, cfg, dicts, refresh: () => load(repo) });
  }, []);

  useEffect(() => {
    // Demande au navigateur de ne pas effacer la base en cas de manque de place.
    void navigator.storage?.persist?.().catch(() => undefined);
    Repo.open()
      .then(async (repo) => {
        await load(repo);
        setOrphan((await repo.openBlock()) ?? null);
        // Le jeu démarre à côté, sans jamais bloquer ni retarder la pratique.
        bootGame(repo);
      })
      .catch((e) => setFatal(`Impossible d'ouvrir la base locale : ${e instanceof Error ? e.message : e}`));
  }, [load]);

  if (fatal) return <div className="app-main"><p className="error" style={{ marginTop: 40 }}>{fatal}</p></div>;
  if (!ctx) return null;

  const scene = phase.kind === "run" || phase.kind === "debrief";
  // Pendant un bloc : aucune animation ni transition (themes.css), le thème ne change pas.
  document.body.classList.toggle("is-in-block", phase.kind === "run");

  async function abandon(block: BlockRecord, playedSeconds: number) {
    await ctx!.repo.abandon(block.id, playedSeconds);
    setPhase({ kind: "idle" });
  }

  /** Après un bloc de séance : le bloc suivant encore à faire, s'il y en a. */
  async function nextInSession(block: BlockRecord): Promise<{ next: NextInSession | null } | null> {
    if (!block.sessionBlockId) return null;
    const date = isoDate(new Date(block.startedAt));
    const [plan, blocks, pieces] = await Promise.all([ctx!.repo.session(date), ctx!.repo.blocks(), ctx!.repo.pieces()]);
    if (!plan || !plan.blocks.some((b) => b.id === block.sessionBlockId)) return null;
    const done = followUp(plan, blocks, date).doneIds;
    const next = plan.blocks.find((b) => !done.includes(b.id));
    return { next: next ? { preset: presetFor(plan, next), title: blockTitle(next, pieces) } : null };
  }

  let body: ReactNode;
  if (phase.kind === "run") {
    body = (
      <RunScreen
        session={phase.session}
        onDebrief={(run) => setPhase({ kind: "debrief", block: phase.session.block, run })}
        onAbandon={(s) => void abandon(phase.session.block, s)}
      />
    );
  } else if (phase.kind === "debrief") {
    body = (
      <DebriefScreen
        block={phase.block}
        playedSeconds={phase.run.playedSeconds}
        lastBpm={phase.run.lastBpm}
        auto={phase.run.auto}
        onSubmit={async (d) => {
          const result = await ctx.repo.finish(phase.block.id, d, phase.run.playedSeconds);
          const { pieceId, melodyId, passageId } = phase.block.draws as { pieceId?: string; melodyId?: string; passageId?: string };
          const pid = pieceId ?? melodyId;
          const tier = d.measures.palier;
          if (phase.block.exerciseId === "REP-01" && pid && passageId && typeof tier === "string" && (TIERS as readonly string[]).includes(tier)) {
            await ctx.repo.setPassageTier(pid, passageId, tier as Tier);
          }
          setPhase({ kind: "loot", result, session: await nextInSession(phase.block) });
        }}
        onAbandon={() => void abandon(phase.block, phase.run.playedSeconds)}
      />
    );
  } else if (phase.kind === "loot") {
    body = (
      <LootScreen
        result={phase.result}
        session={phase.session}
        onDone={() => { setTab("aujourdhui"); setPhase({ kind: "idle" }); }}
        onNext={(preset) => setPhase({ kind: "launch", preset })}
      />
    );
  } else if (phase.kind === "launch") {
    body = (
      <LaunchScreen
        key={phase.preset?.sessionBlockId ?? "libre"}
        preset={phase.preset}
        onBack={() => setPhase({ kind: "idle" })}
        onLaunched={(session) => { setOrphan(null); setPhase({ kind: "run", session }); }}
      />
    );
  } else {
    body = {
      aujourdhui: <TodayScreen onLaunch={(preset) => setPhase({ kind: "launch", preset })} onFree={() => setPhase({ kind: "launch" })} />,
      planning: <PlanningScreen onSettings={() => setTab("reglages")} />,
      repertoire: <RepertoireScreen />,
      mods: <InventoryScreen />,
      lowend: <TeamTab />,
      journal: <HistoryScreen />,
      reglages: <SettingsScreen />,
    }[tab];
  }

  const go = (t: Tab) => { setTab(t); if (phase.kind !== "idle") setPhase({ kind: "idle" }); };
  const navItem = ([id, label]: [Tab, string]) => (
    <button key={id} type="button" className="navrail-item" aria-current={!scene && phase.kind !== "launch" && tab === id ? "page" : undefined} onClick={() => go(id)}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[id]} /></svg>
      <span>{label}</span>
    </button>
  );

  return (
    <Ctx.Provider value={ctx}>
      <div className="app-shell" data-scene={scene}>
        {!scene && (
          <nav className="navrail" aria-label="Navigation principale">
            <div className="navrail-brand" aria-label="Basse Run">B<span>//</span>R</div>
            {TABS.map(navItem)}
            <div className="navrail-spacer" />
            {navItem(["reglages", "Réglages"])}
          </nav>
        )}
        <main className="app-main">
          {orphan && phase.kind === "idle" && (
            <div className="notice">
              <span>Un bloc {orphan.exerciseId} est resté ouvert depuis le {new Date(orphan.startedAt).toLocaleString("fr-FR")}.</span>
              <button type="button" className="btn" onClick={() => {
                const played = Math.min(orphan.plannedMinutes * 60, Math.round((Date.now() - orphan.startedAt) / 1000));
                setOrphan(null);
                setPhase({ kind: "debrief", block: orphan, run: { playedSeconds: played, lastBpm: orphan.targetBpm, auto: {} } });
              }}>Le débriefer</button>
              <button type="button" className="btn danger" onClick={() => {
                void ctx.repo.abandon(orphan.id, 0).then(() => setOrphan(null));
              }}>L'abandonner</button>
            </div>
          )}
          {update && phase.kind === "idle" && (
            <div className="notice" role="status">
              <span>Une nouvelle version de l'app est installée. Elle s'appliquera au prochain démarrage.</span>
              <button type="button" className="btn" onClick={() => location.reload()}>Recharger maintenant</button>
              <button type="button" className="btn ghost" onClick={() => setUpdate(false)}>Plus tard</button>
            </div>
          )}
          {body}
        </main>
      </div>
    </Ctx.Provider>
  );
}
