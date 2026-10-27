// LOW END — simulateur d'une saison de pratique.
// Usage : npm run sim -- [scenario] [runs]   ou   node tools/sim.mjs [scenario] [runs]   (scénarios : type, leger, intense, sansmods, tardif, all)
// Fait tourner le vrai moteur (engine.js) avec un joueur automatique et imprime la courbe de progression.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../src/game/engine/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(here, '..', 'src', 'game', 'engine', 'config', f), 'utf8'));
const cfg = E.buildConfig({
  core: load('core.json'), roles: load('roles.json'), traits: load('traits.json'), districts: load('districts.json'),
  contracts: load('contracts.json'), items: load('items.json'), affixes: load('affixes.json'), planque: load('planque.json'), names: load('names.json'),
});

const AXES = ['MAN', 'WLK', 'MOD', 'IMP', 'RYT', 'EAR', 'REP', 'DEC'];
const NO_MOD_AXES = new Set(['RYT', 'EAR']);
// Rareté du mod équipé : mélange des tables de drop existantes (notes 1-3 : 40 %, 4 : 40 %, 5 : 20 %) + pitié.
const MOD_RARITY = { recup: 0.31, street: 0.30, corpo: 0.21, prototype: 0.14, fantome: 0.04 };

export const SCENARIOS = {
  type:     { label: '4 blocs/jour, 5 j/sem',            perDay: 4, days: [1, 2, 3, 4, 5],       modUse: 0.6, abandon: 0.05, start: '2026-09-01', end: '2027-06-30' },
  leger:    { label: '2 blocs/jour, 4 j/sem',            perDay: 2, days: [1, 2, 4, 5],          modUse: 0.6, abandon: 0.05, start: '2026-09-01', end: '2027-06-30' },
  intense:  { label: '6 blocs/jour, 6 j/sem',            perDay: 6, days: [1, 2, 3, 4, 5, 6],    modUse: 0.6, abandon: 0.05, start: '2026-09-01', end: '2027-06-30' },
  sansmods: { label: '4 blocs/jour, jamais de mod',      perDay: 4, days: [1, 2, 3, 4, 5],       modUse: 0.0, abandon: 0.05, start: '2026-09-01', end: '2027-06-30' },
  tardif:   { label: '4 blocs/jour, départ le 2 nov.',   perDay: 4, days: [1, 2, 3, 4, 5],       modUse: 0.6, abandon: 0.05, start: '2026-11-02', end: '2027-06-30' },
};
// Semaines sans pratique (vacances) : Noël x2, février, avril.
const OFF = [['2026-12-19', '2027-01-03'], ['2027-02-20', '2027-02-28'], ['2027-04-17', '2027-04-25']];
const isOff = (d) => OFF.some(([a, b]) => d >= a && d <= b);

function* days(start, end) {
  for (let t = Date.parse(start); t <= Date.parse(end); t += 864e5) yield new Date(t).toISOString().slice(0, 10);
}

function contractValue(state, c, mod) {
  const best = E.suggestSquad(state, cfg, c, mod);
  if (!best) return null;
  const t = cfg.tierDef(c.tier);
  const o = best.odds;
  const pWin = o.success + o.critSuccess;
  const rep = t.rep * c.rewardMult; const cr = t.credits * c.rewardMult;
  const v = c.kind === 'op'
    ? 1000 * pWin
    : pWin * (rep + cr / 10) + o.partial * 0.45 * (rep + cr / 10) - (o.fail + o.critFail) * (6 + 3 * c.tier);
  return { v, squad: best.ids, odds: o };
}

