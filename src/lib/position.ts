/** Midpoint between two neighbor positions (handles list edges). */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return Date.now();
  if (prev === null) return (next as number) - 1;
  if (next === null) return prev + 1;
  return (prev + next) / 2;
}
