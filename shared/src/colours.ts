/**
 * Task and page colour palette (FR-5.5).
 *
 * Chosen to stay distinguishable at small sizes — a 3px timeline line, a 5px
 * point — and to hold contrast against both light and dark surfaces, since the
 * palette does not change with colour mode (see .docs/theme/design.md §2).
 */
export const PALETTE = [
  '#4C7EF3', // blue
  '#E0603A', // vermilion
  '#2FA36B', // green
  '#B45FD1', // violet
  '#D9922B', // amber
  '#2AA2B8', // teal
  '#D6497F', // rose
  '#7A6BE0', // indigo
  '#6E8C3A', // olive
  '#C4643D', // sienna
  '#4A9AD4', // sky
  '#9B5BA5', // plum
] as const;

/** The next colour not already in use, falling back to round-robin once the
 *  palette is exhausted, so a long list still varies. */
export function nextColour(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  const free = PALETTE.find((c) => !taken.has(c.toLowerCase()));
  return free ?? PALETTE[used.length % PALETTE.length]!;
}
