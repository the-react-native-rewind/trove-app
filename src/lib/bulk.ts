export type BulkAssignee = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type BulkPatch = {
  ids: ReadonlySet<string>;
  status?: string;
  setAssignees?: boolean;
  assignees?: BulkAssignee[];
  setProject?: boolean;
  projectId?: string | null;
};

type TaskLike = {
  id: string;
  status: string;
  assignees: BulkAssignee[];
  project_id?: string | null;
};

/** Optimistic row patch. Tasks outside the selection are returned unchanged. */
export function applyBulkPatch<T extends TaskLike>(task: T, patch: BulkPatch): T {
  if (!patch.ids.has(task.id)) return task;
  return {
    ...task,
    status: patch.status ?? task.status,
    assignees: patch.setAssignees ? (patch.assignees ?? []) : task.assignees,
    project_id: patch.setProject ? (patch.projectId ?? null) : task.project_id,
  };
}

export function patchCachedTasks(data: unknown, patch: BulkPatch): unknown {
  if (Array.isArray(data)) {
    return data.map((item) =>
      item && typeof item === 'object' && 'id' in item ? applyBulkPatch(item as TaskLike, patch) : item,
    );
  }
  if (data && typeof data === 'object' && 'id' in data) {
    return applyBulkPatch(data as TaskLike, patch);
  }
  return data;
}
