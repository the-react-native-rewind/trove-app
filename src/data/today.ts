import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/lib/queryClient';
import { compareRank } from '@/lib/rank';
import { supabase } from '@/lib/supabase';
import { localToday, previewRoutineIds, type TodayLine } from '@/lib/today';
import { useAuth } from '@/providers/AuthProvider';

type TaskJoin = {
  id: string;
  title: string;
  status: string;
  space:
    | { id: string; name: string; color: string }
    | { id: string; name: string; color: string }[]
    | null;
};

type RoutineJoin = { days: number; active: boolean } | { days: number; active: boolean }[] | null;

type TodayRow = {
  id: string;
  day: string;
  text: string | null;
  task_id: string | null;
  routine_id: string | null;
  rank: string;
  checked_at: string | null;
  created_at: string;
  task: TaskJoin | TaskJoin[] | null;
  routine: RoutineJoin;
};

const TODAY_SELECT =
  'id, day, text, task_id, routine_id, rank, checked_at, created_at, task:tasks(id, title, status, space:spaces(id, name, color)), routine:today_routines(days, active)';

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function mapTodayRow(row: TodayRow): TodayLine {
  const task = one(row.task);
  const space = one(task?.space);
  const routine = one(row.routine);
  return {
    id: row.id,
    day: row.day,
    text: row.text,
    taskId: row.task_id,
    taskTitle: task?.title ?? null,
    taskStatus: task?.status ?? null,
    spaceId: space?.id ?? null,
    spaceName: space?.name ?? null,
    spaceColor: space?.color ?? null,
    routineId: row.routine_id,
    repeatDays: routine?.days ?? null,
    routineActive: routine?.active ?? false,
    rank: row.rank,
    checkedAt: row.checked_at,
    createdAt: row.created_at,
  };
}

async function fetchTodayLines(day: string): Promise<TodayLine[]> {
  const { data, error } = await supabase
    .from('today_items')
    .select(TODAY_SELECT)
    .eq('day', day)
    .order('rank', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as TodayRow[]).map(mapTodayRow);
}

/** Prepare the day, then read it. Safe to call every time the list opens. */
export function useTodayList(day: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.today(userId ?? '', day),
    enabled: !!userId && !!day,
    queryFn: async (): Promise<TodayLine[]> => {
      const { error } = await supabase.rpc('ensure_today', { p_day: day });
      if (error) throw error;
      return fetchTodayLines(day);
    },
  });
}

type RoutineRow = {
  id: string;
  text: string | null;
  task_id: string | null;
  days: number;
  rank: string;
  active: boolean;
  created_at: string;
  task: TaskJoin | TaskJoin[] | null;
};

const ROUTINE_SELECT =
  'id, text, task_id, days, rank, active, created_at, task:tasks(id, title, status, space:spaces(id, name, color))';

async function fetchActiveRoutines(): Promise<RoutineRow[]> {
  const { data, error } = await supabase.from('today_routines').select(ROUTINE_SELECT).eq('active', true);
  if (error) throw error;
  return (data ?? []) as unknown as RoutineRow[];
}

function routineLine(day: string, routine: RoutineRow): TodayLine {
  const task = one(routine.task);
  const space = one(task?.space);
  return {
    id: `preview:${routine.id}`,
    day,
    text: routine.text,
    taskId: routine.task_id,
    taskTitle: task?.title ?? null,
    taskStatus: task?.status ?? null,
    spaceId: space?.id ?? null,
    spaceName: space?.name ?? null,
    spaceColor: space?.color ?? null,
    routineId: routine.id,
    repeatDays: routine.days,
    routineActive: routine.active,
    rank: routine.rank,
    checkedAt: null,
    createdAt: routine.created_at,
    virtual: true,
  };
}

/**
 * Tomorrow, without preparing it. Stored plans plus routines due that
 * weekday. The routines are not written as rows.
 */
export function useTomorrowPlan(day: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.tomorrow(userId ?? '', day),
    enabled: !!userId && !!day,
    queryFn: async (): Promise<TodayLine[]> => {
      const [items, routines] = await Promise.all([fetchTodayLines(day), fetchActiveRoutines()]);
      const previews = new Set(
        previewRoutineIds(
          day,
          items.flatMap((line) => (line.routineId ? [line.routineId] : [])),
          routines.map((routine) => ({
            id: routine.id,
            text: routine.text,
            taskId: routine.task_id,
            days: routine.days,
            rank: routine.rank,
            active: routine.active,
          })),
        ),
      );
      return [...items, ...routines.filter((routine) => previews.has(routine.id)).map((routine) => routineLine(day, routine))].sort(
        (a, b) => compareRank(a.rank, b.rank) || a.createdAt.localeCompare(b.createdAt),
      );
    },
  });
}

