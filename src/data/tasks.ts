import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { normalizeAssignees, type AssigneeLink } from '@/lib/assignees';
import { type BulkAssignee, type BulkPatch, patchCachedTasks } from '@/lib/bulk';
import { celebrate } from '@/lib/celebrate';
import { hapticSuccess } from '@/lib/haptics';
import {
  applyHandoffToCache,
  normalizeLatestHandoff,
  normalizeLogCount,
  type HandoffCacheInput,
  type TaskHandoff,
} from '@/lib/handoff';
import { MINE_VIEW_ID } from '@/lib/mine';
import { positionBetween } from '@/lib/position';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { RepeatUnit } from '@/lib/recurrence';
import {
  canManage,
  type Priority,
  type SpaceRole,
  type SpaceWithMeta,
  type TaskStatus,
  type TaskWithRefs,
} from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import Toast from 'react-native-toast-message';

export { positionBetween };

export const TASK_SELECT =
  '*, space:spaces(id,name,color), assignees:task_assignees(position, profile:profiles(id,display_name,avatar_url)), latest_handoff:task_handoffs(id,from_user_id,to_user_id,status,note,note_edited_at,created_at,from_profile:profiles!task_handoffs_from_user_id_fkey(id,display_name,avatar_url),to_profile:profiles!task_handoffs_to_user_id_fkey(id,display_name,avatar_url)), agent_log_entries(count)';

const HANDOFF_SELECT =
  'id, from_user_id, to_user_id, status, note, note_edited_at, created_at, from_profile:profiles!task_handoffs_from_user_id_fkey(id,display_name,avatar_url), to_profile:profiles!task_handoffs_to_user_id_fkey(id,display_name,avatar_url)';

export function mapTaskRow(row: unknown): TaskWithRefs {
  const record = row as Omit<TaskWithRefs, 'assignees' | 'latest_handoff' | 'agent_log_count'> & {
    assignees?: AssigneeLink[] | null;
    latest_handoff?: unknown;
    agent_log_entries?: unknown;
  };
  const { latest_handoff: rawHandoff, agent_log_entries: rawLog, ...rest } = record;
  return {
    ...rest,
    assignees: normalizeAssignees(record.assignees),
    latest_handoff: normalizeLatestHandoff(rawHandoff),
    agent_log_count: normalizeLogCount(rawLog),
  };
}

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
      if (spaceId === MINE_VIEW_ID) {
        const { data: links, error: linkError } = await supabase
          .from('task_assignees')
          .select('task_id')
          .eq('user_id', userId!);
        if (linkError) throw linkError;
        const ids = [...new Set((links ?? []).map((link) => link.task_id))];
        if (ids.length === 0) return [];
        query = query.in('id', ids);
      } else {
        query = query.eq('space_id', spaceId);
      }
      const { data, error } = await query
        .order('created_at', { referencedTable: 'task_handoffs', ascending: false })
        .limit(1, { referencedTable: 'task_handoffs' })
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapTaskRow(row));
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
        .order('created_at', { referencedTable: 'task_handoffs', ascending: false })
        .limit(1, { referencedTable: 'task_handoffs' })
        .maybeSingle();
      if (error) throw error;
      return data ? mapTaskRow(data) : null;
    },
  });
}

export type TaskInput = {
  space_id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  assignee_ids?: string[];
  priority?: Priority | null;
  due_date?: string | null;
};

export type TaskPatch = Partial<TaskInput> & {
  repeat_unit?: RepeatUnit | null;
  repeat_interval?: number;
  repeat_weekday?: number | null;
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
          created_by: userId,
          position: Date.now(), // append to the end of its status column
        })
        .select('id')
        .single();
      if (error) throw error;
      const assigneeIds =
        input.assignee_ids === undefined ? (userId ? [userId] : []) : input.assignee_ids;
      if (assigneeIds.length > 0) {
        const { error: assignError } = await supabase.rpc('set_task_assignees', {
          p_task_id: data.id,
          p_user_ids: assigneeIds,
        });
        if (assignError) throw assignError;
      }
      const { data: full, error: readError } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('id', data.id)
        .single();
      if (readError) throw readError;
      return mapTaskRow(full);
    },
    onSuccess: () => invalidateTasks(qc),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & TaskPatch) => {
      const { id, ...rest } = input;
      const patch: {
        title?: string;
        description?: string | null;
        status?: TaskStatus;
        priority?: Priority | null;
        due_date?: string | null;
        repeat_unit?: RepeatUnit | null;
        repeat_interval?: number;
        repeat_weekday?: number | null;
      } = {};
      if (rest.title !== undefined) patch.title = rest.title.trim();
      if (rest.description !== undefined) patch.description = rest.description?.trim() || null;
      if (rest.status !== undefined) patch.status = rest.status;
      if (rest.priority !== undefined) patch.priority = rest.priority;
      if (rest.due_date !== undefined) patch.due_date = rest.due_date;
      if (rest.repeat_unit !== undefined) patch.repeat_unit = rest.repeat_unit;
      if (rest.repeat_interval !== undefined) patch.repeat_interval = rest.repeat_interval;
      if (rest.repeat_weekday !== undefined) patch.repeat_weekday = rest.repeat_weekday;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('tasks').update(patch).eq('id', id);
        if (error) throw error;
      }
      if (rest.assignee_ids !== undefined) {
        const { error } = await supabase.rpc('set_task_assignees', {
          p_task_id: id,
          p_user_ids: rest.assignee_ids,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      invalidateTasks(qc);
      qc.invalidateQueries({ queryKey: qk.task(vars.id) });
      if (vars.status === 'done') {
        hapticSuccess();
        celebrate();
      }
    },
  });
}

