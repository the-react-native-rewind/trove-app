import { compareRank } from './rank';
import { STATUSES, type TaskStatus, type TaskWithRefs } from './types';

export { STATUSES };

/**
 * Manual order first: a higher rank sorts above a lower one, whatever the
 * due dates are. Due date only breaks a tie (earliest first, no date last),
 * then position, creation time, and id.
 */
export function sortTasksByUrgency(tasks: TaskWithRefs[]): TaskWithRefs[] {
  return [...tasks].sort((a, b) => {
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
  });
}

/** Map a stored status onto todo, in progress, or done. Unknown values stay open. */
export function normalizeStatus(status: string): TaskStatus {
  if (status === 'done' || status === 'in_progress') return status;
  return 'todo';
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
