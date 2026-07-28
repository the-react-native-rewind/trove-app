import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { celebrate } from '@/lib/celebrate';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { Priority, TaskMediaType, TaskStatus, TaskWithRefs } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

export const TASK_SELECT =
  '*, space:spaces(id,name,color), assignee:profiles!tasks_assignee_id_fkey(id,display_name,avatar_url)';

export async function withTaskMediaPreviews(tasks: TaskWithRefs[]): Promise<TaskWithRefs[]> {
  if (tasks.length === 0) return [];

  const { data: attachments, error } = await supabase
    .from('task_attachments')
    .select('task_id, path, media_type')
    .in(
      'task_id',
      tasks.map((task) => task.id),
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  const previewByTask = new Map<
    string,
    { path: string; mediaType: TaskMediaType }
  >();
  for (const attachment of attachments ?? []) {
    if (!previewByTask.has(attachment.task_id)) {
      previewByTask.set(attachment.task_id, {
        path: attachment.path,
        mediaType: attachment.media_type as TaskMediaType,
      });
    }
  }

  const previews = [...previewByTask.values()];
  const { data: signed } = await supabase.storage
    .from('task-media')
    .createSignedUrls(
      previews.map((preview) => preview.path),
      60 * 60,
    );
  const urlByPath = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]));

  return tasks.map((task) => {
    const preview = previewByTask.get(task.id);
    const url = preview ? urlByPath.get(preview.path) : null;
    return {
      ...task,
      media: preview && url ? { type: preview.mediaType, url } : null,
    };
  });
}

/** spaceId === 'all' gathers tasks across every space the user belongs to (the adaptive backlog). */
export function useTasks(spaceId: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.tasks(spaceId),
    enabled: !!userId,
    queryFn: async (): Promise<TaskWithRefs[]> => {
      let query = supabase.from('tasks').select(TASK_SELECT);
      if (spaceId !== 'all') query = query.eq('space_id', spaceId);
      const { data, error } = await query
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return withTaskMediaPreviews((data ?? []) as unknown as TaskWithRefs[]);
    },
  });
}

export function useTask(taskId: string) {
  return useQuery({
    queryKey: qk.task(taskId),
    enabled: !!taskId,
    queryFn: async (): Promise<TaskWithRefs | null> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('id', taskId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [task] = await withTaskMediaPreviews([data as unknown as TaskWithRefs]);
      return task ?? null;
    },
  });
}

export type TaskInput = {
  space_id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  assignee_id?: string | null;
  priority?: Priority | null;
  due_date?: string | null;
};

export function useCreateTask() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskInput) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          space_id: input.space_id,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          status: input.status,
          assignee_id: input.assignee_id ?? null,
          priority: input.priority ?? null,
          due_date: input.due_date ?? null,
          created_by: userId,
          position: Date.now(), // append to the end of its status column
        })
        .select(TASK_SELECT)
        .single();
      if (error) throw error;
      return { ...(data as unknown as TaskWithRefs), media: null };
    },
    onSuccess: () => invalidateTasks(qc),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<TaskInput>) => {
      const { id, ...rest } = input;
      const patch: {
        title?: string;
        description?: string | null;
        status?: TaskStatus;
        assignee_id?: string | null;
        priority?: Priority | null;
        due_date?: string | null;
      } = {};
      if (rest.title !== undefined) patch.title = rest.title.trim();
      if (rest.description !== undefined) patch.description = rest.description?.trim() || null;
      if (rest.status !== undefined) patch.status = rest.status;
      if (rest.assignee_id !== undefined) patch.assignee_id = rest.assignee_id;
      if (rest.priority !== undefined) patch.priority = rest.priority;
      if (rest.due_date !== undefined) patch.due_date = rest.due_date;
      const { error } = await supabase.from('tasks').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidateTasks(qc);
      qc.invalidateQueries({ queryKey: qk.task(vars.id) });
      if (vars.status === 'done') celebrate();
    },
  });
}

export function useMoveTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: TaskStatus; position?: number }) => {
      const { error } = await supabase
        .from('tasks')
        // No explicit position (swipe/status change) appends to the column end.
        .update({ status: input.status, position: input.position ?? Date.now() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidateTasks(qc);
      if (vars.status === 'done') celebrate();
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateTasks(qc),
  });
}

/**
 * Persist a new position for a task dragged within its status column.
 * Uses fractional indexing: the moved row sits at the midpoint of its neighbors,
 * so no other rows need rewriting.
 */
export function useReorderTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; position: number }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ position: input.position })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateTasks(qc),
  });
}

/** Midpoint between two neighbor positions (handles list edges). */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return Date.now();
  if (prev === null) return (next as number) - 1;
  if (next === null) return prev + 1;
  return (prev + next) / 2;
}

function invalidateTasks(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['tasks'] });
  qc.invalidateQueries({ queryKey: ['week-tasks'] });
  qc.invalidateQueries({ queryKey: qk.spaces });
}
