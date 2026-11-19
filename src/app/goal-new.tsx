import { useRouter } from 'expo-router';
import { useState } from 'react';
import Toast from 'react-native-toast-message';

import { EMPTY_GOAL_FORM, GoalForm, type GoalFormState } from '@/components/GoalForm';
import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { useCreateGoal } from '@/data/goals';
import { goalDraftProblem, parseGoalValue } from '@/lib/goals';

export default function NewGoal() {
  const router = useRouter();
  const createGoal = useCreateGoal();
  const [form, setForm] = useState<GoalFormState>(EMPTY_GOAL_FORM);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    const problem = goalDraftProblem(form);
    setError(problem);
    if (problem) return;
    try {
      await createGoal.mutateAsync({
        title: form.title,
        description: form.description,
        resultKind: form.resultKind,
        outcome: form.outcome,
        targetValue: parseGoalValue(form.targetValue),
        currentValue: parseGoalValue(form.currentValue) ?? 0,
        unit: form.unit,
        numberFormat: form.numberFormat,
      });
      router.back();
    } catch {
      setError('We could not save that goal. Try again.');
      Toast.show({ type: 'error', text1: 'Couldn’t save that goal' });
    }
  }

  return (
    <ModalScaffold
      title="New goal"
      footer={
        <Button
          label="Set the goal"
          onPress={() => void onCreate()}
          loading={createGoal.isPending}
        />
      }
    >
      <GoalForm value={form} onChange={setForm} error={error} />
    </ModalScaffold>
  );
}
