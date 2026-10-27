// LOW END — moteur du jeu parallèle.
// Module pur (aucune dépendance, aucun accès réseau ni stockage) : la PWA l'appelle,
// le simulateur aussi. Toute l'aléa passe par des graines dérivées de state.seed,
// donc un rechargement ne relance jamais un tirage.

// ───────────────────────── Hasard déterministe ─────────────────────────

export function hash32(...parts) {
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    // obj = { cle: poids } ou tableau d'objets portant .weight
    weighted: (obj) => {
      const entries = Array.isArray(obj) ? obj.map((o) => [o, o.weight ?? 1]) : Object.entries(obj);
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [k, w] of entries) { r -= w; if (r < 0) return k; }
      return entries[entries.length - 1][0];
    },
    shuffle: (arr) => {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; }
      return a2;
    },
  };
  return rng;
}

const round05 = (x) => Math.round(x * 2) / 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const STATS = ['PIR', 'CBT', 'MAT', 'SOC'];
const OUTCOME_ORDER = ['critFail', 'fail', 'partial', 'success', 'critSuccess'];

// ───────────────────────── Configuration ─────────────────────────

export function buildConfig(raw) {
  const cfg = { ...raw };
  cfg.rarityById = Object.fromEntries(raw.core.rarities.map((r) => [r.id, r]));
  cfg.rarityByRank = Object.fromEntries(raw.core.rarities.map((r) => [r.rank, r]));
  cfg.roleById = Object.fromEntries(raw.roles.roles.map((r) => [r.id, r]));
  cfg.traitById = Object.fromEntries(raw.traits.traits.map((t) => [t.id, t]));
  cfg.talentById = {};
  for (const [k, list] of Object.entries(raw.traits.talents)) {
    if (!Array.isArray(list)) continue;
    for (const t of list) cfg.talentById[t.id] = { ...t, pool: k };
  }
  cfg.typeById = Object.fromEntries(raw.contracts.types.map((t) => [t.id, t]));
  cfg.complicationById = Object.fromEntries(raw.contracts.complications.map((c) => [c.id, c]));
  cfg.baseById = Object.fromEntries(raw.items.bases.map((b) => [b.id, b]));
  cfg.affixById = Object.fromEntries([...raw.affixes.prefixes, ...raw.affixes.suffixes].map((a) => [a.id, a]));
  cfg.signatureById = Object.fromEntries(raw.affixes.signatures.effects.map((s) => [s.id, s]));
  cfg.districtTraitById = Object.fromEntries(raw.districts.traits.map((t) => [t.id, t]));
  cfg.tierDef = (t) => raw.districts.tiers[t - 1];
  cfg.moduleById = Object.fromEntries(raw.planque.modules.map((m) => [m.id, m]));
  return cfg;
}

// ───────────────────────── Effets ─────────────────────────

function whenMatches(when, ctx) {
  if (!when) return true;
  if (!ctx) return false;
  if (when.type && ctx.type !== when.type) return false;
  if (when.stat && !(ctx.weights && ctx.weights[when.stat] > 0)) return false;
  if (when.crewMax != null && !(ctx.crew <= when.crewMax)) return false;
  if (when.tierMin != null && !(ctx.tier >= when.tierMin)) return false;
  return true;
}

export function sumEffects(effects, kind, ctx, stat) {
  let s = 0;
  for (const e of effects) {
    if (e.kind !== kind) continue;
    if (stat && e.stat && e.stat !== stat && e.stat !== 'all') continue;
    if (!whenMatches(e.when, ctx)) continue;
    s += e.value;
  }
  return s;
}

function itemEffects(item, cfg) {
  if (!item) return [];
  const out = [];
  for (const s of STATS) if (item.stats[s]) out.push({ kind: 'stat', stat: s, value: item.stats[s] });
  for (const a of item.affixes) out.push(a);
  if (item.signature) out.push(...cfg.signatureById[item.signature].effects);
  return out;
}

export function runnerEffects(state, cfg, runner) {
  const eff = [];
  if (runner.trait) eff.push(...cfg.traitById[runner.trait].effects);
  for (const t of runner.talents) eff.push(...cfg.talentById[t].effects);
  for (const slot of ['arme', 'implant', 'outil']) {
    const id = runner.gear[slot];
    if (id) eff.push(...itemEffects(state.items[id], cfg));
  }
  return eff;
}

export function runnerStats(state, cfg, runner, effects = runnerEffects(state, cfg, runner)) {
  const role = cfg.roleById[runner.role];
  const pot = cfg.rarityById[runner.rarity].recruitGrowth;
  const traitEff = runner.trait ? cfg.traitById[runner.trait].effects : [];
  const out = {};
  for (const s of STATS) {
    const growthMod = 1 + sumEffects(traitEff, 'growth', null, s);
    const grown = role.base[s] + role.growth[s] * (runner.level - 1) * pot * growthMod;
    out[s] = Math.max(0, grown + sumEffects(effects, 'stat', null, s));
  }
  return out;
}

// ───────────────────────── Génération : noms, runners, objets ─────────────────────────

function runnerName(cfg, rng) {
  const n = cfg.names;
  return { first: rng.pick(n.first), handle: rng.pick(n.handles), last: rng.pick(n.last) };
}

export function displayName(r) { return `${r.name.first} « ${r.name.handle} » ${r.name.last}`; }

