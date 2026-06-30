import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { TaskMedia } from '@/components/TaskMedia';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { PriorityDot, SpaceTag } from '@/components/ui/Indicators';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { useSpaces } from '@/data/spaces';
import { useTask } from '@/data/tasks';
import { formatDueDate, isOverdue } from '@/lib/format';
import { canWrite, STATUSES, type Priority, type TaskStatus } from '@/lib/types';
import { colors, radii, spacing } from '@/theme/tokens';

export default function TaskView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: task, isLoading } = useTask(id);
  const { data: spaces = [] } = useSpaces();

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
});