export function useMoveTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: TaskStatus;
      position?: number;
      /** Board completions celebrate. Today ticks pass false and play their own chime. */
      celebrateCompletion?: boolean;
    }) => {
      const { error } = await supabase
        .from('tasks')
        // No explicit position (swipe/status change) appends to the column end.
        .update({ status: input.status, position: input.position ?? Date.now() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidateTasks(qc);
      if (vars.status === 'done' && vars.celebrateCompletion !== false) {
        hapticSuccess();
        celebrate();
      }
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
function patchTaskRank(data: unknown, id: string, rank: string): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => patchTaskRank(item, id, rank));
  }
  if (data && typeof data === 'object' && 'id' in data && (data as { id: string }).id === id) {
    return { ...data, rank };
  }
  return data;
}

/** Write the rank chosen by a drag. Only an owner or admin of that circle may change it. */
export function useUpdateTaskRank() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; rank: string }) => {
      await assertCallerCanReorder(input.id, userId);
      const { error } = await supabase.from('tasks').update({ rank: input.rank }).eq('id', input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      const spaces = qc.getQueryData<SpaceWithMeta[]>(qk.spaces);
      const lists = qc.getQueriesData<TaskWithRefs[]>({ queryKey: ['tasks'] });
      for (const [, data] of lists) {
        const task = data?.find((item) => item.id === input.id);
        if (!task) continue;
        const role = spaces?.find((space) => space.id === task.space_id)?.role;
        if (role && !canManage(role)) {
          throw new Error('Only an owner or admin can reorder tasks');
        }
        break;
      }
      await qc.cancelQueries({ queryKey: ['tasks'] });
      await qc.cancelQueries({ queryKey: ['week-tasks'] });
      const previous = [
        ...qc.getQueriesData({ queryKey: ['tasks'] }),
        ...qc.getQueriesData({ queryKey: ['week-tasks'] }),
      ];
      const apply = (data: unknown) => patchTaskRank(data, input.id, input.rank);
      qc.setQueriesData({ queryKey: ['tasks'] }, apply);
      qc.setQueriesData({ queryKey: ['week-tasks'] }, apply);
      return { previous };
    },
    onError: (_error, _input, context) => {
      for (const [key, data] of context?.previous ?? []) qc.setQueryData(key, data);
    },
    onSettled: (_data, _error, input) => {
      invalidateTasks(qc);
      qc.invalidateQueries({ queryKey: qk.task(input.id) });
    },
  });
}

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

export type BulkUpdateInput = {
  ids: string[];
  status?: TaskStatus;
  setAssignees?: boolean;
  assigneeIds?: string[];
  assignees?: BulkAssignee[];
  /** Confetti when this completion newly finishes at least one task. */
  celebrateCompletion?: boolean;
};

/**
 * Assign or complete many tasks in one database call. The cache updates
 * immediately and rolls back if the server rejects the batch.
 */
export function useBulkUpdateTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BulkUpdateInput) => {
      const { data, error } = await supabase.rpc('bulk_update_tasks', {
        p_task_ids: input.ids,
        p_status: input.status ?? null,
        p_assignee_ids: input.setAssignees ? (input.assigneeIds ?? []) : null,
        p_set_assignee: input.setAssignees ?? false,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      await qc.cancelQueries({ queryKey: ['week-tasks'] });
      await qc.cancelQueries({ queryKey: ['task'] });
      const previous = [
        ...qc.getQueriesData({ queryKey: ['tasks'] }),
        ...qc.getQueriesData({ queryKey: ['week-tasks'] }),
        ...qc.getQueriesData({ queryKey: ['task'] }),
      ];
      const patch: BulkPatch = {
        ids: new Set(input.ids),
        status: input.status,
        setAssignees: input.setAssignees,
        assignees: input.setAssignees ? (input.assignees ?? []) : undefined,
      };
      const apply = (data: unknown) => patchCachedTasks(data, patch);
      qc.setQueriesData({ queryKey: ['tasks'] }, apply);
      qc.setQueriesData({ queryKey: ['week-tasks'] }, apply);
      qc.setQueriesData({ queryKey: ['task'] }, apply);
      return { previous };
    },
    onError: (_error, _input, context) => {
      for (const [key, data] of context?.previous ?? []) qc.setQueryData(key, data);
    },
    onSuccess: (_data, input) => {
      if (input.status === 'done' && input.celebrateCompletion) celebrate();
    },
    onSettled: (_data, _error, input) => {
      invalidateTasks(qc);
      for (const id of input.ids) qc.invalidateQueries({ queryKey: qk.task(id) });
    },
  });
}

