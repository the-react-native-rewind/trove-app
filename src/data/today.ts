import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { qk } from '@/lib/queryClient';
import { compareRank } from '@/lib/rank';
import { supabase } from '@/lib/supabase';
import {
  bottomTodayRank,
  dayMatches,
  insertTodayLine,
  localToday,
  preferFreshTodayLines,
  previewRoutineIds,
  replaceTodayLineId,
  shareTodayLines,
  withLinePatch,
  withRoutinePatch,
  withoutTodayLine,
  withoutVirtualRoutine,
  type TodayLine,
} from '@/lib/today';
import type { TaskStatus } from '@/lib/types';
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

/**
 * ensure_today is idempotent after the first prepare, but calling it on every
 * tick still replaces the cached rows when the read returns. Skip it once this
 * session has prepared the day. A pull-to-refresh still reads the latest rows.
 */
const preparedTodayDays = new Set<string>();

async function ensureTodayPrepared(userId: string, day: string) {
  const key = `${userId}:${day}`;
  if (preparedTodayDays.has(key)) return;
  const { error } = await supabase.rpc('ensure_today', { p_day: day });
  if (error) throw error;
  preparedTodayDays.add(key);
}

/**
 * Bumped when a Today edit is applied locally. A fetch that started earlier
 * returns the cache instead of the stale server payload, so the list does
 * not jump back.
 */
let todayFetchGenerationValue = 0;
let todaySettledVersion = 0;
let pendingTodayEdits = 0;

function todayFetchGeneration(): number {
  return todayFetchGenerationValue;
}

function bumpTodayFetchGeneration() {
  todayFetchGenerationValue += 1;
}

function todaySettled(): number {
  return todaySettledVersion;
}

function markTodaySettled() {
  todaySettledVersion += 1;
}

function todayEditsInFlight(): number {
  return pendingTodayEdits;
}

let pendingLineSerial = 0;

function nextPendingLineId(): string {
  pendingLineSerial += 1;
  return `pending:${pendingLineSerial}`;
}

type TodaySnapshot = [queryKey: readonly unknown[], data: TodayLine[] | undefined][];

function captureTodayLists(qc: QueryClient, userId: string): TodaySnapshot {
  return [
    ...qc.getQueriesData<TodayLine[]>({ queryKey: ['today', userId] }),
    ...qc.getQueriesData<TodayLine[]>({ queryKey: ['tomorrow', userId] }),
  ];
}