function manage(state, rng) {
  for (const r of state.runners) if (r.pendingTalents) E.chooseTalent(state, r.id, rng.pick(r.pendingTalents));
  E.autoEquip(state, cfg);
  // Recrutement : rôles manquants d'abord, jamais plus de 2 runners du même rôle.
  const power = (r) => r.level * cfg.rarityById[r.rarity].recruitGrowth;
  const roleCount = (role) => state.runners.filter((r) => r.role === role).length;
  const cands = state.candidates.slice().sort((a, b) => (roleCount(a.role) - roleCount(b.role)) || (power(b) - power(a)));
  for (const c of cands) {
    const cost = E.recruitCost(state, cfg, c);
    if (state.runners.length < cfg.core.recruit.maxRoster) {
      if (roleCount(c.role) < cfg.core.recruit.maxSameRole && state.credits >= cost) { E.recruit(state, cfg, c.id); E.autoEquip(state, cfg); }
    } else {
      const same = state.runners.filter((r) => r.role === c.role);
      const pool = roleCount(c.role) >= cfg.core.recruit.maxSameRole ? same : state.runners.filter((r) => roleCount(r.role) >= 2 || roleCount(c.role) === 0 ? true : r.role === c.role);
      const weakest = pool.slice().sort((a, b) => power(a) - power(b))[0];
      if (weakest && power(c) >= power(weakest) * 1.25 && state.credits >= cost + 400) { if (E.recruit(state, cfg, c.id, weakest.id)) E.autoEquip(state, cfg); }
    }
  }
  // Clinique
  for (const r of state.runners) if (r.injury && r.injury.blocksLeft >= 3 && state.credits >= 2 * E.clinicCost(state, cfg, r) + 200) E.heal(state, cfg, r.id);
  // Recalibrage des objets équipés quand on est à l'aise
  for (const r of state.runners) for (const slot of ['arme', 'implant', 'outil']) {
    const id = r.gear[slot]; if (!id) continue;
    const cost = E.upgradeCost(state, cfg, state.items[id]);
    if (cost != null && state.credits >= cost * 2 + 500 && cfg.rarityById[state.items[id].rarity].rank >= 3) E.upgradeItem(state, cfg, id);
  }
  // Planque
  if (state.runners.length >= cfg.core.recruit.maxRoster) {
    const opts = cfg.planque.modules.map((m) => [m.id, m.costs[state.planque[m.id]]]).filter(([, c]) => c != null).sort((a, b) => a[1] - b[1]);
    if (opts.length && state.credits >= opts[0][1] * 1.3) E.buyModule(state, cfg, opts[0][0]);
  }
}

export function simulate(scn, seed) {
  const S = SCENARIOS[scn];
  const state = E.newGame(cfg, { seed: `${scn}-${seed}`, seasonStart: S.start, seasonEnd: S.end });
  const rng = E.makeRng(E.hash32('player', scn, seed));
  const weeks = [];
  const unlockWeek = {}; let gcWeek = null; let fourWeek = null;
  const counts = { critSuccess: 0, success: 0, partial: 0, fail: 0, critFail: 0, aborted: 0 };
  const byKind = { c: { ...counts }, g: { ...counts }, op: { ...counts } };
  let blocks = 0; let wk = { n: 0, blocks: 0, out: { ...counts } };
  let blockId = 0; let injuredBlocks = 0; let rosterBlocks = 0;
  const startT = Date.parse(S.start);
  const modSum = {}; const modN = {}; let idleBlocks = 0;
  let gearRare = { recup: 0, street: 0, corpo: 0, prototype: 0, fantome: 0 };
  for (const date of days(S.start, S.end)) {
    const week = Math.floor((Date.parse(date) - startT) / (7 * 864e5)) + 1;
    if (week !== wk.n) {
      if (wk.n) weeks.push(snapshot(state, wk));
      wk = { n: week, blocks: 0, out: { ...counts } };
    }
    const dow = new Date(date).getUTCDay(); // 0 = dimanche
    if (!S.days.includes(dow) || isOff(date)) continue;
    const board = E.getBoard(state, cfg, date);
    for (let b = 0; b < S.perDay; b++) {
      blockId++;
      const axis = rng.pick(AXES);
      const mod = !NO_MOD_AXES.has(axis) && rng.chance(S.modUse) ? rng.weighted(MOD_RARITY) : 'none';
      const options = board.contracts.filter((c) => !c.taken);
      const op = E.getOpContract(state, cfg, date);
      if (op) options.push(op);
      let pick = null;
      for (const c of options) {
        const v = contractValue(state, c, mod);
        if (v && (!pick || v.v > pick.v)) pick = { ...v, c };
      }
      let contract; let squad;
      if (pick) { contract = pick.c; squad = pick.squad; } else {
        contract = E.makeGig(state, cfg, date, blockId);
        squad = E.suggestSquad(state, cfg, contract, mod)?.ids;
      }
      if (squad) {
        E.startMission(state, contract, squad, `b${blockId}`);
        const ev = E.evaluate(state, cfg, contract, squad, 'none');
        if (contract.kind === 'c') { modSum[week] = (modSum[week] ?? 0) + ev.modifier; modN[week] = (modN[week] ?? 0) + 1; }
      } else idleBlocks++;
      const completed = !rng.chance(S.abandon);
      const rep = E.endBlock(state, cfg, { id: `b${blockId}`, date, completed, modRarity: completed ? mod : 'none', axis, exerciseId: `${axis}-01`, tempo: 120 + rng.int(0, 80) });
      blocks++; wk.blocks++;
      if (rep.outcome) { counts[rep.outcome]++; wk.out[rep.outcome]++; byKind[contract.kind][rep.outcome]++; }
      for (const id of rep.rewards.items) gearRare[state.items[id]?.rarity] = (gearRare[state.items[id]?.rarity] ?? 0) + 1;
      for (const e of rep.events) {
        if (e.kind === 'unlock') unlockWeek[e.tier] = week;
        if (e.kind === 'grandCoupDone') gcWeek = week;
      }
      injuredBlocks += state.runners.filter((r) => r.injury).length; rosterBlocks += state.runners.length;
      if (state.runners.length >= 4 && fourWeek == null) fourWeek = week;
      manage(state, rng);
    }
  }
  weeks.push(snapshot(state, wk));
  const modCurve = Object.keys(modSum).map((w) => [+w, modSum[w] / modN[w]]);
  const roles = state.runners.map((r) => r.role).sort().join('+');
  return { scn, seed, roles, weeks, modCurve, idleBlocks, unlockWeek, gcWeek, fourWeek, counts, byKind, blocks, injuredShare: injuredBlocks / rosterBlocks, gearRare, final: snapshot(state, wk), state };
}

