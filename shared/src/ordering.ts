/**
 * LexoRank-style fractional ordering (DD-6).
 *
 * `position` is a lexicographically sortable string. Placing an item between two
 * neighbours means generating a key strictly between theirs, so a reorder writes
 * exactly one row — integer positions would need every sibling renumbered on each
 * drag, which is many writes and a race window.
 *
 * Keys use a base-62 alphabet in ASCII order, so plain string comparison sorts
 * them correctly in both JavaScript and SQLite's BINARY collation.
 *
 * A key is read as a fraction: the digits after an implied leading point. So "U"
 * is roughly 0.5, "1" is near 0, and appending digits refines a value downward
 * within its prefix. Two invariants keep this sound:
 *
 *   1. A key never ends in the minimum digit ("0"), since "A0" and "A" would
 *      compare as distinct strings but denote the same fraction, and the space
 *      between them is empty.
 *   2. Generation is always strictly between its bounds, never equal to either.
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = ALPHABET.length;
const MIN_CHAR = ALPHABET[0]!;
const MAX_CHAR = ALPHABET[BASE - 1]!;

/** Keys longer than this trigger a rebalance of the containing list. */
export const REBALANCE_THRESHOLD = 32;

function digit(c: string): number {
  const i = ALPHABET.indexOf(c);
  if (i < 0) throw new Error(`invalid character in position key: ${c}`);
  return i;
}

/** The digit at `i`, or 0 for positions past the end — trailing zeroes are implied. */
function digitAt(key: string, i: number): number {
  return i < key.length ? digit(key[i]!) : 0;
}

/**
 * A key strictly between `before` and `after`.
 *
 * Pass `null` for either end: `between(null, first)` prepends, `between(last, null)`
 * appends, and `between(null, null)` yields a first key.
 */
export function between(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error(`positions out of order: ${before} >= ${after}`);
  }
  if (before !== null) validate(before);
  if (after !== null) validate(after);

  if (before === null && after === null) return 'U'; // mid-alphabet, room both ways
  if (before === null) return keyBefore(after!);
  if (after === null) return keyAfter(before);
  return keyBetween(before, after);
}

function validate(key: string): void {
  if (key.length === 0) throw new Error('position key is empty');
  if (key.endsWith(MIN_CHAR)) {
    throw new Error(`position key must not end in "${MIN_CHAR}": ${key}`);
  }
  for (const c of key) digit(c);
}

/**
 * A key strictly less than `after`.
 *
 * Walk the digits looking for the first one with space beneath it. If every digit
 * is the minimum (e.g. "001"), the value is vanishingly small; we take its own
 * prefix and descend one place further, which always yields room.
 */
function keyBefore(after: string): string {
  for (let i = 0; i < after.length; i += 1) {
    const d = digitAt(after, i);
    if (d > 0) {
      // Halve this digit. Result is < after at position i, so the rest is free.
      const half = Math.floor(d / 2);
      if (half > 0) return after.slice(0, i) + ALPHABET[half]!;
      // d === 1: no room at this digit, but "…0…" is not a legal ending, so
      // borrow — keep the 0 and place a mid digit one place further down.
      return after.slice(0, i) + MIN_CHAR + 'U';
    }
  }
  // All digits are zero, which validate() forbids; defensive only.
  throw new Error(`cannot generate a key before ${after}`);
}

/**
 * A key strictly greater than `before`.
 *
 * Look for the first digit with space above it, counting from the left. If the
 * whole key is maximal ("zzz"), extend it — appending any non-zero digit makes a
 * strictly larger key.
 */
function keyAfter(before: string): string {
  for (let i = 0; i < before.length; i += 1) {
    const d = digitAt(before, i);
    if (d < BASE - 1) {
      const mid = d + Math.max(1, Math.floor((BASE - 1 - d) / 2));
      return before.slice(0, i) + ALPHABET[mid]!;
    }
  }
  // Every digit is the maximum — extend to go beyond it.
  return before + 'U';
}

/**
 * A key strictly between two non-null keys, both known to satisfy before < after.
 *
 * Digits are compared place by place. Where a gap of more than one exists, the
 * midpoint lands there. Where the digits are adjacent or equal, that digit is
 * kept and the search continues one place down, now bounded below by the rest of
 * `before` and above by nothing (since any suffix keeps us under `after`).
 */
function keyBetween(before: string, after: string): string {
  let prefix = '';

  for (let i = 0; ; i += 1) {
    const b = digitAt(before, i);
    const a = i < after.length ? digit(after[i]!) : BASE; // past the end: unbounded

    if (b === a) {
      prefix += ALPHABET[b]!;
      continue;
    }

    if (a - b > 1) {
      const mid = b + Math.floor((a - b) / 2);
      return prefix + ALPHABET[mid]!;
    }

    // Adjacent digits: commit to `before`'s digit, then find any key strictly
    // above the remainder of `before`. Staying under `after` is guaranteed
    // because we are now one digit below it at position i.
    prefix += ALPHABET[b]!;
    const rest = before.slice(i + 1);
    return prefix + (rest === '' ? 'U' : keyAfter(rest));
  }
}

/** Evenly spaced keys for `count` items, used when rebalancing a list. */
export function rebalance(count: number): string[] {
  if (count <= 0) return [];

  // Single-character keys while they last: shortest possible, and evenly spread
  // so later inserts have room on both sides.
  if (count <= BASE - 2) {
    const step = Math.floor((BASE - 2) / count) || 1;
    const keys: string[] = [];
    for (let i = 0; i < count; i += 1) keys.push(ALPHABET[1 + i * step]!);
    return keys;
  }

  // More items than single digits: two-character keys, same idea one place down.
  const keys: string[] = [];
  const span = (BASE - 2) * BASE;
  const step = Math.max(1, Math.floor(span / count));
  for (let i = 0; i < count; i += 1) {
    const v = BASE + i * step; // start past the first digit to leave headroom
    const hi = Math.floor(v / BASE);
    const lo = v % BASE;
    // Never end in the minimum digit (invariant 1).
    keys.push(lo === 0 ? ALPHABET[hi]! : ALPHABET[hi]! + ALPHABET[lo]!);
  }
  return keys;
}

/** True when any key has grown long enough to warrant a rebalance. */
export function needsRebalance(keys: readonly string[]): boolean {
  return keys.some((k) => k.length > REBALANCE_THRESHOLD);
}

export { MIN_CHAR, MAX_CHAR, ALPHABET, BASE };