function restoreTodayLists(qc: QueryClient, snapshot: TodaySnapshot | undefined) {
  if (!snapshot) return;
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

function mapTodayLists(
  qc: QueryClient,
  userId: string,
  map: (lines: TodayLine[]) => TodayLine[],
) {
  for (const [key, data] of captureTodayLists(qc, userId)) {
    if (!data) continue;
    const next = map(data);
    if (next !== data) qc.setQueryData(key, next);
  }
}

function findTodayLine(qc: QueryClient, userId: string, id: string): TodayLine | undefined {
  for (const [, data] of captureTodayLists(qc, userId)) {
    const found = data?.find((line) => line.id === id);
    if (found) return found;
  }
  return undefined;
}

function findRoutinePreview(qc: QueryClient, userId: string, routineId: string): TodayLine | undefined {
  for (const [, data] of captureTodayLists(qc, userId)) {
    const found = data?.find((line) => line.virtual && line.routineId === routineId);
    if (found) return found;
  }
  return undefined;
}

function dayQueryKey(userId: string, day: string, asOf: string) {
  return day === asOf ? qk.today(userId, day) : qk.tomorrow(userId, day);
}

/**
 * Optimistic edits update the cache before the first await, so the list
 * paints the new row in the same turn as the tap. The snapshot is what we
 * put back if the write fails.
 */
async function beginTodayEdit(qc: QueryClient, userId: string, apply: () => void) {
  bumpTodayFetchGeneration();
  pendingTodayEdits += 1;
  try {
    const snapshot = captureTodayLists(qc, userId);
    apply();
    await qc.cancelQueries({ queryKey: ['today', userId] });
    await qc.cancelQueries({ queryKey: ['tomorrow', userId] });
    return snapshot;
  } catch (error) {
    pendingTodayEdits = Math.max(0, pendingTodayEdits - 1);
    throw error;
  }
}

/** Prepare the day, then read it. Later reads in this session skip ensure_today. */
export function useTodayList(day: string) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.today(userId ?? '', day),
    enabled: !!userId && !!day,
    // Focus already defaults off. Keep it off here so a window focus cannot
    // refetch the list into a loading state. There is no realtime subscription.
    refetchOnWindowFocus: false,
    structuralSharing: shareTodayLines,
    queryFn: async (): Promise<TodayLine[]> => {
      const user = userId;
      if (!user) return [];
      const started = todayFetchGeneration();
      const settled = todaySettled();
      await ensureTodayPrepared(user, day);
      const fetched = await fetchTodayLines(day);
      return preferFreshTodayLines({
        startedGeneration: started,
        currentGeneration: todayFetchGeneration(),
        startedSettled: settled,
        currentSettled: todaySettled(),
        editsInFlight: todayEditsInFlight(),
        fetched,
        cached: qc.getQueryData<TodayLine[]>(qk.today(user, day)),
      });
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
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.tomorrow(userId ?? '', day),
    enabled: !!userId && !!day,
    refetchOnWindowFocus: false,
    structuralSharing: shareTodayLines,
    queryFn: async (): Promise<TodayLine[]> => {
      const user = userId;
      if (!user) return [];
      const started = todayFetchGeneration();
      const settled = todaySettled();
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
      const fetched = [...items, ...routines.filter((routine) => previews.has(routine.id)).map((routine) => routineLine(day, routine))].sort(
        (a, b) => compareRank(a.rank, b.rank) || a.createdAt.localeCompare(b.createdAt),
      );
      return preferFreshTodayLines({
        startedGeneration: started,
        currentGeneration: todayFetchGeneration(),
        startedSettled: settled,
        currentSettled: todaySettled(),
        editsInFlight: todayEditsInFlight(),
        fetched,
        cached: qc.getQueryData<TodayLine[]>(qk.tomorrow(user, day)),
      });
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

function useRefreshToday() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return (editing?: boolean) => {
    if (editing && pendingTodayEdits > 0) pendingTodayEdits -= 1;
    // Any write that finished makes an in-flight read stale. The next refetch
    // starts after this bump, so it sees the committed rows.
    markTodaySettled();
    if (!userId) return;
    void qc.invalidateQueries({ queryKey: ['today', userId] });
    void qc.invalidateQueries({ queryKey: ['tomorrow', userId] });
  };
}

function blankLine(day: string, id: string, rank: string, createdAt: string): TodayLine {
  return {
    id,
    day,
    text: null,
    taskId: null,
    taskTitle: null,
    taskStatus: null,
    spaceId: null,
    spaceName: null,
    spaceColor: null,
    routineId: null,
    repeatDays: null,
    routineActive: false,
    rank,
    checkedAt: null,
    createdAt,
  };
}

function placeOptimisticLine(qc: QueryClient, userId: string, day: string, asOf: string, line: TodayLine) {
  const key = dayQueryKey(userId, day, asOf);
  const current = qc.getQueryData<TodayLine[]>(key) ?? [];
  qc.setQueryData(key, insertTodayLine(current, line));
}

export type TodayReorder = {
  id: string;
  rank: string;
  day: string;
  scope: 'today' | 'tomorrow';
  lines: TodayLine[];
};

export type TodayTaskDraft = {
  taskId: string;
  title: string;
  spaceName: string;
  spaceColor: string;
};

export type TodayCheck = {
  id: string;
  checked: boolean;
  /** Set when the tick also moves the linked task. The line updates immediately. */
  taskId?: string;
  taskStatus?: TaskStatus;
};

export function useAddTodayText(day: string) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const refresh = useRefreshToday();
  const asOf = localToday();
  return useMutation({
    mutationFn: async (text: string) => {
      const { data, error } = await supabase.rpc('add_today_item', {
        p_day: day,
        p_text: text,
        p_task_id: null,
        p_as_of: asOf,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async (text) => {
      if (!userId) return { snapshot: undefined, tempId: undefined, editing: false };
      const tempId = nextPendingLineId();
      const snapshot = await beginTodayEdit(qc, userId, () => {
        const current = qc.getQueryData<TodayLine[]>(dayQueryKey(userId, day, asOf)) ?? [];
        placeOptimisticLine(
          qc,
          userId,
          day,
          asOf,
          {
            ...blankLine(day, tempId, bottomTodayRank(current), new Date().toISOString()),
            text,
          },
        );
      });
      return { snapshot, tempId, editing: true };
    },
    onError: (_error, _text, context) => restoreTodayLists(qc, context?.snapshot),
    onSuccess: (id, _text, context) => {
      if (!userId || !context?.tempId || !id) return;
      mapTodayLists(qc, userId, (lines) => replaceTodayLineId(lines, context.tempId!, id));
    },
    onSettled: (_result, _error, _variables, context) => refresh(context?.editing === true),
  });
}

export function useAddTodayTask(day: string) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const refresh = useRefreshToday();
  const asOf = localToday();
  return useMutation({
    mutationFn: async (input: TodayTaskDraft) => {
      const { data, error } = await supabase.rpc('add_today_item', {
        p_day: day,
        p_text: null,
        p_task_id: input.taskId,
        p_as_of: asOf,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async (input) => {
      if (!userId) return { snapshot: undefined, tempId: undefined, editing: false };
      const tempId = nextPendingLineId();
      const snapshot = await beginTodayEdit(qc, userId, () => {
        const current = qc.getQueryData<TodayLine[]>(dayQueryKey(userId, day, asOf)) ?? [];
        placeOptimisticLine(qc, userId, day, asOf, {
          ...blankLine(day, tempId, bottomTodayRank(current), new Date().toISOString()),
          taskId: input.taskId,
          taskTitle: input.title,
          spaceName: input.spaceName,
          spaceColor: input.spaceColor,
        });
      });
      return { snapshot, tempId, editing: true };
    },
    onError: (_error, _input, context) => restoreTodayLists(qc, context?.snapshot),
    onSuccess: (id, _input, context) => {
      if (!userId || !context?.tempId || !id) return;
      mapTodayLists(qc, userId, (lines) => replaceTodayLineId(lines, context.tempId!, id));
    },
    onSettled: (_result, _error, _variables, context) => refresh(context?.editing === true),
  });
}

export function useCheckTodayItem() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const refresh = useRefreshToday();
  return useMutation({
    mutationFn: async (input: TodayCheck) => {
      if (input.taskId && input.taskStatus) {
        const { error } = await supabase
          .from('tasks')
          .update({ status: input.taskStatus, position: Date.now() })
          .eq('id', input.taskId);
        if (error) throw error;
      }
      const { error } = await supabase
        .from('today_items')
        .update({ checked_at: input.checked ? new Date().toISOString() : null })
        .eq('id', input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!userId) return { snapshot: undefined, editing: false };
      const snapshot = await beginTodayEdit(qc, userId, () => {
        const checkedAt = input.checked ? new Date().toISOString() : null;
        mapTodayLists(qc, userId, (lines) =>
          withLinePatch(lines, input.id, {
            checkedAt,
            ...(input.taskStatus ? { taskStatus: input.taskStatus } : {}),
          }),
        );
      });
      return { snapshot, editing: true };
    },
    onError: (_error, _input, context) => restoreTodayLists(qc, context?.snapshot),
    onSuccess: (_data, input) => {
      if (!input.taskId) return;
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['week-tasks'] });
      qc.invalidateQueries({ queryKey: qk.spaces });
    },
    onSettled: (_result, _error, _variables, context) => refresh(context?.editing === true),
  });
}

export function useMoveTodayItem() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const refresh = useRefreshToday();
  return useMutation({
    mutationFn: async (input: TodayReorder) => {
      const { error } = await supabase.rpc('move_today_item', {
        p_item_id: input.id,
        p_rank: input.rank,
      });
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!userId) return { snapshot: undefined, editing: false };
      const snapshot = await beginTodayEdit(qc, userId, () => {
        const key = input.scope === 'today' ? qk.today(userId, input.day) : qk.tomorrow(userId, input.day);
        qc.setQueryData(key, input.lines);
      });
      return { snapshot, editing: true };
    },
    onError: (_error, _input, context) => restoreTodayLists(qc, context?.snapshot),
    onSettled: (_result, _error, _variables, context) => refresh(context?.editing === true),
  });
}

export function useRenameTodayItem() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const refresh = useRefreshToday();
  return useMutation({
    mutationFn: async (input: { id: string; text: string }) => {
      const { error } = await supabase.rpc('rename_today_item', {
        p_item_id: input.id,
        p_text: input.text,
      });
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!userId) return { snapshot: undefined, editing: false };
      const snapshot = await beginTodayEdit(qc, userId, () => {
        mapTodayLists(qc, userId, (lines) => withLinePatch(lines, input.id, { text: input.text }));
      });
      return { snapshot, editing: true };
    },
    onError: (_error, _input, context) => restoreTodayLists(qc, context?.snapshot),
    onSettled: (_result, _error, _variables, context) => refresh(context?.editing === true),
  });
}