async function assertCallerCanReorder(taskId: string, userId: string | null) {
  if (!userId) throw new Error('Only an owner or admin can reorder tasks');
  const { data: task, error } = await supabase
    .from('tasks')
    .select('space_id')
    .eq('id', taskId)
    .maybeSingle();
  if (error) throw error;
  if (!task) throw new Error('Task not found');

  const { data: membership, error: memberError } = await supabase
    .from('space_members')
    .select('role')
    .eq('space_id', task.space_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!canManage(membership?.role as SpaceRole | undefined)) {
    throw new Error('Only an owner or admin can reorder tasks');
  }
}

export type AgentLogRow = {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author: { id: string; display_name: string | null; avatar_url: string | null } | null;
};

export function useTaskHandoffs(taskId: string) {
  return useQuery({
    queryKey: qk.handoffs(taskId),
    enabled: !!taskId,
    queryFn: async (): Promise<TaskHandoff[]> => {
      const { data, error } = await supabase
        .from('task_handoffs')
        .select(HANDOFF_SELECT)
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((row) => normalizeLatestHandoff(row))
        .filter((row): row is TaskHandoff => row != null);
    },
  });
}

export function useHandoffTask() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: HandoffCacheInput) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase.rpc('handoff_task', {
        p_task_id: input.taskId,
        p_to_user_id: input.toUserId,
        p_status: input.status,
        p_note: input.note,
      });
      if (error) throw new Error(error.message);
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      await qc.cancelQueries({ queryKey: ['week-tasks'] });
      await qc.cancelQueries({ queryKey: ['task'] });
      const previous = [
        ...qc.getQueriesData({ queryKey: ['tasks'] }),
        ...qc.getQueriesData({ queryKey: ['week-tasks'] }),
        ...qc.getQueriesData({ queryKey: ['task'] }),
      ];
      for (const [key, data] of qc.getQueriesData({ queryKey: ['tasks'] })) {
        const mine = Array.isArray(key) && key[1] === MINE_VIEW_ID;
        qc.setQueryData(key, applyHandoffToCache(data, input, mine));
      }
      for (const [key, data] of qc.getQueriesData({ queryKey: ['week-tasks'] })) {
        qc.setQueryData(key, applyHandoffToCache(data, input, false));
      }
      for (const [key, data] of qc.getQueriesData({ queryKey: ['task'] })) {
        qc.setQueryData(key, applyHandoffToCache(data, input, false));
      }
      return { previous };
    },
    onError: (error, _input, context) => {
      for (const [key, data] of context?.previous ?? []) qc.setQueryData(key, data);
      const message = error instanceof Error ? error.message : 'Please try again.';
      Toast.show({ type: 'error', text1: 'Could not hand off', text2: message });
    },
    onSuccess: (_data, input) => {
      Toast.show({ type: 'success', text1: `Handed to ${input.toName}` });
    },
    onSettled: (_data, _error, input) => {
      invalidateTasks(qc);
      qc.invalidateQueries({ queryKey: qk.task(input.taskId) });
      qc.invalidateQueries({ queryKey: qk.handoffs(input.taskId) });
    },
  });
}

export function useEditHandoffNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: string; handoffId: string; note: string }) => {
      const { error } = await supabase.rpc('edit_handoff_note', {
        p_handoff_id: input.handoffId,
        p_note: input.note,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.task(input.taskId) });
      qc.invalidateQueries({ queryKey: qk.handoffs(input.taskId) });
      invalidateTasks(qc);
    },
  });
}

export function useAgentLog(taskId: string) {
  return useQuery({
    queryKey: qk.agentLog(taskId),
    enabled: !!taskId,
    queryFn: async (): Promise<AgentLogRow[]> => {
      const { data, error } = await supabase
        .from('agent_log_entries')
        .select('id, task_id, author_id, body, created_at, author:profiles!agent_log_entries_author_id_fkey(id,display_name,avatar_url)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const record = row as unknown as {
          id: string;
          task_id: string;
          author_id: string | null;
          body: string;
          created_at: string;
          author: AgentLogRow['author'] | AgentLogRow['author'][] | null;
        };
        const author = Array.isArray(record.author) ? (record.author[0] ?? null) : record.author;
        return { ...record, author: author ?? null };
      });
    },
  });
}

export function useDeleteAgentLogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: string; entryId: string }) => {
      const { error } = await supabase.from('agent_log_entries').delete().eq('id', input.entryId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.agentLog(input.taskId) });
      qc.invalidateQueries({ queryKey: qk.task(input.taskId) });
      invalidateTasks(qc);
    },
  });
}

function invalidateTasks(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['tasks'] });
  qc.invalidateQueries({ queryKey: ['week-tasks'] });
  qc.invalidateQueries({ queryKey: qk.spaces });
}