export function createRunner(state, cfg, rng, { role, rarity, level }) {
  const id = `r${++state.counters.ids}`;
  const runner = {
    id, role, rarity, level, xp: 0,
    name: runnerName(cfg, rng),
    trait: rng.pick(cfg.traits.traits).id,
    talents: [], pendingTalents: null,
    gear: { arme: null, implant: null, outil: null },
    injury: null,
    avatarSeed: rng.int(0, 2 ** 31),
    missions: 0, successes: 0,
  };
  return runner;
}

export function generateItem(state, cfg, rng, { slot, tier, rarity, baseId = null }) {
  const rar = cfg.rarityById[rarity];
  const bases = cfg.items.bases.filter((b) => b.slot === slot);
  const base = baseId ? cfg.baseById[baseId] : rng.pick(bases);
  const b = cfg.items.budget;
  const budget = (b.base + b.perTier * tier) * rar.gearStatMult * (b.jitter[0] + rng.next() * (b.jitter[1] - b.jitter[0]));
  const stats = {};
  for (const s of STATS) stats[s] = base.weights[s] ? round05(budget * base.weights[s]) : 0;

  const affixes = [];
  const used = new Set();
  let prefix = null; let suffix = null;
  for (let i = 0; i < rar.affixes; i++) {
    const wantPrefix = !prefix && rng.chance(0.4);
    const pool = (wantPrefix ? cfg.affixes.prefixes : cfg.affixes.suffixes).filter((a) => !used.has(a.id));
    const a = rng.weighted(pool);
    used.add(a.id);
    if (wantPrefix) prefix = a; else if (!suffix) suffix = a;
    const e = a.effect;
    const value = e.base != null ? Math.max(0.5, round05(e.base + e.perTier * tier)) : e.value;
    affixes.push({ id: a.id, kind: e.kind, stat: e.stat, value, when: e.when });
  }
  let signature = null; let properName = null;
  if (rar.signature) {
    signature = rng.pick(cfg.affixes.signatures.effects).id;
    properName = `${rng.pick(cfg.affixes.signatures.names1)} ${rng.pick(cfg.affixes.signatures.names2)}`;
  }
  let name = base.name;
  if (prefix) name += ` ${prefix.forms[base.g]}`;
  if (suffix) name += ` ${suffix.name}`;
  if (properName) name = `${base.name} « ${properName} »`;
  const id = `i${++state.counters.ids}`;
  const item = { id, slot, baseId: base.id, tier, rarity, stats, affixes, signature, name, forged: null };
  state.items[id] = item;
  return item;
}

// ───────────────────────── Nouvelle partie ─────────────────────────

function districtName(cfg, rng, used) {
  for (let k = 0; k < 50; k++) {
    const n = rng.pick(cfg.districts.names.nouns);
    const q = rng.pick(cfg.districts.names.qualifiers);
    const art = n.art === "L'" ? "L'" : `${n.art} `;
    const name = `${art}${n.w} ${q[n.g]}`;
    if (!used.has(n.w)) { used.add(n.w); return name; }
  }
  return 'Zone inconnue';
}

function factionName(cfg, rng) {
  const f = cfg.districts.factions;
  if (rng.chance(0.35)) return rng.pick(f.gangs);
  return `${rng.pick(f.syl1)}${rng.pick(f.syl2)} ${rng.pick(f.suffix)}`;
}

export function newGame(cfg, { seed, seasonStart, seasonEnd }) {
  const rng = makeRng(hash32(seed, 'new'));
  const state = {
    version: 1, seed: String(seed),
    season: { start: seasonStart, end: seasonEnd },
    credits: cfg.core.start.credits, rep: 0, maxTier: 1,
    districts: [], runners: [], items: {}, inventory: [],
    planque: Object.fromEntries(cfg.planque.modules.map((m) => [m.id, 0])),
    board: null, candidates: [], activeMission: null,
    grandCoup: { open: false, stage: 0, done: false, lastAttemptDate: null },
    bestHeat: 0,
    codex: [], cosmetics: { owned: [], equipped: {} }, log: [],
    counters: { ids: 0, blocksCompleted: 0, blocksSinceForge: 0, axisSinceForge: {}, recruitRefresh: 0, missions: 0 },
  };
  const used = new Set();
  const palette = rng.shuffle(cfg.districts.palette);
  const traits = rng.shuffle(cfg.districts.traits);
  for (let t = 1; t <= 6; t++) {
    state.districts.push({
      tier: t, name: districtName(cfg, rng, used), faction: factionName(cfg, rng),
      color: palette[(t - 1) % palette.length], trait: traits[t - 1].id,
      revealed: t === 1, alert: 0, mapSeed: rng.int(0, 2 ** 31),
    });
  }
  for (const r of cfg.core.start.runners) state.runners.push(createRunner(state, cfg, rng, r));
  for (const g of cfg.core.start.gear) {
    const it = generateItem(state, cfg, rng, { slot: g.slot, tier: g.tier, rarity: g.rarity });
    state.inventory.push(it.id);
  }
  autoEquip(state, cfg);
  refreshCandidates(state, cfg);
  return state;
}

// ───────────────────────── Saison, actes, rattrapage ─────────────────────────

export function seasonFraction(state, date) {
  const s = Date.parse(state.season.start); const e = Date.parse(state.season.end);
  return clamp((Date.parse(date) - s) / (e - s), 0, 1);
}