export function useSetTodayRepeat() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const refresh = useRefreshToday();
  return useMutation({
    mutationFn: async (input: { id: string; days: number }) => {
      const { error } = await supabase.rpc('set_today_repeat', {
        p_item_id: input.id,
        p_days: input.days,
      });
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!userId) return { snapshot: undefined, editing: false };
      const line = findTodayLine(qc, userId, input.id);
      const snapshot = await beginTodayEdit(qc, userId, () => {
        mapTodayLists(qc, userId, (lines) => {
          if (input.days === 0) {
            return withLinePatch(lines, input.id, {
              routineId: null,
              routineActive: false,
              repeatDays: null,
            });
          }
          if (line && line.checkedAt === null && !dayMatches(input.days, line.day)) {
            return withoutTodayLine(lines, input.id);
          }
          return withLinePatch(lines, input.id, { repeatDays: input.days, routineActive: true });
        });
      });
      return { snapshot, editing: true };
    },
    onError: (_error, _input, context) => restoreTodayLists(qc, context?.snapshot),
    onSettled: (_result, _error, _variables, context) => refresh(context?.editing === true),
  });
}

export function useMoveTodayItemToDay() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const refresh = useRefreshToday();
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
    onMutate: async (input) => {
      if (!userId) return { snapshot: undefined, editing: false };
      const line = findTodayLine(qc, userId, input.id);
      const snapshot = await beginTodayEdit(qc, userId, () => {
        if (!line || line.virtual || line.day === input.day) return;
        mapTodayLists(qc, userId, (lines) => withoutTodayLine(lines, line.id));
        const key = dayQueryKey(userId, input.day, asOf);
        const target = qc.getQueryData<TodayLine[]>(key) ?? [];
        const { virtual: _virtual, ...rest } = line;
        qc.setQueryData(
          key,
          insertTodayLine(target, {
            ...rest,
            day: input.day,
            rank: bottomTodayRank(target),
          }),
        );
      });
      return { snapshot, editing: true };
    },
    onError: (_error, _input, context) => restoreTodayLists(qc, context?.snapshot),
    onSettled: (_result, _error, _variables, context) => refresh(context?.editing === true),
  });
}

