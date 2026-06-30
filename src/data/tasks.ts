import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { Priority, TaskStatus, TaskWithRefs } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

const TASK_SELECT =
  '*, space:spaces(id,name,color), assignee:profiles!tasks_assignee_id_fkey(id,display_name,avatar_url)';

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
      return (data ?? []) as unknown as TaskWithRefs[];
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
      return (data as unknown as TaskWithRefs) ?? null;
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
      return data as unknown as TaskWithRefs;
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
    },
  });
}

export function useMoveTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: TaskStatus }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: input.status, position: Date.now() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateTasks(qc),
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
  qc.invalidateQueries({ queryKey: qk.spaces });
}