export function tierOpen(state, cfg, tier, date) {
  const f = seasonFraction(state, date);
  const act = cfg.core.season.acts.find((a) => a.tiers.includes(tier));
  return f >= act.opensAt;
}

export function targetRep(cfg, f) {
  const pts = cfg.core.season.catchUp.targetRepAtFraction;
  for (let i = 1; i < pts.length; i++) {
    if (f <= pts[i][0]) {
      const [f0, r0] = pts[i - 1]; const [f1, r1] = pts[i];
      return r0 + (r1 - r0) * (f - f0) / (f1 - f0);
    }
  }
  return pts[pts.length - 1][1];
}

export function catchUp(state, cfg, date) {
  const tgt = targetRep(cfg, seasonFraction(state, date));
  for (const l of cfg.core.season.catchUp.levels) if (state.rep < l.below * tgt) return { rep: l.rep, xp: l.xp };
  return { rep: 1, xp: 1 };
}

function checkUnlocks(state, cfg, date, events) {
  for (let t = state.maxTier + 1; t <= 6; t++) {
    if (state.rep >= cfg.tierDef(t).repToUnlock && tierOpen(state, cfg, t, date)) {
      state.maxTier = t;
      state.districts[t - 1].revealed = true;
      events.push({ kind: 'unlock', tier: t, district: state.districts[t - 1].name });
    } else break;
  }
  const gcOpen = state.maxTier >= cfg.core.grandCoup.tier && seasonFraction(state, date) >= cfg.core.season.grandCoupOpensAt;
  if (gcOpen && !state.grandCoup.open) { state.grandCoup.open = true; events.push({ kind: 'grandCoupOpen' }); }
}

// ───────────────────────── Contrats ─────────────────────────

function makeContract(state, cfg, rng, { tier, slot, kind, date, idx }) {
  const tierDef = cfg.tierDef(tier);
  const type = rng.pick(cfg.contracts.types);
  const [v0, v1] = cfg.core.board.dcVariation;
  const complication = rng.chance(cfg.core.board.complicationChance) ? rng.pick(cfg.contracts.complications).id : null;
  return {
    id: `${date}#${kind}${idx}`, date, kind, slot: slot?.id ?? kind, tier,
    type: type.id, weights: type.weights, idealCrew: type.idealCrew,
    dcBase: tierDef.dcBase + (slot?.dcOffset ?? 0) + rng.int(v0, v1),
    complication,
    client: rng.chance(0.5) ? `${rng.pick(cfg.contracts.clients.roles)}, ${rng.pick(cfg.names.handles)}` : state.districts[tier - 1].faction,
    target: rng.pick(cfg.contracts.targets[type.id]),
    verb: rng.pick(cfg.contracts.verbs[type.id]),
    rewardMult: slot?.rewardMult ?? 1,
    gearRarityStep: slot?.gearRarityStep ?? 0,
    taken: false,
  };
}

export function getBoard(state, cfg, date) {
  if (state.board && state.board.date === date) return state.board;
  const rng = makeRng(hash32(state.seed, 'board', date));
  const contracts = cfg.core.board.slots.slice(0, cfg.core.board.contractsPerDay).map((slot, i) => {
    const tier = clamp(state.maxTier + slot.tierOffset, 1, state.maxTier);
    return makeContract(state, cfg, rng, { tier, slot, kind: 'c', date, idx: i });
  });
  state.board = { date, contracts, opAvailable: false };
  return state.board;
}

export function getOpContract(state, cfg, date) {
  const gc = state.grandCoup;
  if (!gc.open || gc.done || gc.lastAttemptDate === date) return null;
  const g = cfg.core.grandCoup;
  const t = cfg.tierDef(g.tier);
  return {
    id: `${date}#op${gc.stage}`, date, kind: 'op', slot: 'op', tier: g.tier, stage: gc.stage,
    type: 'operation', weights: g.weights, idealCrew: g.idealCrew,
    dcBase: t.dcBase + g.dcStep * (gc.stage + 1), complication: null,
    client: state.districts[5].faction, target: `étape ${gc.stage + 1} sur ${g.stages} du Grand Coup`, verb: 'Exécuter',
    rewardMult: 1, gearRarityStep: 1, taken: false,
  };
}

export function makeGig(state, cfg, date, blockId) {
  const rng = makeRng(hash32(state.seed, 'gig', blockId));
  const g = cfg.core.gig;
  const tier = clamp(state.maxTier + g.tierOffset, 1, 6);
  const c = makeContract(state, cfg, rng, { tier, slot: null, kind: 'g', date, idx: blockId });
  c.dcBase = cfg.tierDef(tier).dcBase + g.dcOffset;
  c.complication = null;
  c.rewardMult = 1;
  return c;
}

// ───────────────────────── Évaluation et cotes ─────────────────────────

function planqueValue(state, cfg, moduleId, field = 'value') {
  const lvl = state.planque[moduleId];
  if (!lvl) return 0;
  return cfg.moduleById[moduleId].levels[lvl - 1][field] ?? 0;
}

function envEffects(state, cfg, contract) {
  const eff = [...cfg.districtTraitById[state.districts[contract.tier - 1].trait].effects];
  if (contract.complication) eff.push(...cfg.complicationById[contract.complication].effects);
  return eff;
}

export function alertOf(state, contract) {
  return contract.kind === 'c' ? state.districts[contract.tier - 1].alert : 0;
}

