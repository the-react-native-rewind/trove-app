import { daysUntilDue } from './format';
import { compareRank } from './rank';
import { STATUSES, type TaskStatus, type TaskWithRefs } from './types';

export { STATUSES };

/** How many days ahead still counts as bearing down on you. */
export const DUE_SOON_DAYS = 3;

/**
 * How much a due date is pressing. Only the first three bands jump the queue;
 * a date three weeks out is no reason to climb over the order you chose.
 */
export type DueBand = 'overdue' | 'today' | 'soon' | 'later' | 'none';

const BAND_WEIGHT: Record<DueBand, number> = {
  overdue: 0,
  today: 1,
  soon: 2,
  later: 3,
  none: 3,
};

/**
 * Which band a task sits in. A finished task never presses, however late it
 * was — it has already been dealt with and should not shout from the top.
 */
export function dueBand(
  task: Pick<TaskWithRefs, 'due_date' | 'status'>,
  now: Date = new Date(),
): DueBand {
  if (normalizeStatus(task.status) === 'done') return 'none';
  const days = daysUntilDue(task.due_date, now);
  if (days === null) return 'none';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return days <= DUE_SOON_DAYS ? 'soon' : 'later';
}

/** True for the bands worth marking on the row. */
export function isDuePressing(band: DueBand): boolean {
  return band === 'overdue' || band === 'today' || band === 'soon';
}

/**
 * Reading order for a list of actions.
 *
 * What is bearing down comes first — overdue, then due today, then due inside
 * the next few days — soonest first inside each of those. Everything else
 * keeps the order you put it in, because a date a month out is not a reason to
 * climb over work you deliberately ranked above it.
 *
 * Ranks are never rewritten by this; it is only how the list reads.
 */
export function sortTasksByUrgency(tasks: TaskWithRefs[], now: Date = new Date()): TaskWithRefs[] {
  return [...tasks].sort((a, b) => {
    const weightA = BAND_WEIGHT[dueBand(a, now)];
    const weightB = BAND_WEIGHT[dueBand(b, now)];
    if (weightA !== weightB) return weightA - weightB;

    // Inside a pressing band the nearest date leads, whatever the rank.
    if (weightA < BAND_WEIGHT.later && a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }

    return compareRankThenDate(a, b);
  });
}

/**
 * Manual order: a higher rank sorts above a lower one, whatever the due dates
 * are. This is what reordering by hand writes and reads, so the list being
 * dragged has to be in this order for a drop to land where it looks like it
 * will.
 */
export function sortTasksByRank(tasks: TaskWithRefs[]): TaskWithRefs[] {
  return [...tasks].sort(compareRankThenDate);
}

function compareRankThenDate(a: TaskWithRefs, b: TaskWithRefs): number {
  const rankDifference = compareRank(a.rank ?? '', b.rank ?? '');
  if (rankDifference !== 0) return rankDifference;

  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  }

  if (a.position !== b.position) return a.position - b.position;
  const createdDifference = a.created_at.localeCompare(b.created_at);
  return createdDifference || a.id.localeCompare(b.id);
}

/** Map a stored status onto todo, in progress, or done. Unknown values stay open. */
export function normalizeStatus(status: string): TaskStatus {
  if (status === 'done' || status === 'in_progress') return status;
  return 'todo';
}

const STATUS_CYCLE: TaskStatus[] = ['todo', 'in_progress', 'done'];

/** To do, then in progress, then done, then back to to do. */
export function nextTaskStatus(status: string): TaskStatus {
  const current = normalizeStatus(status);
  const index = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length] ?? 'todo';
}

/**
 * Narrow lists have no In progress section. Those tasks stay in To do,
 * in the same order as the other open work.
 */
export function listBucket(status: string): 'todo' | 'done' {
  return normalizeStatus(status) === 'done' ? 'done' : 'todo';
}

/** Bucket tasks into the status columns, ordered by urgency. */
export function groupByStatus(tasks: TaskWithRefs[]): Record<TaskStatus, TaskWithRefs[]> {
  const groups: Record<TaskStatus, TaskWithRefs[]> = {
    todo: [],
    in_progress: [],
    done: [],
  };
  for (const t of tasks) {
    groups[normalizeStatus(t.status)].push(t);
  }
  for (const status of Object.keys(groups) as TaskStatus[]) {
    groups[status] = sortTasksByUrgency(groups[status]);
  }
  return groups;
}

export type KanbanProps = {
  tasks: TaskWithRefs[];
  showSpaceTag: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, status: TaskStatus, position?: number) => void;
  canWriteTask: (spaceId: string) => boolean;
};