/** Put a routine preview onto today. Tomorrow still shows the schedule. */
export function usePlaceTodayRoutine() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const refresh = useRefreshToday();
  const asOf = localToday();
  return useMutation({
    mutationFn: async (routineId: string) => {
      const { data, error } = await supabase.rpc('place_today_routine', {
        p_routine_id: routineId,
        p_as_of: asOf,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async (routineId) => {
      if (!userId) return { snapshot: undefined, tempId: undefined, editing: false };
      const preview = findRoutinePreview(qc, userId, routineId);
      const tempId = nextPendingLineId();
      const snapshot = await beginTodayEdit(qc, userId, () => {
        if (!preview) return;
        const key = qk.today(userId, asOf);
        const current = qc.getQueryData<TodayLine[]>(key) ?? [];
        const { virtual: _virtual, ...rest } = preview;
        qc.setQueryData(
          key,
          insertTodayLine(current, {
            ...rest,
            id: tempId,
            day: asOf,
            rank: bottomTodayRank(current),
            checkedAt: null,
          }),
        );
      });
      return { snapshot, tempId, editing: true };
    },
    onError: (_error, _routineId, context) => restoreTodayLists(qc, context?.snapshot),
    onSuccess: (id, _routineId, context) => {
      if (!userId || !context?.tempId || !id) return;
      mapTodayLists(qc, userId, (lines) => replaceTodayLineId(lines, context.tempId!, id));
    },
    onSettled: (_result, _error, _variables, context) => refresh(context?.editing === true),
  });
}

export type TodayRoutinePatch = {
  id: string;
  text?: string;
  days?: number;
  active?: boolean;
  rank?: string;
  /** The list order after a drag. Applied as-is so keys stay where they were dropped. */
  day?: string;
  scope?: 'today' | 'tomorrow';
  lines?: TodayLine[];
};

export function useUpdateTodayRoutine() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const refresh = useRefreshToday();
  return useMutation({
    mutationFn: async (input: TodayRoutinePatch) => {
      const patch: { text?: string; days?: number; active?: boolean; rank?: string } = {};
      if (input.text !== undefined) patch.text = input.text;
      if (input.days !== undefined) patch.days = input.days;
      if (input.active !== undefined) patch.active = input.active;
      if (input.rank !== undefined) patch.rank = input.rank;
      const { error } = await supabase.from('today_routines').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!userId) return { snapshot: undefined, editing: false };
      const snapshot = await beginTodayEdit(qc, userId, () => {
        if (input.lines && input.day && input.scope) {
          const key = input.scope === 'today' ? qk.today(userId, input.day) : qk.tomorrow(userId, input.day);
          qc.setQueryData(key, input.lines);
          return;
        }
        mapTodayLists(qc, userId, (lines) => {
          let next = withRoutinePatch(lines, input.id, {
            ...(input.text !== undefined ? { text: input.text } : {}),
            ...(input.days !== undefined ? { repeatDays: input.days, routineActive: input.active !== false } : {}),
            ...(input.active !== undefined ? { routineActive: input.active } : {}),
            ...(input.rank !== undefined ? { rank: input.rank } : {}),
          });
          if (input.active === false) next = withoutVirtualRoutine(next, input.id);
          if (input.days !== undefined && input.days > 0) {
            const days = input.days;
            next = next.filter((line) => {
              if (!line.virtual || line.routineId !== input.id) return true;
              return dayMatches(days, line.day);
            });
          }
          return next;
        });
      });
      return { snapshot, editing: true };
    },
    onError: (_error, _input, context) => restoreTodayLists(qc, context?.snapshot),
    onSettled: (_result, _error, _variables, context) => refresh(context?.editing === true),
  });
}

export function useDeleteTodayItem() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const refresh = useRefreshToday();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_today_item', { p_item_id: id });
      if (error) throw error;
    },
    onMutate: async (id) => {
      if (!userId) return { snapshot: undefined, editing: false };
      const line = findTodayLine(qc, userId, id);
      const snapshot = await beginTodayEdit(qc, userId, () => {
        mapTodayLists(qc, userId, (lines) => {
          let next = withoutTodayLine(lines, id);
          if (line?.routineId) {
            next = withoutVirtualRoutine(next, line.routineId);
            next = withRoutinePatch(next, line.routineId, { routineActive: false });
          }
          return next;
        });
      });
      return { snapshot, editing: true };
    },
    onError: (_error, _id, context) => restoreTodayLists(qc, context?.snapshot),
    onSettled: (_result, _error, _variables, context) => refresh(context?.editing === true),
  });
}