export function evaluate(state, cfg, contract, squadIds, modRarity = 'none') {
  const runners = squadIds.map((id) => state.runners.find((r) => r.id === id));
  const effs = runners.map((r) => runnerEffects(state, cfg, r));
  const stats = runners.map((r, i) => runnerStats(state, cfg, r, effs[i]));
  const visible = runners.filter((r, i) => sumEffects(effs[i], 'stealth', null) <= 0).length;
  const ctx = { type: contract.type, weights: contract.weights, crew: runners.length, tier: contract.tier };
  const sq = cfg.core.squad;

  let score = 0; const leaders = new Set(); const perStat = {};
  for (const [s, w] of Object.entries(contract.weights)) {
    const order = runners.map((r, i) => i).sort((a, b) => stats[b][s] - stats[a][s]);
    const lead = order[0];
    leaders.add(lead);
    // Un seul soutien par stat : celui qui apporte le plus (stat x coefficient, bonus de soutien compris).
    let support = 0; let supporter = null;
    for (const i of order.slice(1)) {
      const v = stats[i][s] * (sq.supportCoef + sumEffects(effs[i], 'supportCoef', ctx));
      if (v > support) { support = v; supporter = runners[i].id; }
    }
    perStat[s] = { lead: runners[lead].id, leadValue: stats[lead][s], supporter, support };
    score += w * (stats[lead][s] + support);
  }
  let runnerRoll = 0;
  for (const i of leaders) runnerRoll += sumEffects(effs[i], 'roll', ctx);
  runnerRoll = Math.min(sq.runnerRollBonusCap, runnerRoll);

  const env = envEffects(state, cfg, contract);
  const envRoll = sumEffects(env, 'roll', ctx);
  let compDc = 0;
  if (contract.complication) compDc = Math.max(0, sumEffects(cfg.complicationById[contract.complication].effects, 'dc', ctx) - planqueValue(state, cfg, 'indics'));
  const traitDc = sumEffects(cfg.districtTraitById[state.districts[contract.tier - 1].trait].effects, 'dc', ctx);
  const alert = alertOf(state, contract);
  const dc = contract.dcBase + compDc + traitDc + alert * cfg.core.alert.dcPerPoint;
  const exposure = Math.max(0, visible - contract.idealCrew) * sq.exposurePenalty;
  const modBonus = cfg.core.modBonus[modRarity] ?? 0;
  const critRange = Math.min(2, effs.reduce((s, e) => s + sumEffects(e, 'critRange', ctx), 0));
  const fumbleRange = effs.reduce((s, e) => s + sumEffects(e, 'fumbleRange', ctx), 0);
  const modifier = score + runnerRoll + envRoll + modBonus - exposure - dc;
  return {
    score: Math.round(score * 10) / 10, dc, alert, runnerRoll, envRoll, modBonus, exposure, modifier, perStat,
    critAt: cfg.core.dice.critAtLeast - critRange,
    fumbleAt: cfg.core.dice.fumbleAtMost + fumbleRange,
    ctx,
  };
}

export function outcomeFor(ev, cfg, natural) {
  const margin = ev.modifier + natural;
  let idx = margin >= 0 ? 3 : margin >= cfg.core.dice.partialFloor ? 2 : 1;
  if (natural >= ev.critAt) idx = Math.min(4, idx === 3 ? 4 : idx + 1);
  else if (natural <= ev.fumbleAt) idx = Math.max(0, idx === 1 ? 0 : idx - 1);
  return { outcome: OUTCOME_ORDER[idx], margin: Math.round(margin * 10) / 10 };
}

const DIST = (() => { const d = {}; for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) d[a + b] = (d[a + b] ?? 0) + 0.01; return d; })();

export function odds(ev, cfg) {
  const o = { critFail: 0, fail: 0, partial: 0, success: 0, critSuccess: 0 };
  for (const [n, p] of Object.entries(DIST)) o[outcomeFor(ev, cfg, +n).outcome] += p;
  return o;
}

export function availableRunners(state) { return state.runners.filter((r) => !r.injury); }

export function suggestSquad(state, cfg, contract, modRarity = 'none') {
  const avail = availableRunners(state);
  let best = null;
  const n = avail.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const ids = avail.filter((_, i) => mask & (1 << i)).map((r) => r.id);
    if (ids.length > cfg.core.squad.max) continue;
    const o = odds(evaluate(state, cfg, contract, ids, modRarity), cfg);
    const value = o.critSuccess * 1.2 + o.success + 0.45 * o.partial - 0.35 * (o.fail + o.critFail) * ids.length / 2;
    if (!best || value > best.value + 1e-9) best = { ids, value, odds: o };
  }
  return best;
}

// ───────────────────────── Résolution ─────────────────────────

export function xpToNext(cfg, level) {
  const x = cfg.core.progression.xpToNext;
  return Math.round(x.a * level ** x.p);
}

function grantXp(state, cfg, rng, runner, amount, events) {
  if (runner.level >= cfg.core.progression.maxLevel) return;
  runner.xp += Math.round(amount);
  while (runner.level < cfg.core.progression.maxLevel && runner.xp >= xpToNext(cfg, runner.level)) {
    runner.xp -= xpToNext(cfg, runner.level);
    runner.level++;
    events.push({ kind: 'levelUp', runner: runner.id, level: runner.level });
    if (cfg.core.progression.talentLevels.includes(runner.level)) {
      const pool = [...cfg.traits.talents.common, ...cfg.traits.talents[runner.role]].filter((t) => !runner.talents.includes(t.id));
      runner.pendingTalents = rng.shuffle(pool).slice(0, cfg.core.progression.talentChoices).map((t) => t.id);
      events.push({ kind: 'talentChoice', runner: runner.id, choices: runner.pendingTalents });
    }
  }
}

