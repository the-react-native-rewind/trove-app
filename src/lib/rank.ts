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
 * Move one place down inside the same circle and due date.
 * The new key sits between the task directly below and the one below that.
 * Returns null when this task is already the bottom of that group.
 */
export function rankAfterStepDown(taskId: string, ordered: readonly RankedRef[]): string | null {
  const index = ordered.findIndex((task) => task.id === taskId);
  if (index < 0) return null;
  const task = ordered[index];
  let below: RankedRef | undefined;
  let belowBelow: RankedRef | undefined;
  for (let cursor = index + 1; cursor < ordered.length; cursor += 1) {
    const candidate = ordered[cursor];
    if (candidate.space_id !== task.space_id || candidate.due_date !== task.due_date) continue;
    if (!below) below = candidate;
    else {
      belowBelow = candidate;
      break;
    }
  }
  if (!below) return null;
  return generateKeyBetween(belowBelow?.rank ?? null, below.rank);
}

/** Keep a slider value inside 0 (bottom) to 1 (top). Anything unusable is the bottom. */
export function clampImportance(importance: number): number {
  if (!Number.isFinite(importance)) return 0;
  return Math.min(1, Math.max(0, importance));
}

/**
 * How many distinct ranks a new task is being placed among.
 * Blank keys are ignored. Ties count once, because they share one slot.
 */
export function countPlacementRanks(groupRanks: readonly string[]): number {
  return ascendingRanks(groupRanks).length;
}

/**
 * Slot for a new task in the list those ranks already form.
 * 0 is above every rank (the top). `count` is below every rank (the bottom).
 * The slots are equal slices of the slider, including both ends.
 */
export function importanceInsertionIndex(importance: number, count: number): number {
  if (count <= 0) return 0;
  const clamped = clampImportance(importance);
  if (clamped <= 0) return count;
  if (clamped >= 1) return 0;
  return Math.min(count, Math.floor((1 - clamped) * (count + 1)));
}

/**
 * Rank that lands a new task at `importance` in the list those ranks form.
 * 0 is the bottom (least important) and 1 is the top (most important).
 * The key sits in the nearest gap, so it sorts between the neighbours a
 * person would see. An empty list starts at `a0`.
 */
export function rankForImportance(groupRanks: readonly string[], importance: number): string {
  const ranks = ascendingRanks(groupRanks);
  if (ranks.length === 0) return generateKeyBetween(null, null);
  const display = [...ranks].reverse();
  const insertAt = importanceInsertionIndex(importance, display.length);
  const above = insertAt === 0 ? null : display[insertAt - 1];
  const below = insertAt >= display.length ? null : display[insertAt];
  return rankAfterDrop(above, below);
}

/** Non-empty keys, lowest first, with ties collapsed. */
function ascendingRanks(groupRanks: readonly string[]): string[] {
  const ranks = groupRanks
    .filter((rank) => rank.length > 0)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const unique: string[] = [];
  for (const rank of ranks) {
    if (unique[unique.length - 1] !== rank) unique.push(rank);
  }
  return unique;
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