export type OpenTaskChoice = {
  id: string;
  title: string;
  spaceName: string;
  spaceColor: string;
};

export function useOpenTaskChoices(search: string, enabled: boolean) {
  const term = search.trim().replace(/[%_\\]/g, '');
  return useQuery({
    queryKey: qk.todayTaskChoices(term),
    enabled,
    queryFn: async (): Promise<OpenTaskChoice[]> => {
      let query = supabase
        .from('tasks')
        .select('id, title, status, space:spaces(id, name, color)')
        .neq('status', 'done')
        .order('updated_at', { ascending: false })
        .limit(40);
      if (term) query = query.ilike('title', `%${term}%`);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as unknown as { id: string; title: string; space: TaskJoin['space'] }[]).map(
        (row) => {
          const space = one(row.space);
          return {
            id: row.id,
            title: row.title,
            spaceName: space?.name ?? 'Circle',
            spaceColor: space?.color ?? 'sage',
          };
        },
      );
    },
  });
}

function useInvalidateToday() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return () => {
    if (!userId) return;
    void qc.invalidateQueries({ queryKey: ['today', userId] });
    void qc.invalidateQueries({ queryKey: ['tomorrow', userId] });
  };
}

export function useAddTodayText(day: string) {
  const invalidate = useInvalidateToday();
  const asOf = localToday();
  return useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase.rpc('add_today_item', {
        p_day: day,
        p_text: text,
        p_task_id: null,
        p_as_of: asOf,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useAddTodayTask(day: string) {
  const invalidate = useInvalidateToday();
  const asOf = localToday();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.rpc('add_today_item', {
        p_day: day,
        p_text: null,
        p_task_id: taskId,
        p_as_of: asOf,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCheckTodayItem() {
  const invalidate = useInvalidateToday();
  return useMutation({
    mutationFn: async (input: { id: string; checked: boolean }) => {
      const { error } = await supabase
        .from('today_items')
        .update({ checked_at: input.checked ? new Date().toISOString() : null })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useMoveTodayItem() {
  const invalidate = useInvalidateToday();
  return useMutation({
    mutationFn: async (input: { id: string; rank: string }) => {
      const { error } = await supabase.rpc('move_today_item', {
        p_item_id: input.id,
        p_rank: input.rank,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRenameTodayItem() {
  const invalidate = useInvalidateToday();
  return useMutation({
    mutationFn: async (input: { id: string; text: string }) => {
      const { error } = await supabase.rpc('rename_today_item', {
        p_item_id: input.id,
        p_text: input.text,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetTodayRepeat() {
  const invalidate = useInvalidateToday();
  return useMutation({
    mutationFn: async (input: { id: string; days: number }) => {
      const { error } = await supabase.rpc('set_today_repeat', {
        p_item_id: input.id,
        p_days: input.days,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useMoveTodayItemToDay() {
  const invalidate = useInvalidateToday();
  const asOf = localToday();
  return useMutation({
    mutationFn: async (input: { id: string; day: string }) => {
      const { error } = await supabase.rpc('move_today_item_to_day', {
        p_item_id: input.id,
        p_day: input.day,
        p_as_of: asOf,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Put a routine preview onto today. Tomorrow still shows the schedule. */
export function usePlaceTodayRoutine() {
  const invalidate = useInvalidateToday();
  const asOf = localToday();
  return useMutation({
    mutationFn: async (routineId: string) => {
      const { error } = await supabase.rpc('place_today_routine', {
        p_routine_id: routineId,
        p_as_of: asOf,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTodayRoutine() {
  const invalidate = useInvalidateToday();
  return useMutation({
    mutationFn: async (input: { id: string; text?: string; days?: number; active?: boolean; rank?: string }) => {
      const patch: { text?: string; days?: number; active?: boolean; rank?: string } = {};
      if (input.text !== undefined) patch.text = input.text;
      if (input.days !== undefined) patch.days = input.days;
      if (input.active !== undefined) patch.active = input.active;
      if (input.rank !== undefined) patch.rank = input.rank;
      const { error } = await supabase.from('today_routines').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTodayItem() {
  const invalidate = useInvalidateToday();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_today_item', { p_item_id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
