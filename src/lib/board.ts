import { compareRank } from './rank';
import { STATUSES, type TaskStatus, type TaskWithRefs } from './types';

export { STATUSES };

/**
 * Order tasks by urgency: earliest due date first (no date last), then higher
 * rank first within that due date. Position, creation time, and id break ties.
 */
export function sortTasksByUrgency(tasks: TaskWithRefs[]): TaskWithRefs[] {
  return [...tasks].sort((a, b) => {
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }

    const rankDifference = compareRank(a.rank ?? '', b.rank ?? '');
    if (rankDifference !== 0) return rankDifference;

    if (a.position !== b.position) return a.position - b.position;
    const createdDifference = a.created_at.localeCompare(b.created_at);
    return createdDifference || a.id.localeCompare(b.id);
  });
}

/** Map stored status onto the three columns. Unknown or legacy values stay visible as To do. */
export function normalizeStatus(status: string): TaskStatus {
  if (status === 'in_progress' || status === 'done') return status;
  return 'todo';
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
  /** Lift one place within the column the card is shown in. */
  onLift?: (taskId: string, ordered: TaskWithRefs[]) => boolean;
};