function snapshot(state, wk) {
  const lv = state.runners.map((r) => r.level);
  return {
    week: wk.n, blocks: wk.blocks, rep: Math.round(state.rep), credits: state.credits, maxTier: state.maxTier,
    roster: state.runners.length, avgLevel: lv.reduce((s, x) => s + x, 0) / lv.length, maxLevel: Math.max(...lv),
    planque: Object.values(state.planque).reduce((s, x) => s + x, 0), heat: state.districts[5].alert, alerts: state.districts.map((d) => d.alert).join(','), gc: state.grandCoup.stage,
    out: wk.out,
  };
}

// ───────────── Agrégation Monte-Carlo ─────────────

const pct = (arr, p) => { const a = arr.filter((x) => x != null).sort((x, y) => x - y); if (!a.length) return null; return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };

export function runScenario(scn, runs = 200) {
  const res = [];
  for (let s = 0; s < runs; s++) res.push(simulate(scn, s));
  const nW = Math.max(...res.map((r) => r.weeks.length));
  const curve = [];
  for (let w = 0; w < nW; w++) {
    const at = res.map((r) => r.weeks[Math.min(w, r.weeks.length - 1)]);
    const out = at.reduce((o, x) => { for (const k in x.out) o[k] = (o[k] ?? 0) + x.out[k]; return o; }, {});
    const tot = Object.values(out).reduce((s, x) => s + x, 0) || 1;
    curve.push({
      week: w + 1,
      tierMed: pct(at.map((x) => x.maxTier), 0.5), tierP10: pct(at.map((x) => x.maxTier), 0.1), tierP90: pct(at.map((x) => x.maxTier), 0.9),
      rep: pct(at.map((x) => x.rep), 0.5), avgLevel: +(at.reduce((s, x) => s + x.avgLevel, 0) / at.length).toFixed(1),
      credits: pct(at.map((x) => x.credits), 0.5), roster: +(at.reduce((s, x) => s + x.roster, 0) / at.length).toFixed(2),
      win: (out.success + out.critSuccess) / tot, mod: (() => { const v = res.map((r) => r.modCurve.find((x) => x[0] === w + 1)?.[1]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; })(), partial: out.partial / tot, fail: (out.fail + out.critFail) / tot, blocks: at[0].blocks,
    });
  }
  const sum = (k) => res.reduce((o, r) => { for (const x in r[k]) o[x] = (o[x] ?? 0) + r[k][x]; return o; }, {});
  const counts = sum('counts'); const total = Object.values(counts).reduce((s, x) => s + x, 0);
  const contractsOnly = res.reduce((o, r) => { for (const x in r.byKind.c) o[x] = (o[x] ?? 0) + r.byKind.c[x]; return o; }, {});
  const cTot = Object.values(contractsOnly).reduce((s, x) => s + x, 0);
  const unlock = {};
  for (let t = 2; t <= 6; t++) unlock[t] = { p10: pct(res.map((r) => r.unlockWeek[t] ?? null), 0.1), med: pct(res.map((r) => r.unlockWeek[t] ?? null), 0.5), p90: pct(res.map((r) => r.unlockWeek[t] ?? null), 0.9), reached: res.filter((r) => r.unlockWeek[t]).length / runs };
  const gearRare = sum('gearRare');
  return {
    scn, label: SCENARIOS[scn].label, runs, blocks: res[0].blocks,
    unlock,
    grandCoup: { med: pct(res.map((r) => r.gcWeek), 0.5), p10: pct(res.map((r) => r.gcWeek), 0.1), p90: pct(res.map((r) => r.gcWeek), 0.9), done: res.filter((r) => r.gcWeek).length / runs },
    fourRunners: pct(res.map((r) => r.fourWeek), 0.5),
    roles: Object.entries(res.reduce((o, r) => { o[r.roles] = (o[r.roles] ?? 0) + 1; return o; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3),
    outcomes: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, +(v / total).toFixed(3)])),
    contractOutcomes: Object.fromEntries(Object.entries(contractsOnly).map(([k, v]) => [k, +(v / cTot).toFixed(3)])),
    injuredShare: +(res.reduce((s, r) => s + r.injuredShare, 0) / runs).toFixed(3),
    final: {
      avgLevel: +(res.reduce((s, r) => s + r.final.avgLevel, 0) / runs).toFixed(1),
      maxLevel: pct(res.map((r) => r.final.maxLevel), 0.5),
      credits: pct(res.map((r) => r.final.credits), 0.5),
      planque: +(res.reduce((s, r) => s + r.final.planque, 0) / runs).toFixed(1),
      heat: pct(res.map((r) => r.final.heat), 0.5),
    },
    gearPerRun: Object.fromEntries(Object.entries(gearRare).map(([k, v]) => [k, +(v / runs).toFixed(1)])),
    idle: +(res.reduce((s, r) => s + r.idleBlocks, 0) / runs).toFixed(1),
    curve,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const which = process.argv[2] ?? 'all';
  const runs = +(process.argv[3] ?? 200);
  const list = which === 'all' ? Object.keys(SCENARIOS) : [which];
  const all = {};
  for (const s of list) {
    const r = runScenario(s, runs);
    all[s] = r;
    console.log(`\n== ${s} · ${r.label} · ${r.blocks} blocs · ${runs} parties`);
    console.log('Déblocage (semaine p10/médiane/p90, part atteinte) :', Object.entries(r.unlock).map(([t, u]) => `P${t} ${u.p10}/${u.med}/${u.p90} (${Math.round(u.reached * 100)} %)`).join(' · '));
    console.log('Grand Coup :', r.grandCoup, '· 4 runners médiane semaine', r.fourRunners, '· compositions finales :', JSON.stringify(r.roles));
    console.log('Issues tous blocs :', r.outcomes);
    console.log('Issues contrats :', r.contractOutcomes, '· part de runners blessés :', r.injuredShare);
    console.log('Fin de saison :', r.final, '· objets/partie :', r.gearPerRun);
    console.log('blocs sans mission (moy.) :', (res => res)(r.idle));
    console.log('sem | palier p10-med-p90 | rép | niv moy | crédits | équipe | succès/partiel/échec | modif. moyen');
    for (const c of r.curve.filter((c) => c.week % 3 === 0 || c.week <= 4)) {
      console.log(`${String(c.week).padStart(3)} | ${c.tierP10}-${c.tierMed}-${c.tierP90} | ${String(c.rep).padStart(5)} | ${c.avgLevel.toFixed(1).padStart(4)} | ${String(c.credits).padStart(6)} | ${c.roster} | ${(c.win * 100).toFixed(0)}/${(c.partial * 100).toFixed(0)}/${(c.fail * 100).toFixed(0)} | ${c.mod?.toFixed(1)}`);
    }
  }
  writeFileSync(join(here, '..', 'docs', 'game', 'sim-results.json'), JSON.stringify(all, null, 1));
}
