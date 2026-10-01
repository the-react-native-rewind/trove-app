import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { celebrate } from '@/lib/celebrate';
import { MINE_VIEW_ID } from '@/lib/mine';
import { positionBetween } from '@/lib/position';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { Priority, TaskStatus, TaskWithRefs } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

export { positionBetween };

export const TASK_SELECT =
  '*, space:spaces(id,name,color), assignee:profiles!tasks_assignee_id_fkey(id,display_name,avatar_url)';

/**
 * spaceId === 'all' is Mine: tasks assigned to the signed-in person, across
 * every group they belong to. Any other id is that group's whole shared list.
 */
export function useTasks(spaceId: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.tasks(spaceId),
    enabled: !!userId,
    queryFn: async (): Promise<TaskWithRefs[]> => {
      let query = supabase.from('tasks').select(TASK_SELECT);
      if (spaceId === MINE_VIEW_ID) query = query.eq('assignee_id', userId!);
      else query = query.eq('space_id', spaceId);
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
          priority: input.priority ?? null,
          due_date: input.due_date ?? null,
          // New captures start on the creator's Mine list. Reassign from the task.
          assignee_id: input.assignee_id === undefined ? userId : input.assignee_id,
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

export type MoveTaskResult = {
  task_id: string;
  source_space_id: string;
  target_space_id: string;
  assignee_cleared: boolean;
  already_there: boolean;
  tags_removed: number;
};

/** Move a task into another circle. The database enforces edit rights and membership. */
export function useMoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: string; targetSpaceId: string }): Promise<MoveTaskResult> => {
      const { data, error } = await supabase.rpc('move_task', {
        p_task_id: input.taskId,
        p_target_space_id: input.targetSpaceId,
      });
      if (error) throw error;
      return data as unknown as MoveTaskResult;
    },
    onSuccess: (_data, vars) => {
      invalidateTasks(qc);
      qc.invalidateQueries({ queryKey: qk.task(vars.taskId) });
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

function invalidateTasks(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['tasks'] });
  qc.invalidateQueries({ queryKey: ['week-tasks'] });
  qc.invalidateQueries({ queryKey: qk.spaces });
}
