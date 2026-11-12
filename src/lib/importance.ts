import { countPlacementRanks, importanceInsertionIndex } from './rank';

/** Left end of the slider. A new action stays at the bottom until someone moves it. */
export const DEFAULT_IMPORTANCE = 0;

export type PlacementTask = {
  status: string;
  project_id?: string | null;
  rank: string | null;
};

/**
 * Ranks the new action is placed among: open work in this list.
 * A project list only counts that project's open actions. Done work stays
 * out, because it is not in the list the slider is aiming at.
 */
export function ranksForPlacement(
  tasks: readonly PlacementTask[],
  projectId: string | null,
): string[] {
  return tasks
    .filter((task) => task.status !== 'done')
    .filter((task) => !projectId || task.project_id === projectId)
    .map((task) => task.rank ?? '');
}

/**
 * The phrase shown on the slider. The ends name the extremes. In between,
 * the phrase follows the gap the action will actually land in.
 */
export function importanceLabel(importance: number, peerRanks: readonly string[]): string {
  const count = countPlacementRanks(peerRanks);
  if (count <= 0) return 'First action in the list';
  const insertAt = importanceInsertionIndex(importance, count);
  if (insertAt <= 0) return 'Most important action';
  if (insertAt >= count) return 'Least important action';
  const fromTop = insertAt / count;
  if (fromTop <= 1 / 3) return 'Higher in the list';
  if (fromTop >= 2 / 3) return 'Lower in the list';
  return 'Middle of the list';
}
