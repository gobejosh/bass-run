/**
 * Tirages aléatoires.
 *
 * En production : crypto.getRandomValues (aléa cryptographique), avec échantillonnage
 * par rejet pour éviter le biais du modulo. Aucun Math.random.
 * En test : un générateur déterministe injectable.
 */

export interface Rng {
  /** Réel uniforme dans [0, 1). */
  next(): number;
  /** Entier uniforme dans [0, n). */
  int(n: number): number;
}

const UINT32 = 0x1_0000_0000;

function cryptoUint32(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]!;
}

export const cryptoRng: Rng = {
  next() {
    // 53 bits d'aléa pour un double uniforme.
    const hi = cryptoUint32() >>> 5; // 27 bits
    const lo = cryptoUint32() >>> 6; // 26 bits
    return (hi * 67108864 + lo) / 9007199254740992;
  },
  int(n: number) {
    if (!Number.isInteger(n) || n <= 0) throw new RangeError(`int(${n}) : n doit être un entier > 0`);
    if (n === 1) return 0;
    // Rejet : on écarte la zone qui biaiserait le modulo.
    const limit = UINT32 - (UINT32 % n);
    let x: number;
    do {
      x = cryptoUint32();
    } while (x >= limit);
    return x % n;
  },
};

/** Générateur déterministe (mulberry32) pour les tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
  return { next, int: (n) => Math.floor(next() * n) };
}

/** Générateur qui rejoue une suite de valeurs dans [0,1) (tests ciblés). */
export function scriptedRng(values: number[]): Rng {
  let i = 0;
  const next = () => {
    if (i >= values.length) throw new Error("scriptedRng épuisé");
    return values[i++]!;
  };
  return { next, int: (n) => Math.floor(next() * n) };
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick : liste vide");
  return items[rng.int(items.length)]!;
}

/** Entier uniforme dans [min, max] inclus. */
export function intBetween(rng: Rng, min: number, max: number): number {
  return min + rng.int(max - min + 1);
}

/** Tirage pondéré : renvoie la clé choisie selon des poids positifs (pas forcément normalisés). */
export function weighted<K extends string>(rng: Rng, weights: Readonly<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (!(total > 0)) throw new Error("weighted : somme des poids nulle");
  let r = rng.next() * total;
  for (const [k, w] of entries) {
    if (r < w) return k;
    r -= w;
  }
  return entries[entries.length - 1]![0];
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** k éléments distincts tirés sans remise. */
export function sample<T>(rng: Rng, items: readonly T[], k: number): T[] {
  return shuffle(rng, items).slice(0, Math.min(k, items.length));
}