export function chooseTalent(state, runnerId, talentId) {
  const r = state.runners.find((x) => x.id === runnerId);
  if (!r?.pendingTalents?.includes(talentId)) return false;
  r.talents.push(talentId); r.pendingTalents = null;
  return true;
}

function rollGearRarity(cfg, rng, tier, steps) {
  const id = rng.weighted(cfg.tierDef(tier).gearRarity);
  const rank = Math.min(5, cfg.rarityById[id].rank + steps);
  return cfg.rarityByRank[rank].id;
}

export function injure(state, cfg, rng, runner, kind, tier, events) {
  const eff = runnerEffects(state, cfg, runner);
  if (rng.chance(Math.min(0.8, sumEffects(eff, 'injuryAvoid', null)))) { events.push({ kind: 'injuryAvoided', runner: runner.id }); return; }
  const k = cfg.core.injury[kind];
  const env = cfg.districtTraitById[state.districts[tier - 1].trait].effects;
  const blocks = Math.max(1, Math.round(k.base + k.perTier * tier
    + sumEffects(eff, 'injuryDuration', null) + sumEffects(env, 'injuryDuration', null) + planqueValue(state, cfg, 'infirmerie')));
  runner.injury = { kind, blocksLeft: Math.max(blocks, runner.injury?.blocksLeft ?? 0) };
  events.push({ kind: 'injury', runner: runner.id, severity: kind, blocks });
}

export function startMission(state, contract, squadIds, blockId) {
  contract.taken = true;
  state.activeMission = { contract, squad: squadIds, blockId };
}

/**
 * Point d'entrée unique de fin de bloc (terminé ou abandonné), avec ou sans mission.
 * block = { id, date, completed, modRarity ('none' si pas de mod ou axe sans mod), axis, exerciseId, tempo, standardTitle?,
 *           xpBonusPct? (intégration), abandonPenalty? (intégration) }
 * Intégration : standardTitle n'est JAMAIS transmis (anti-spoil) ; tempo n'existe pas dans les événements v1.
 * La note d'auto-évaluation n'est volontairement pas lue.
 * Retourne le rapport (report.outcome = null si aucune mission n'était engagée).
 */
export function endBlock(state, cfg, block) {
  const rng = makeRng(hash32(state.seed, 'block', block.id));
  const events = [];
  const m = state.activeMission;
  state.activeMission = null;
  const report = { blockId: block.id, date: block.date, contract: m?.contract ?? null, squad: m?.squad ?? [], events, outcome: null, rewards: { credits: 0, rep: 0, xp: 0, items: [] } };

  if (!block.completed) {
    if (m) {
      report.outcome = 'aborted';
      // Intégration : au-delà des arrêts gratuits du jour, l'abandon coûte (voir core.json > abandon).
      if (block.abandonPenalty) applyAbandonPenalty(state, cfg, m, report, rng);
      state.log.push(summarize(report));
    }
    return report;
  }

  // Le temps de pratique passe : chaque bloc terminé fait guérir d'un bloc, mission ou pas.
  for (const r of state.runners) if (r.injury && --r.injury.blocksLeft <= 0) { r.injury = null; events.push({ kind: 'healed', runner: r.id }); }

  if (m) resolveMission(state, cfg, block, m, report, rng);

  // Compteurs de pratique (lecture seule de l'historique)
  state.counters.blocksCompleted++;
  state.counters.blocksSinceForge++;
  if (block.axis) state.counters.axisSinceForge[block.axis] = (state.counters.axisSinceForge[block.axis] ?? 0) + 1;
  if (state.counters.blocksSinceForge >= cfg.core.forge.everyBlocks) {
    const it = forgeItem(state, cfg, rng, block);
    report.rewards.items.push(it.id);
    events.push({ kind: 'forge', item: it.id });
  }
  if (state.counters.blocksCompleted % cfg.core.recruit.refreshBlocks === 0) refreshCandidates(state, cfg);
  checkUnlocks(state, cfg, block.date, events);
  if (report.outcome === 'critSuccess' || events.some((e) => ['unlock', 'opStage', 'forge'].includes(e.kind))) events.push({ kind: 'codexFragment' });
  if (m) state.log.push(summarize(report));
  return report;
}

