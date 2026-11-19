import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  cleanGoalValue,
  normalizeGoalText,
  patchGoal,
  sortGoals,
  withoutGoal,
  type Goal,
  type GoalNumberFormat,
  type GoalResultKind,
} from '@/lib/goals';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  result_kind: string;
  outcome: string | null;
  target_value: number | null;
  current_value: number;
  unit: string | null;
  number_format: string;
  achieved_at: string | null;
  created_at: string;
  goal_projects: {
    project_id: string;
    projects: { id: string; name: string; color: string; space_id: string } | null;
  }[];
};

// The linked projects ride along with the goal, so the list can show the work
// behind a goal without a second round trip.
const GOAL_SELECT =
  'id, title, description, result_kind, outcome, target_value, current_value, unit, number_format, achieved_at, created_at, goal_projects(project_id, projects(id, name, color, space_id))';

function numberFormatOf(value: string): GoalNumberFormat {
  return value === 'currency' || value === 'percent' ? value : 'plain';
}

function mapGoalRow(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    resultKind: row.result_kind === 'number' ? 'number' : 'outcome',
    outcome: row.outcome,
    targetValue: row.target_value === null ? null : Number(row.target_value),
    currentValue: Number(row.current_value),
    unit: row.unit,
    numberFormat: numberFormatOf(row.number_format),
    achievedAt: row.achieved_at,
    createdAt: row.created_at,
    projects: (row.goal_projects ?? []).flatMap((link) =>
      link.projects
        ? [
            {
              id: link.projects.id,
              name: link.projects.name,
              color: link.projects.color,
              spaceId: link.projects.space_id,
            },
          ]
        : [],
    ),
  };
}

/** Every goal this person has, open ones first. */
export function useGoals(enabled = true) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.goals(userId ?? ''),
    enabled: !!userId && enabled,
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase.from('goals').select(GOAL_SELECT);
      if (error) throw error;
      return sortGoals((data ?? []).map((row) => mapGoalRow(row as unknown as GoalRow)));
    },
  });
}

export function useGoal(goalId: string) {
  const goals = useGoals();
  return {
    ...goals,
    data: goals.data?.find((goal) => goal.id === goalId) ?? null,
  };
}

function patchGoals(qc: QueryClient, userId: string, map: (goals: Goal[]) => Goal[]) {
  const key = qk.goals(userId);
  const current = qc.getQueryData<Goal[]>(key);
  if (!current) return;
  const next = map(current);
  if (next !== current) qc.setQueryData(key, next);
}

export type GoalDraft = {
  title: string;
  description: string;
  resultKind: GoalResultKind;
  /** Used when resultKind is 'outcome'. */
  outcome: string;
  /** Used when resultKind is 'number'. */
  targetValue: number | null;
  currentValue: number;
  unit: string;
  numberFormat: GoalNumberFormat;
};

/** Only the fields that belong to the kind of result chosen are written. */
function draftToRow(draft: GoalDraft) {
  const counted = draft.resultKind === 'number';
  return {
    title: normalizeGoalText(draft.title),
    description: normalizeGoalText(draft.description) || null,
    result_kind: draft.resultKind,
    outcome: counted ? null : normalizeGoalText(draft.outcome),
    target_value: counted ? draft.targetValue : null,
    current_value: counted ? cleanGoalValue(draft.currentValue) : 0,
    // A percentage needs no unit, and a written result has nothing to count.
    unit: counted && draft.numberFormat !== 'percent' ? normalizeGoalText(draft.unit) || null : null,
    number_format: counted ? draft.numberFormat : 'plain',
  };
}

export function useCreateGoal() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: GoalDraft): Promise<string> => {
      const { data, error } = await supabase
        .from('goals')
        .insert(draftToRow(draft))
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSettled: () => {
      if (userId) void qc.invalidateQueries({ queryKey: qk.goals(userId) });
    },
  });
}

export function useUpdateGoal() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; draft: GoalDraft }) => {
      const { error } = await supabase
        .from('goals')
        .update({ ...draftToRow(input.draft), updated_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSettled: () => {
      if (userId) void qc.invalidateQueries({ queryKey: qk.goals(userId) });
    },
  });
}

/** Move a counted goal along. Written goals have nothing to move. */
export function useSetGoalValue() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; value: number }) => {
      const { error } = await supabase
        .from('goals')
        .update({ current_value: cleanGoalValue(input.value), updated_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!userId) return;
      await qc.cancelQueries({ queryKey: qk.goals(userId) });
      patchGoals(qc, userId, (goals) =>
        patchGoal(goals, input.id, { currentValue: cleanGoalValue(input.value) }),
      );
    },
    onSettled: () => {
      if (userId) void qc.invalidateQueries({ queryKey: qk.goals(userId) });
    },
  });
}

/** Reaching a goal, or putting it back in play. */
export function useSetGoalAchieved() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; achieved: boolean }) => {
      const achievedAt = input.achieved ? new Date().toISOString() : null;
      const { error } = await supabase
        .from('goals')
        .update({ achieved_at: achievedAt, updated_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!userId) return;
      await qc.cancelQueries({ queryKey: qk.goals(userId) });
      patchGoals(qc, userId, (goals) =>
        sortGoals(
          patchGoal(goals, input.id, {
            achievedAt: input.achieved ? new Date().toISOString() : null,
          }),
        ),
      );
    },
    onSettled: () => {
      if (userId) void qc.invalidateQueries({ queryKey: qk.goals(userId) });
    },
  });
}

export function useDeleteGoal() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      if (!userId) return;
      await qc.cancelQueries({ queryKey: qk.goals(userId) });
      patchGoals(qc, userId, (goals) => withoutGoal(goals, id));
    },
    onSettled: () => {
      if (userId) void qc.invalidateQueries({ queryKey: qk.goals(userId) });
    },
  });
}

/** Tie a project to a goal, or cut it loose. The project itself is untouched. */
export function useLinkGoalProject() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { goalId: string; projectId: string; linked: boolean }) => {
      if (input.linked) {
        const { error } = await supabase
          .from('goal_projects')
          .insert({ goal_id: input.goalId, project_id: input.projectId });
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('goal_projects')
        .delete()
        .eq('goal_id', input.goalId)
        .eq('project_id', input.projectId);
      if (error) throw error;
    },
    onSettled: () => {
      if (userId) void qc.invalidateQueries({ queryKey: qk.goals(userId) });
    },
  });
}
