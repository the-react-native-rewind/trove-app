import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { localToday, shiftDay } from '@/lib/today';
import { useAuth } from '@/providers/AuthProvider';

const INSIGHTS_SELECT =
  'day, text, checked_at, dismissed_at, routine_id, routine:today_routines(active), task:tasks(title, space:spaces(name, color))';

type RawSpace = { name: string | null; color: string | null };
type RawTask = { title: string | null; space: RawSpace | RawSpace[] | null };
type RawRoutine = { active: boolean | null };
type RawRow = {
  day: string;
  text: string | null;
  checked_at: string | null;
  dismissed_at: string | null;
  routine_id: string | null;
  routine: RawRoutine | RawRoutine[] | null;
  task: RawTask | RawTask[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export type InsightsRange = 7 | 30 | 'all';

export type CircleStat = { name: string; color: string | null; done: number; total: number };
export type RoutineStat = {
  key: string;
  label: string;
  color: string | null;
  done: number;
  total: number;
};

export type InsightsSummary = {
  totalLines: number;
  doneLines: number;
  completionRate: number;
  circles: CircleStat[];
  routines: RoutineStat[];
};

/** Roll a window of Today rows into the figures the insights screen shows. Pure. */
export function summarizeInsights(rows: readonly RawRow[]): InsightsSummary {
  const visible = rows.filter((row) => row.dismissed_at == null);
  const totalLines = visible.length;
  const doneLines = visible.filter((row) => row.checked_at != null).length;

  // Where you finish: completed effort by circle, from the lines you kept.
  const byCircle = new Map<string, CircleStat>();
  for (const row of visible) {
    const space = one(one(row.task)?.space);
    const name = space?.name ?? 'Personal';
    const circle = byCircle.get(name) ?? { name, color: space?.color ?? null, done: 0, total: 0 };
    circle.total += 1;
    if (row.checked_at != null) circle.done += 1;
    byCircle.set(name, circle);
  }
  const circles = [...byCircle.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  // Routines: only those still live (active), merged by name so recreated
  // routines with the same label read as one. Every day a routine landed on
  // counts, including days it was skipped off (dismissed), so the rate is true.
  const byRoutine = new Map<string, RoutineStat>();
  for (const row of rows) {
    if (!row.routine_id) continue;
    const routine = one(row.routine);
    if (!routine?.active) continue; // drop deleted / switched-off routines
    const task = one(row.task);
    const label = (row.text ?? task?.title ?? 'Routine').trim();
    const key = label.toLowerCase();
    const space = one(task?.space);
    const existing = byRoutine.get(key);
    const stat =
      existing ?? { key, label, color: space?.color ?? null, done: 0, total: 0 };
    stat.total += 1;
    if (row.checked_at != null) stat.done += 1;
    byRoutine.set(key, stat);
  }
  const routines = [...byRoutine.values()].sort((a, b) => b.total - a.total).slice(0, 12);

  return {
    totalLines,
    doneLines,
    completionRate: totalLines ? doneLines / totalLines : 0,
    circles,
    routines,
  };
}

/** Insight figures over the chosen range of Today, scoped to the signed-in user by RLS. */
export function useInsights(range: InsightsRange) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['insights', userId, range],
    enabled: !!userId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const today = localToday();
      let query = supabase
        .from('today_items')
        .select(INSIGHTS_SELECT)
        .lte('day', today)
        .order('day', { ascending: true });
      if (range !== 'all') {
        query = query.gte('day', shiftDay(today, -(range - 1)));
      }
      const { data, error } = await query;
      if (error) throw error;
      return summarizeInsights((data ?? []) as unknown as RawRow[]);
    },
  });
}