function resolveMission(state, cfg, block, m, report, rng) {
  const events = report.events;
  const c = m.contract;
  const runners = m.squad.map((id) => state.runners.find((r) => r.id === id));
  const ev = evaluate(state, cfg, c, m.squad, block.modRarity);
  const d1 = rng.int(1, 10); const d2 = rng.int(1, 10);
  const { outcome, margin } = outcomeFor(ev, cfg, d1 + d2);
  report.outcome = outcome; report.roll = { dice: [d1, d2], ...ev, margin };
  const oc = cfg.core.outcomes[outcome];
  const tierDef = cfg.tierDef(c.tier);
  const typeDef = cfg.typeById[c.type] ?? { creditMult: 1, repMult: 1 };
  const runnerEff = runners.map((r) => runnerEffects(state, cfg, r));
  const env = envEffects(state, cfg, c);
  const ctx = ev.ctx;
  const sumAll = (kind) => runnerEff.reduce((s, e) => s + sumEffects(e, kind, ctx), 0) + sumEffects(env, kind, ctx);

  // Récompenses
  let credits; let rep; let xp;
  if (c.kind === 'op') {
    const sr = cfg.core.grandCoup.stageRewards;
    credits = sr.credits * oc.credits; rep = sr.rep * oc.rep; xp = sr.xp * oc.xp;
  } else {
    const alertMult = 1 + ev.alert * cfg.core.alert.rewardPerPoint;
    credits = tierDef.credits * typeDef.creditMult * c.rewardMult * alertMult * oc.credits * (1 + sumAll('creditMult'));
    rep = tierDef.rep * typeDef.repMult * c.rewardMult * oc.rep;
    xp = tierDef.xp * oc.xp;
  }
  if (c.kind === 'g') { credits *= cfg.core.gig.creditMult; rep = cfg.core.gig.rep; xp *= cfg.core.gig.xpMult; }
  const cu = catchUp(state, cfg, block.date);
  if (rep > 0) rep *= (1 + sumAll('repMult')) * cu.rep;
  xp *= cu.xp;
  // Intégration : bonus d'XP du mod vaincu transmis par la partie musicale (bonusXpPct), 0 sinon.
  if (block.xpBonusPct) xp *= 1 + block.xpBonusPct / 100;
  report.catchUp = cu;
  report.rewards.credits = Math.round(credits);
  report.rewards.rep = Math.round(rep);
  report.rewards.xp = Math.round(xp);
  state.credits += report.rewards.credits;
  state.rep = Math.max(0, state.rep + report.rewards.rep);

  // XP : envoyés pleine part, restés à la planque une fraction.
  const bench = Math.max(cfg.core.progression.benchXpShare, planqueValue(state, cfg, 'dojo'));
  for (const r of state.runners) {
    if (r.injury) continue;
    const sent = m.squad.includes(r.id);
    const mult = sent ? 1 + sumEffects(runnerEffects(state, cfg, r), 'xpMult', ctx) : bench;
    grantXp(state, cfg, rng, r, xp * mult, events);
  }
  for (const r of runners) { r.missions++; if (outcome === 'success' || outcome === 'critSuccess') r.successes++; }

  // Blessures (jamais sur un petit boulot)
  if (c.kind !== 'g' && oc.injuryChance > 0 && rng.chance(oc.injuryChance)) {
    const victims = rng.shuffle(runners);
    injure(state, cfg, rng, victims[0], oc.injuryKind, c.tier, events);
    if (oc.injuryKind === 'severe' && victims[1]) injure(state, cfg, rng, victims[1], 'normal', c.tier, events);
  }

  // Équipement
  if (c.kind !== 'g') {
    const won = outcome === 'success' || outcome === 'critSuccess';
    const ml = cfg.core.modLoot;
    const chance = oc.gearChance + sumAll('gearChance') + planqueValue(state, cfg, 'atelier') + (won ? ml.gearChance[block.modRarity ?? 'none'] ?? 0 : 0);
    if (rng.chance(Math.min(1, chance))) {
      let steps = oc.gearRarityStep + (c.gearRarityStep ?? 0) + (won ? ml.rarityStep[block.modRarity] ?? 0 : 0);
      if (rng.chance(planqueValue(state, cfg, 'atelier', 'rarityUp'))) steps++;
      const slot = rng.pick(['arme', 'implant', 'outil']);
      const it = generateItem(state, cfg, rng, { slot, tier: c.tier, rarity: rollGearRarity(cfg, rng, c.tier, steps) });
      state.inventory.push(it.id);
      report.rewards.items.push(it.id);
    }
  }

  // Grand Coup et Chaleur
  const won = outcome === 'success' || outcome === 'critSuccess';
  if (c.kind === 'op') {
    state.grandCoup.lastAttemptDate = block.date;
    if (won) {
      state.grandCoup.stage++;
      events.push({ kind: 'opStage', stage: state.grandCoup.stage });
      if (state.grandCoup.stage >= cfg.core.grandCoup.stages) { state.grandCoup.done = true; events.push({ kind: 'grandCoupDone' }); }
    }
  } else if (c.kind === 'c') {
    const d = state.districts[c.tier - 1];
    const cap = state.grandCoup.done && c.tier === 6 ? Infinity : cfg.core.alert.cap;
    const before = d.alert;
    d.alert = clamp(d.alert + cfg.core.alert.delta[outcome], 0, cap);
    if (d.alert !== before) events.push({ kind: 'alert', tier: c.tier, from: before, to: d.alert });
    if (c.tier === 6 && state.grandCoup.done) state.bestHeat = Math.max(state.bestHeat, d.alert);
  }
  state.counters.missions++;
}

function summarize(r) {
  return { blockId: r.blockId, date: r.date, kind: r.contract.kind, tier: r.contract.tier, type: r.contract.type, outcome: r.outcome, credits: r.rewards.credits, rep: r.rewards.rep, ...(r.penalized ? { penalized: true } : {}) };
}

/**
 * Malus d'un abandon au-delà des arrêts gratuits de la journée (le décompte est fait par l'intégration).
 * Perte de réputation proportionnelle à la valeur du contrat, et blessure éventuelle d'un runner envoyé.
 * Jamais sur un petit boulot.
 */
