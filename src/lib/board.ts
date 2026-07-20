import type { Priority } from './types';
import { STATUSES, type TaskStatus, type TaskWithRefs } from './types';

export { STATUSES };

/** Higher number = more urgent, so it sorts to the top of a column. */
const PRIORITY_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

/**
 * Order tasks within a column: soonest due date first (overdue floats to the
 * top), tasks without a due date last, then break ties by priority (high first).
 */
export function compareTasks(a: TaskWithRefs, b: TaskWithRefs): number {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  const pa = a.priority ? PRIORITY_RANK[a.priority as Priority] : 0;
  const pb = b.priority ? PRIORITY_RANK[b.priority as Priority] : 0;
  return pb - pa;
}

/** Sort a flat list of tasks by due date then priority (non-mutating). */
export function sortTasks(tasks: TaskWithRefs[]): TaskWithRefs[] {
  return [...tasks].sort(compareTasks);
}

/** Bucket tasks into the four status columns, sorted by due date then priority. */
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
    groups[status].sort(compareTasks);
  }
  return groups;
}

export type KanbanProps = {
  tasks: TaskWithRefs[];
  showSpaceTag: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, status: TaskStatus) => void;
  canWriteTask: (spaceId: string) => boolean;
};
