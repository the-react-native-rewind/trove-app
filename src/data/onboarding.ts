import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { daysToBitmask, type OnboardingAction, type OnboardingPlan } from '@/lib/onboarding';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { localToday } from '@/lib/today';
import type { Profile } from '@/lib/types';
import { resolveAccent } from '@/theme/tokens';
import { useAuth } from '@/providers/AuthProvider';
import { useCreateSpace, useSpaces } from './spaces';
import { useCreateTask } from './tasks';
import { useAddTodayTask, useAddTodayText, useSetTodayRepeat } from './today';

export type ApplyOnboardingResult = { created: number; failed: number };

/**
 * Turn a reviewed onboarding plan into real data: a circle (space) per plan
 * circle, a task per action, and a today routine per routine. Actions marked
 * `today` are also placed on today. Loose "personal" items go into the default
 * Personal circle. Each step is best-effort — a single failure never aborts the
 * whole build — and `profiles.onboarded_at` is stamped at the end so the gate
 * never sends them back through onboarding.
 */
export function useApplyOnboarding() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const day = localToday();
  const { data: spaces = [] } = useSpaces();
  const createSpace = useCreateSpace();
  const createTask = useCreateTask();
  const addTodayTask = useAddTodayTask(day);
  const addTodayText = useAddTodayText(day);
  const setRepeat = useSetTodayRepeat();

  return useMutation({
    mutationFn: async (plan: OnboardingPlan): Promise<ApplyOnboardingResult> => {
      let created = 0;
      let failed = 0;

      async function addAction(
        action: OnboardingAction,
        circle: { id: string; name: string; color: string },
      ) {
        try {
          const task = await createTask.mutateAsync({
            space_id: circle.id,
            title: action.title,
            status: 'todo',
            priority: null,
            due_date: action.due_date,
          });
          created += 1;
          if (action.today) {
            try {
              await addTodayTask.mutateAsync({
                taskId: task.id,
                title: task.title,
                spaceName: circle.name,
                spaceColor: circle.color,
              });
            } catch {
              // Task still exists on the board even if the today line failed.
            }
          }
        } catch {
          failed += 1;
        }
      }

      async function addRoutine(text: string, days: number) {
        try {
          const lineId = (await addTodayText.mutateAsync(text)) as string | null;
          if (lineId) await setRepeat.mutateAsync({ id: lineId, days });
          created += 1;
        } catch {
          failed += 1;
        }
      }

      // Circles → spaces, with their actions and routines.
      for (const circle of plan.circles) {
        let target: { id: string; name: string; color: string };
        try {
          const space = await createSpace.mutateAsync({ name: circle.name, color: circle.color });
          target = { id: space.id, name: space.name, color: resolveAccent(space.color) };
          created += 1;
        } catch {
          failed += 1;
          continue; // no circle means its actions have nowhere to go
        }
        for (const action of circle.actions) await addAction(action, target);
        for (const routine of circle.routines) await addRoutine(routine.text, daysToBitmask(routine.days));
      }

      // Loose items → the existing Personal circle.
      const personal = spaces.find((space) => space.is_default) ?? spaces[0];
      if (personal) {
        const target = {
          id: personal.id,
          name: personal.name,
          color: resolveAccent(personal.color),
        };
        for (const action of plan.personal.actions) await addAction(action, target);
      }
      for (const routine of plan.personal.routines) {
        await addRoutine(routine.text, daysToBitmask(routine.days));
      }

      await markOnboarded(userId, qc);
      return { created, failed };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.spaces });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      if (userId) {
        qc.invalidateQueries({ queryKey: qk.today(userId, day) });
        qc.invalidateQueries({ queryKey: qk.profile(userId) });
      }
    },
  });
}

/**
 * Stamp onboarded_at so the gate lets this person through, and update the cached
 * profile straight away so the redirect to Today doesn't bounce back to onboarding
 * before the refetch lands.
 */
async function markOnboarded(userId: string | null, qc: QueryClient) {
  if (!userId) return;
  const stamp = new Date().toISOString();
  await supabase.from('profiles').update({ onboarded_at: stamp }).eq('id', userId);
  qc.setQueryData<Profile | null>(qk.profile(userId), (prev) =>
    prev ? { ...prev, onboarded_at: stamp } : prev,
  );
}

/** Skip onboarding without creating anything (still marks them onboarded). */
export function useSkipOnboarding() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await markOnboarded(userId, qc);
    },
    onSettled: () => {
      if (userId) qc.invalidateQueries({ queryKey: qk.profile(userId) });
    },
  });
}
