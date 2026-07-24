import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { TaskMedia } from '@/components/TaskMedia';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { PriorityDot, SpaceTag } from '@/components/ui/Indicators';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { useSpaces } from '@/data/spaces';
import { useTask } from '@/data/tasks';
import {
  useRemoveTaskWeekPlan,
  useSetTaskWeekPlan,
  useTaskWeekPlan,
} from '@/data/weekPlans';
import { formatDueDate, isOverdue } from '@/lib/format';
import { canWrite, STATUSES, type Priority, type TaskStatus } from '@/lib/types';
import { formatWeekRange, getCurrentWeekStart, shiftWeek } from '@/lib/week';
import { colors, radii, spacing } from '@/theme/tokens';

export default function TaskView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: task, isLoading } = useTask(id);
  const { data: spaces = [] } = useSpaces();
  const { data: weekPlan, isLoading: isWeekPlanLoading } = useTaskWeekPlan(id);
  const setWeekPlan = useSetTaskWeekPlan();
  const removeWeekPlan = useRemoveTaskWeekPlan();
  const currentWeek = getCurrentWeekStart();

  if (isLoading) {
    return (
      <ModalScaffold title="Task">
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </ModalScaffold>
    );
  }

  if (!task) {
    return (
      <ModalScaffold title="Task">
        <Text variant="body" color={colors.inkSoft}>
          This task is no longer here. It may have been deleted.
        </Text>
      </ModalScaffold>
    );
  }

  const writable = canWrite(spaces.find((s) => s.id === task.space_id)?.role);
  const statusLabel = STATUSES.find((s) => s.key === (task.status as TaskStatus))?.label ?? task.status;
  const due = formatDueDate(task.due_date);
  const overdue = task.status !== 'done' && isOverdue(task.due_date);

  return (
    <ModalScaffold
      title="Task"
      footer={
        writable ? (
          <Button label="Edit task" onPress={() => router.push(`/task/${id}/edit` as never)} />
        ) : undefined
      }
    >
      {task.space ? (
        <View style={styles.tagRow}>
          <SpaceTag name={task.space.name} color={task.space.color} />
          <View style={styles.statusPill}>
            <Text variant="meta" color={colors.brandDeep}>
              {statusLabel}
            </Text>
          </View>
        </View>
      ) : null}

      <Text variant="screenTitle">{task.title}</Text>

      <View style={styles.meta}>
        {task.priority ? (
          <View style={styles.metaItem}>
            <PriorityDot level={task.priority as Priority} />
            <Text variant="meta" color={colors.inkSoft}>
              {task.priority[0].toUpperCase() + task.priority.slice(1)} priority
            </Text>
          </View>
        ) : null}
        {due ? (
          <View style={styles.metaItem}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={overdue ? colors.priorityHigh : colors.inkFaint}
            />
            <Text variant="meta" color={overdue ? colors.priorityHigh : colors.inkSoft}>
              {due}
            </Text>
          </View>
        ) : null}
        {task.assignee ? (
          <View style={styles.metaItem}>
            <Avatar name={task.assignee.display_name} uri={task.assignee.avatar_url} size={22} />
            <Text variant="meta" color={colors.inkSoft}>
              {task.assignee.display_name ?? 'Member'}
            </Text>
          </View>
        ) : null}
      </View>

      {task.description ? (
        <Text variant="body" color={colors.inkSoft}>
          {task.description}
        </Text>
      ) : (
        <Text variant="body" color={colors.inkFaint}>
          No notes yet.
        </Text>
      )}

      <View style={styles.weekPlan}>
        <View style={styles.weekPlanCopy}>
          <Text variant="bodyMedium">
            {weekPlan?.week_start === currentWeek
              ? 'Planned for My Week'
              : weekPlan
                ? `Planned for ${formatWeekRange(weekPlan.week_start)}`
                : 'Weekly plan'}
          </Text>
          <Text variant="meta" color={colors.inkSoft}>
            This planning choice is private to you.
          </Text>
        </View>
        <Button
          label={
            weekPlan?.week_start === currentWeek
              ? 'Remove from My Week'
              : weekPlan
                ? 'Move to My Week'
                : 'Add to My Week'
          }
          variant="secondary"
          size="md"
          loading={isWeekPlanLoading || setWeekPlan.isPending || removeWeekPlan.isPending}
          onPress={() => {
            if (weekPlan?.week_start === currentWeek) {
              removeWeekPlan.mutate(task.id);
            } else {
              setWeekPlan.mutate({ taskId: task.id, weekStart: currentWeek });
            }
          }}
        />
        {weekPlan ? (
          <View style={styles.weekShift}>
            <Pressable
              onPress={() =>
                setWeekPlan.mutate({
                  taskId: task.id,
                  weekStart: shiftWeek(weekPlan.week_start, -1),
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Move task to previous week"
              style={styles.weekShiftButton}
            >
              <Ionicons name="chevron-back" size={18} color={colors.brandDeep} />
            </Pressable>
            <Text variant="meta" color={colors.inkSoft}>
              Move to another week
            </Text>
            <Pressable
              onPress={() =>
                setWeekPlan.mutate({
                  taskId: task.id,
                  weekStart: shiftWeek(weekPlan.week_start, 1),
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Move task to next week"
              style={styles.weekShiftButton}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.brandDeep} />
            </Pressable>
          </View>
        ) : null}
        {setWeekPlan.isError || removeWeekPlan.isError ? (
          <Text variant="meta" color={colors.priorityHigh} center>
            Couldn’t update your weekly plan. Please try again.
          </Text>
        ) : null}
      </View>

      <TaskMedia taskId={task.id} spaceId={task.space_id} canWrite={writable} />
    </ModalScaffold>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusPill: {
    backgroundColor: colors.brandSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  weekPlan: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.brandSoft,
  },
  weekPlanCopy: { gap: spacing.xs },
  weekShift: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  weekShiftButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
});