function applyAbandonPenalty(state, cfg, m, report, rng) {
  const p = cfg.core.abandon?.penalty;
  const c = m.contract;
  if (!p || c.kind === 'g') return;
  report.penalized = true;
  const typeDef = cfg.typeById[c.type] ?? { repMult: 1 };
  const base = c.kind === 'op' ? cfg.core.grandCoup.stageRewards.rep : cfg.tierDef(c.tier).rep * typeDef.repMult * c.rewardMult;
  const rep = Math.round(base * (p.rep ?? 0));
  report.rewards.rep = rep;
  state.rep = Math.max(0, state.rep + rep);
  const runners = m.squad.map((id) => state.runners.find((r) => r.id === id)).filter((r) => r && !r.injury);
  if (p.injuryKind && runners.length && rng.chance(p.injuryChance ?? 1)) injure(state, cfg, rng, rng.pick(runners), p.injuryKind, c.tier, report.events);
}

// ───────────────────────── Forge mémorielle ─────────────────────────

export function forgeItem(state, cfg, rng, block) {
  const counts = state.counters.axisSinceForge;
  const axis = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? block.axis ?? 'MAN';
  const stat = cfg.core.forge.axisToStat[axis];
  const slot = rng.pick(['arme', 'implant', 'outil']);
  const base = cfg.items.bases.filter((b) => b.slot === slot).sort((a, b) => (b.weights[stat] ?? 0) - (a.weights[stat] ?? 0))[0];
  const it = generateItem(state, cfg, rng, { slot, tier: state.maxTier, rarity: cfg.core.forge.rarity, baseId: base.id });
  it.affixes.push({ id: 'forge', kind: 'roll', value: 2, when: { stat } });
  it.forged = { axis, blocks: counts[axis] ?? 0, exerciseId: block.exerciseId ?? null, tempo: block.tempo ?? null, standardTitle: block.standardTitle ?? null };
  const label = block.standardTitle ? block.standardTitle : block.tempo ? `${axis} ${block.tempo}` : `${axis} x${counts[axis] ?? 0}`;
  it.name = `${base.name} « ${label} »`;
  state.inventory.push(it.id);
  state.counters.blocksSinceForge = 0;
  state.counters.axisSinceForge = {};
  return it;
}

// ───────────────────────── Gestion (fenêtre de débrief) ─────────────────────────

const ROLE_WEIGHT = (cfg, runner) => {
  const role = cfg.roleById[runner.role];
  const w = { PIR: 0.25, CBT: 0.25, MAT: 0.25, SOC: 0.25 };
  w[role.primary] = 1; w[role.secondary] = 0.6;
  return w;
};

export function itemScore(cfg, item, runner) {
  const w = ROLE_WEIGHT(cfg, runner);
  let s = 0;
  for (const k of STATS) s += (item.stats[k] ?? 0) * w[k];
  for (const a of item.affixes) {
    if (a.kind === 'stat') s += a.stat === 'all' ? a.value * 2.1 : a.value * w[a.stat];
    else if (a.kind === 'roll') s += a.value * (a.when ? 0.8 : 2);
    else if (a.kind === 'critRange') s += 1.5;
    else s += 1;
  }
  if (item.signature) s += 3;
  return s;
}

export function equip(state, runnerId, itemId) {
  const r = state.runners.find((x) => x.id === runnerId);
  const it = state.items[itemId];
  for (const o of state.runners) if (o.gear[it.slot] === itemId) o.gear[it.slot] = null;
  const prev = r.gear[it.slot];
  r.gear[it.slot] = itemId;
  state.inventory = state.inventory.filter((x) => x !== itemId);
  if (prev) state.inventory.push(prev);
}

/** « Équiper le meilleur » : un geste dans l'écran de rapport. */
export function autoEquip(state, cfg) {
  const order = state.runners.slice().sort((a, b) => b.level - a.level);
  for (const slot of ['arme', 'implant', 'outil']) {
    for (const r of order) {
      const cur = r.gear[slot] ? state.items[r.gear[slot]] : null;
      let best = cur; let bestS = cur ? itemScore(cfg, cur, r) : -1;
      for (const id of state.inventory) {
        const it = state.items[id];
        if (it.slot !== slot) continue;
        const s = itemScore(cfg, it, r);
        if (s > bestS) { best = it; bestS = s; }
      }
      if (best && best !== cur) equip(state, r.id, best.id);
    }
  }
  trimInventory(state, cfg);
}

export function scrapItem(state, cfg, itemId) {
  const it = state.items[itemId];
  const v = Math.round(cfg.core.inventory.scrapValue[it.rarity] * (1 + cfg.core.inventory.scrapPerTier * (it.tier - 1)));
  state.credits += v;
  state.inventory = state.inventory.filter((x) => x !== itemId);
  delete state.items[itemId];
  return v;
}

export function trimInventory(state, cfg) {
  const max = cfg.core.inventory.maxItems;
  if (state.inventory.length <= max) return 0;
  const scored = state.inventory.map((id) => [id, Math.max(...state.runners.map((r) => itemScore(cfg, state.items[id], r)))]);
  scored.sort((a, b) => a[1] - b[1]);
  let total = 0;
  for (const [id] of scored.slice(0, state.inventory.length - max)) if (!state.items[id].forged) total += scrapItem(state, cfg, id);
  return total;
}

