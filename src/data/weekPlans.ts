import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { TaskWithRefs } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { TASK_SELECT, withTaskMediaPreviews } from './tasks';

export type TaskWeekPlan = {
  id: string;
  task_id: string;
  week_start: string;
  position: number;
};

export type WeekTask = TaskWithRefs & {
  weekPlanId: string;
  weekPosition: number;
};

export function useWeekTasks(weekStart: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.weekTasks(userId ?? '', weekStart),
    enabled: !!userId,
    queryFn: async (): Promise<WeekTask[]> => {
      const { data: plans, error: planError } = await supabase
        .from('user_task_week_plans')
        .select('id, task_id, position')
        .eq('user_id', userId!)
        .eq('week_start', weekStart)
        .order('position', { ascending: true });
      if (planError) throw planError;
      if (!plans?.length) return [];

      const { data: tasks, error: taskError } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .in(
          'id',
          plans.map((plan) => plan.task_id),
        );
      if (taskError) throw taskError;

      const tasksWithMedia = await withTaskMediaPreviews(
        (tasks ?? []) as unknown as TaskWithRefs[],
      );
      const tasksById = new Map(tasksWithMedia.map((task) => [task.id, task]));
      return plans.flatMap((plan) => {
        const task = tasksById.get(plan.task_id);
        return task
          ? [{ ...task, weekPlanId: plan.id, weekPosition: plan.position }]
          : [];
      });
    },
  });
}

export function useTaskWeekPlan(taskId: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.taskWeekPlan(userId ?? '', taskId),
    enabled: !!userId && !!taskId,
    queryFn: async (): Promise<TaskWeekPlan | null> => {
      const { data, error } = await supabase
        .from('user_task_week_plans')
        .select('id, task_id, week_start, position')
        .eq('user_id', userId!)
        .eq('task_id', taskId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSetTaskWeekPlan() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, weekStart }: { taskId: string; weekStart: string }) => {
      if (!userId) throw new Error('You must be signed in to plan a task.');
      const { error } = await supabase.from('user_task_week_plans').upsert(
        {
          user_id: userId,
          task_id: taskId,
          week_start: weekStart,
          position: Date.now(),
        },
        { onConflict: 'user_id,task_id' },
      );
      if (error) throw error;
    },
    onSuccess: (_data, variables) => invalidateWeekPlans(qc, userId!, variables.taskId),
  });
}

export function useRemoveTaskWeekPlan() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      if (!userId) throw new Error('You must be signed in to update your week.');
      const { error } = await supabase
        .from('user_task_week_plans')
        .delete()
        .eq('user_id', userId)
        .eq('task_id', taskId);
      if (error) throw error;
    },
    onSuccess: (_data, taskId) => invalidateWeekPlans(qc, userId!, taskId),
  });
}

function invalidateWeekPlans(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  taskId: string,
) {
  qc.invalidateQueries({ queryKey: ['week-tasks'] });
  qc.invalidateQueries({ queryKey: qk.taskWeekPlan(userId, taskId) });
}
