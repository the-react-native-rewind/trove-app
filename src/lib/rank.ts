import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/** A task the rank helpers need in order to step it up inside its group. */
export type RankedRef = {
  id: string;
  space_id: string;
  due_date: string | null;
  rank: string;
};

/** Higher keys come first. Equal keys compare as 0. */
export function compareRank(a: string, b: string): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

/** A key below every current key in the group. An empty group starts at `a0`. */
export function rankAtBottom(lowest: string | null | undefined): string {
  return generateKeyBetween(null, lowest || null);
}

/** A key above every current key in the group. */
export function rankAtTop(highest: string | null | undefined): string {
  return generateKeyBetween(highest || null, null);
}

/**
 * Move one place up inside the same circle and due date.
 * The new key sits between the task directly above and the one above that.
 * Returns null when this task is already the top of that group.
 */
export function rankAfterStepUp(taskId: string, ordered: readonly RankedRef[]): string | null {
  const index = ordered.findIndex((task) => task.id === taskId);
  if (index < 0) return null;
  const task = ordered[index];
  let above: RankedRef | undefined;
  let aboveAbove: RankedRef | undefined;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = ordered[cursor];
    if (candidate.space_id !== task.space_id || candidate.due_date !== task.due_date) continue;
    if (!above) above = candidate;
    else {
      aboveAbove = candidate;
      break;
    }
  }
  if (!above) return null;
  return generateKeyBetween(above.rank, aboveAbove?.rank ?? null);
}

/**
 * Place a task from a priority word among the ranks it is given.
 * `high` goes above the current top, `medium` between the two central keys,
 * and `low` or null at the bottom. An empty list starts at `a0`.
 * The circle passes every rank, so this is the overall order.
 */
export function rankForPriority(
  priority: 'low' | 'medium' | 'high' | null,
  groupRanks: readonly string[],
): string {
  const ranks = groupRanks.filter((rank) => rank.length > 0).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (ranks.length === 0) return generateKeyBetween(null, null);
  const lowest = ranks[0];
  const highest = ranks[ranks.length - 1];
  if (priority === 'high') return rankAtTop(highest);
  if (priority !== 'medium') return rankAtBottom(lowest);
  const mid = Math.floor(ranks.length / 2);
  const lower = ranks[Math.max(0, mid - 1)];
  const upper = ranks[mid];
  if (lower === upper) return rankAtBottom(upper);
  return generateKeyBetween(lower, upper);
}

/**
 * Rank for a task dropped between the neighbour above it and the one below.
 * The list shows higher keys first, so `above` is the higher key (or null at
 * the top) and `below` is the lower key (or null at the bottom). The new key
 * sorts strictly between them. No other row is rewritten.
 * Tied neighbours have no key between them; the task then sorts just above
 * that shared key so the drop still moves it.
 */
export function rankAfterDrop(
  above: string | null | undefined,
  below: string | null | undefined,
): string {
  const upper = above && above.length > 0 ? above : null;
  const lower = below && below.length > 0 ? below : null;
  if (upper !== null && lower !== null && lower >= upper) {
    return generateKeyBetween(lower, null);
  }
  return generateKeyBetween(lower, upper);
}

/**
 * Key at `index` in the sequence generateNKeysBetween(null, null) produces.
 * Index 0 is the bottom key `a0`. The migration backfill uses the same sequence.
 */
export function rankKeyByIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('rank index must be a non-negative integer');
  }
  return generateNKeysBetween(null, null, index + 1)[index];
}
