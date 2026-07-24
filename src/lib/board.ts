import { STATUSES, type Priority, type TaskStatus, type TaskWithRefs } from './types';

export { STATUSES };

const PRIORITY_RANK: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Order tasks by urgency: earliest due date first, then highest priority.
 * Manual position and creation time provide stable tie-breakers.
 */
export function sortTasksByUrgency(tasks: TaskWithRefs[]): TaskWithRefs[] {
  return [...tasks].sort((a, b) => {
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }

    const priorityDifference =
      (a.priority ? PRIORITY_RANK[a.priority as Priority] : 3) -
      (b.priority ? PRIORITY_RANK[b.priority as Priority] : 3);
    if (priorityDifference !== 0) return priorityDifference;

    if (a.position !== b.position) return a.position - b.position;
    const createdDifference = a.created_at.localeCompare(b.created_at);
    return createdDifference || a.id.localeCompare(b.id);
  });
}

/** Bucket tasks into the four status columns. */
export function groupByStatus(tasks: TaskWithRefs[]): Record<TaskStatus, TaskWithRefs[]> {
  const groups: Record<TaskStatus, TaskWithRefs[]> = {
    backlog: [],
    todo: [],
    in_progress: [],
    done: [],
  };
  for (const t of tasks) {
    const s = t.status as TaskStatus;
    if (groups[s]) groups[s].push(t);
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
