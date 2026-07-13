import { STATUSES, type TaskStatus, type TaskWithRefs } from './types';

export { STATUSES };

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
  return groups;
}

export type KanbanProps = {
  tasks: TaskWithRefs[];
  showSpaceTag: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, status: TaskStatus) => void;
  canWriteTask: (spaceId: string) => boolean;
};
