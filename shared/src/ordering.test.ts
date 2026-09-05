import { describe, expect, it } from 'vitest';
import {
  between,
  MIN_CHAR,
  needsRebalance,
  rebalance,
  REBALANCE_THRESHOLD,
} from './ordering.js';

/** Keys must never end in the minimum digit — see the invariants in ordering.ts. */
function expectWellFormed(key: string): void {
  expect(key.length).toBeGreaterThan(0);
  expect(key.endsWith(MIN_CHAR)).toBe(false);
}

describe('between', () => {
  it('produces a first key when the list is empty', () => {
    const key = between(null, null);
    expect(key.length).toBeGreaterThan(0);
  });

  it('prepends before an existing key', () => {
    const first = between(null, null);
    const earlier = between(null, first);
    expect(earlier < first).toBe(true);
  });

  it('appends after an existing key', () => {
    const first = between(null, null);
    const later = between(first, null);
    expect(later > first).toBe(true);
  });

  it('inserts strictly between two keys', () => {
    const a = between(null, null);
    const c = between(a, null);
    const b = between(a, c);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it('inserts between adjacent characters by extending', () => {
    const b = between('a', 'b');
    expect('a' < b).toBe(true);
    expect(b < 'b').toBe(true);
  });

  it('rejects reversed inputs', () => {
    expect(() => between('c', 'a')).toThrow();
    expect(() => between('a', 'a')).toThrow();
  });

  it('handles repeated insertion at the same point', () => {
    let low = between(null, null);
    const high = between(low, null);
    // Repeatedly bisect the same gap — the pathological case for key growth.
    for (let i = 0; i < 200; i += 1) {
      const mid = between(low, high);
      expect(low < mid).toBe(true);
      expect(mid < high).toBe(true);
      expectWellFormed(mid);
      low = mid;
    }
  });

  it('bisects downward repeatedly', () => {
    const low = between(null, null);
    let high = between(low, null);
    for (let i = 0; i < 200; i += 1) {
      const mid = between(low, high);
      expect(low < mid && mid < high).toBe(true);
      expectWellFormed(mid);
      high = mid;
    }
  });

  it('handles repeated prepending', () => {
    let key = between(null, null);
    for (let i = 0; i < 200; i += 1) {
      const earlier = between(null, key);
      expect(earlier < key).toBe(true);
      expectWellFormed(earlier);
      key = earlier;
    }
  });

  it('handles repeated appending', () => {
    let key = between(null, null);
    for (let i = 0; i < 200; i += 1) {
      const later = between(key, null);
      expect(later > key).toBe(true);
      expectWellFormed(later);
      key = later;
    }
  });

  it('keeps a whole list sorted through random insertions', () => {
    let keys = [between(null, null)];
    for (let i = 0; i < 1000; i += 1) {
      const at = Math.floor(Math.random() * (keys.length + 1));
      const before = at === 0 ? null : keys[at - 1]!;
      const after = at === keys.length ? null : keys[at]!;
      const key = between(before, after);
      expectWellFormed(key);
      keys = [...keys.slice(0, at), key, ...keys.slice(at)];
    }
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('rebalance', () => {
  it('returns nothing for an empty list', () => {
    expect(rebalance(0)).toEqual([]);
  });

  it('returns sorted, unique, well-formed keys', () => {
    for (const count of [1, 2, 5, 30, 59, 60, 61, 100, 500, 2000]) {
      const keys = rebalance(count);
      expect(keys).toHaveLength(count);
      expect(new Set(keys).size).toBe(count);
      expect([...keys].sort()).toEqual(keys);
      for (const k of keys) expectWellFormed(k);
    }
  });

  it('allows insertion between every rebalanced pair', () => {
    for (const count of [5, 60, 200]) {
      const keys = rebalance(count);
      for (let i = 0; i < keys.length - 1; i += 1) {
        const mid = between(keys[i]!, keys[i + 1]!);
        expect(keys[i]! < mid && mid < keys[i + 1]!).toBe(true);
      }
    }
  });

  it('leaves room to insert around rebalanced keys', () => {
    const keys = rebalance(10);
    expect(between(null, keys[0]!) < keys[0]!).toBe(true);
    expect(between(keys[9]!, null) > keys[9]!).toBe(true);
    const mid = between(keys[4]!, keys[5]!);
    expect(keys[4]! < mid && mid < keys[5]!).toBe(true);
  });
});

describe('needsRebalance', () => {
  it('is false for short keys', () => {
    expect(needsRebalance(rebalance(20))).toBe(false);
  });

  it('is true once a key exceeds the threshold', () => {
    expect(needsRebalance(['a'.repeat(REBALANCE_THRESHOLD + 1)])).toBe(true);
  });
});