export function refreshCandidates(state, cfg) {
  const rc = cfg.core.recruit;
  const rng = makeRng(hash32(state.seed, 'recruit', state.counters.recruitRefresh++));
  const avg = state.runners.reduce((s, r) => s + r.level, 0) / Math.max(1, state.runners.length);
  const missing = cfg.roles.roles.map((r) => r.id).filter((id) => !state.runners.some((r) => r.role === id));
  state.candidates = [];
  for (let i = 0; i < rc.candidates; i++) {
    const role = i === 0 && missing.length ? rng.pick(missing) : rng.pick(cfg.roles.roles).id;
    const rarity = rng.weighted(cfg.tierDef(state.maxTier).gearRarity);
    const level = Math.max(1, Math.round(avg * (rc.levelRange[0] + rng.next() * (rc.levelRange[1] - rc.levelRange[0]))));
    const r = createRunner(state, cfg, rng, { role, rarity, level });
    r.cost = recruitCost(state, cfg, r);
    state.candidates.push(r);
  }
}

export function recruitCost(state, cfg, r) {
  const rc = cfg.core.recruit;
  return Math.round(rc.base * r.level * cfg.rarityById[r.rarity].recruitCostMult + rc.rosterFee * Math.max(0, state.runners.length - 1));
}

export function recruit(state, cfg, candidateId, dismissId = null) {
  const c = state.candidates.find((x) => x.id === candidateId);
  if (!c) return false;
  const cost = recruitCost(state, cfg, c);
  if (state.credits < cost) return false;
  const sameRole = state.runners.filter((r) => r.role === c.role && r.id !== dismissId).length;
  if (sameRole >= cfg.core.recruit.maxSameRole) return false;
  if (state.runners.length >= cfg.core.recruit.maxRoster) {
    if (!dismissId) return false;
    const d = state.runners.find((r) => r.id === dismissId);
    for (const slot of ['arme', 'implant', 'outil']) if (d.gear[slot]) state.inventory.push(d.gear[slot]);
    state.runners = state.runners.filter((r) => r.id !== dismissId);
  }
  state.credits -= cost;
  delete c.cost;
  state.runners.push(c);
  state.candidates = state.candidates.filter((x) => x.id !== candidateId);
  return true;
}

export function upgradeCost(state, cfg, item) {
  if (item.tier >= state.maxTier) return null;
  const u = cfg.core.upgrade;
  return Math.round(u.costPerTier[item.tier + 1] * u.rarityMult[item.rarity]);
}

/** Recalibrage : l'objet garde sa base, sa rareté, ses affixes et son nom ; ses valeurs suivent le nouveau palier. */
export function upgradeItem(state, cfg, itemId) {
  const it = state.items[itemId];
  const cost = upgradeCost(state, cfg, it);
  if (cost == null || state.credits < cost) return false;
  state.credits -= cost;
  const from = it.tier; const to = from + 1;
  const b = cfg.items.budget;
  const ratio = (b.base + b.perTier * to) / (b.base + b.perTier * from);
  for (const s of STATS) if (it.stats[s]) it.stats[s] = round05(it.stats[s] * ratio);
  for (const a of it.affixes) {
    const def = cfg.affixById[a.id];
    if (def?.effect.base != null) a.value = Math.max(0.5, round05(def.effect.base + def.effect.perTier * to));
  }
  it.tier = to;
  return true;
}

export function clinicCost(state, cfg, runner) {
  return runner.injury ? cfg.core.injury.clinicCostPerBlock[state.maxTier] * runner.injury.blocksLeft : 0;
}

export function heal(state, cfg, runnerId) {
  const r = state.runners.find((x) => x.id === runnerId);
  const cost = clinicCost(state, cfg, r);
  if (!r.injury || state.credits < cost) return false;
  state.credits -= cost; r.injury = null;
  return true;
}

export function buyModule(state, cfg, moduleId) {
  const m = cfg.moduleById[moduleId];
  const lvl = state.planque[moduleId];
  if (lvl >= m.costs.length || state.credits < m.costs[lvl]) return false;
  state.credits -= m.costs[lvl];
  state.planque[moduleId] = lvl + 1;
  return true;
}

// ───────────────────────── Données pour le récit ─────────────────────────

export function narrativeInput(state, cfg, report) {
  const c = report.contract;
  const d = state.districts[c.tier - 1];
  const who = (id) => {
    const r = state.runners.find((x) => x.id === id);
    if (!r) return null;
    return { nom: displayName(r), role: cfg.roleById[r.role].name, trait: cfg.traitById[r.trait].name, niveau: r.level };
  };
  const ev = (k) => report.events.filter((e) => e.kind === k);
  return {
    contrat: {
      verbe: c.verb, cible: c.target, type: cfg.typeById[c.type]?.name ?? 'Opération',
      client: c.client, quartier: d.name, faction: d.faction, palier: c.tier,
      complication: c.complication ? cfg.complicationById[c.complication].name : null,
      grandCoup: c.kind === 'op' ? { etape: (c.stage ?? 0) + 1, sur: cfg.core.grandCoup.stages } : null,
      petitBoulot: c.kind === 'g',
    },
    equipe: report.squad.map(who).filter(Boolean),
    issue: report.outcome,
    jet: report.roll ? { des: report.roll.dice, marge: report.roll.margin, modVaincu: report.roll.modBonus > 0 } : null,
    blesses: ev('injury').map((e) => ({ ...who(e.runner), gravite: e.severity, blocs: e.blocks })),
    butin: report.rewards.items.map((id) => state.items[id]?.name).filter(Boolean),
    credits: report.rewards.credits,
  };
}
