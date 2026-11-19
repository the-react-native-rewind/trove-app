import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { GoalForm, type GoalFormState } from '@/components/GoalForm';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { AccentDot } from '@/components/ui/Indicators';
import { StackScreen } from '@/components/ui/StackScreen';
import { Text } from '@/components/ui/Text';
import {
  useDeleteGoal,
  useGoal,
  useLinkGoalProject,
  useSetGoalAchieved,
  useSetGoalValue,
  useUpdateGoal,
} from '@/data/goals';
import { useAllProjects } from '@/data/projects';
import { confirmDialog } from '@/lib/dialog';
import {
  goalDraftProblem,
  goalProgress,
  goalResultLabel,
  isGoalAchieved,
  parseGoalValue,
  type Goal,
} from '@/lib/goals';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { resolveAccent, colors, radii, spacing } from '@/theme/tokens';

function formToGoal(goal: Goal): GoalFormState {
  return {
    title: goal.title,
    description: goal.description ?? '',
    resultKind: goal.resultKind,
    outcome: goal.outcome ?? '',
    targetValue: goal.targetValue === null ? '' : String(goal.targetValue),
    currentValue: String(goal.currentValue),
    unit: goal.unit ?? '',
    numberFormat: goal.numberFormat,
  };
}

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: goal, isLoading } = useGoal(id ?? '');
  const { data: projects = [] } = useAllProjects();
  const setValue = useSetGoalValue();
  const setAchieved = useSetGoalAchieved();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();
  const linkProject = useLinkGoalProject();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<GoalFormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [valueDraft, setValueDraft] = useState<string | null>(null);

  if (isLoading) {
    return (
      <StackScreen title="Goal">
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </StackScreen>
    );
  }

  if (!goal) {
    return (
      <StackScreen title="Goal">
        <EmptyState icon="flag-outline" title="That goal is gone" body="It may have been deleted." />
      </StackScreen>
    );
  }

  const reached = isGoalAchieved(goal);
  const counted = goal.resultKind === 'number';
  const progress = goalProgress(goal);
  const linkedIds = new Set(goal.projects.map((project) => project.id));

  function startEditing() {
    if (!goal) return;
    setForm(formToGoal(goal));
    setError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!goal || !form) return;
    const problem = goalDraftProblem(form);
    setError(problem);
    if (problem) return;
    try {
      await updateGoal.mutateAsync({
        id: goal.id,
        draft: {
          title: form.title,
          description: form.description,
          resultKind: form.resultKind,
          outcome: form.outcome,
          targetValue: parseGoalValue(form.targetValue),
          currentValue: parseGoalValue(form.currentValue) ?? 0,
          unit: form.unit,
          numberFormat: form.numberFormat,
        },
      });
      setEditing(false);
    } catch {
      setError('We could not save that. Try again.');
    }
  }

  function commitValue() {
    if (!goal || valueDraft === null) return;
    const next = parseGoalValue(valueDraft);
    setValueDraft(null);
    if (next === null || next === goal.currentValue) return;
    setValue.mutate(
      { id: goal.id, value: next },
      { onError: () => Toast.show({ type: 'error', text1: 'Couldn’t save that number' }) },
    );
  }

  async function onDelete() {
    if (!goal) return;
    const ok = await confirmDialog({
      title: 'Delete this goal?',
      message: 'The projects tied to it stay where they are.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    deleteGoal.mutate(goal.id, {
      onSuccess: () => router.back(),
      onError: () => Toast.show({ type: 'error', text1: 'Couldn’t delete that goal' }),
    });
  }

  if (editing && form) {
    return (
      <StackScreen
        title="Edit goal"
        footer={
          <View style={styles.editFooter}>
            <Button label="Save" onPress={() => void saveEdit()} loading={updateGoal.isPending} />
            <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} />
          </View>
        }
      >
        <GoalForm value={form} onChange={setForm} error={error} />
      </StackScreen>
    );
  }

  return (
    <StackScreen title={reached ? 'Reached' : 'Goal'}>
      <View style={styles.body}>
        <View style={styles.head}>
          <Text variant="screenTitle" style={reached ? styles.struck : undefined}>
            {goal.title}
          </Text>
          {goal.description ? (
            <Text variant="body" color={colors.inkSoft}>
              {goal.description}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text variant="label" color={colors.inkFaint}>
            {counted ? 'The number' : 'The result'}
          </Text>
          <Text variant="bodyMedium" color={colors.ink}>
            {goalResultLabel(goal)}
          </Text>
          {counted ? (
            <>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <View style={styles.valueRow}>
                <Text variant="meta" color={colors.inkFaint}>
                  Where you are
                </Text>
                <TextInput
                  value={valueDraft ?? String(goal.currentValue)}
                  onChangeText={setValueDraft}
                  onFocus={() => setValueDraft(String(goal.currentValue))}
                  onBlur={commitValue}
                  onSubmitEditing={commitValue}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  style={styles.valueInput}
                  accessibilityLabel="Where you are now"
                />
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Text variant="label" color={colors.inkFaint}>
              Projects serving this
            </Text>
            <Pressable
              onPress={() => {
                hapticLight();
                setPicking((open) => !open);
              }}
              accessibilityRole="button"
              accessibilityLabel={picking ? 'Done linking projects' : 'Link a project'}
              hitSlop={8}
            >
              <Text variant="meta" color={colors.brandDeep}>
                {picking ? 'Done' : 'Link'}
              </Text>
            </Pressable>
          </View>

          {goal.projects.length === 0 && !picking ? (
            <Text variant="meta" color={colors.inkFaint}>
              Nothing tied to this yet. Link a project so the work behind it is visible here.
            </Text>
          ) : null}

          {!picking
            ? goal.projects.map((project) => (
                <View key={project.id} style={styles.projectRow}>
                  <AccentDot color={resolveAccent(project.color)} size={10} />
                  <Text variant="body" style={styles.projectName} numberOfLines={1}>
                    {project.name}
                  </Text>
                  <Pressable
                    onPress={() =>
                      router.push(`/space/${project.spaceId}/project/${project.id}` as never)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${project.name}`}
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                  </Pressable>
                </View>
              ))
            : projects.map((project) => {
                const linked = linkedIds.has(project.id);
                return (
                  <Pressable
                    key={project.id}
                    onPress={() => {
                      hapticLight();
                      linkProject.mutate(
                        { goalId: goal.id, projectId: project.id, linked: !linked },
                        {
                          onError: () =>
                            Toast.show({ type: 'error', text1: 'Couldn’t change that link' }),
                        },
                      );
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: linked }}
                    accessibilityLabel={project.name}
                    style={styles.projectRow}
                  >
                    <Ionicons
                      name={linked ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={linked ? colors.brand : colors.inkFaint}
                    />
                    <Text variant="body" style={styles.projectName} numberOfLines={1}>
                      {project.name}
                    </Text>
                    <Text variant="meta" color={colors.inkFaint} numberOfLines={1}>
                      {project.spaceName}
                    </Text>
                  </Pressable>
                );
              })}

          {picking && projects.length === 0 ? (
            <Text variant="meta" color={colors.inkFaint}>
              No projects yet. Make one inside a circle first.
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button
            label={reached ? 'Put it back in play' : 'Mark it reached'}
            variant={reached ? 'secondary' : 'primary'}
            onPress={() => {
              if (!reached) hapticSuccess();
              setAchieved.mutate(
                { id: goal.id, achieved: !reached },
                { onError: () => Toast.show({ type: 'error', text1: 'Couldn’t update that goal' }) },
              );
            }}
          />
          <Button label="Edit" variant="ghost" onPress={startEditing} />
          <Button label="Delete goal" variant="ghost" onPress={() => void onDelete()} />
        </View>
      </View>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  body: { gap: spacing.lg },
  head: { gap: spacing.xs },
  struck: { textDecorationLine: 'line-through', color: colors.inkSoft },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  track: {
    height: 6,
    borderRadius: 6,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 6, backgroundColor: colors.brand },
  valueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  valueInput: {
    minWidth: 88,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.button,
    backgroundColor: colors.paper,
    color: colors.ink,
    textAlign: 'right',
  },
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  projectName: { flex: 1 },
  actions: { gap: spacing.sm },
  editFooter: { gap: spacing.sm },
});
