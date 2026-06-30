import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Priority, TaskWithRefs } from '@/lib/types';
import { formatDueDate, isOverdue } from '@/lib/format';
import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { Avatar } from './ui/Avatar';
import { PriorityDot, SpaceTag } from './ui/Indicators';
import { Text } from './ui/Text';

type TaskCardProps = {
  task: TaskWithRefs;
  showSpaceTag?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  dragging?: boolean;
};

export function TaskCard({ task, showSpaceTag, onPress, onLongPress, dragging }: TaskCardProps) {
  const due = formatDueDate(task.due_date);
  const overdue = task.status !== 'done' && isOverdue(task.due_date);
  const done = task.status === 'done';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={180}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      style={[styles.card, dragging && styles.dragging]}
    >
      {showSpaceTag && task.space ? (
        <View style={styles.tagRow}>
          <SpaceTag name={task.space.name} color={task.space.color} />
        </View>
      ) : null}

      <Text variant="cardTitle" color={done ? colors.inkFaint : colors.ink} numberOfLines={3}>
        {task.title}
      </Text>

      {(due || task.assignee || task.priority) && (
        <View style={styles.meta}>
          {task.priority ? <PriorityDot level={task.priority as Priority} /> : null}
          {due ? (
            <View style={styles.dueWrap}>
              <Ionicons
                name="calendar-outline"
                size={13}
                color={overdue ? colors.priorityHigh : colors.inkFaint}
              />
              <Text variant="meta" color={overdue ? colors.priorityHigh : colors.inkFaint}>
                {due}
              </Text>
            </View>
          ) : null}
          <View style={styles.spacer} />
          {task.assignee ? (
            <Avatar name={task.assignee.display_name} uri={task.assignee.avatar_url} size={26} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadows.card,
  },
  dragging: { ...shadows.floating, borderColor: colors.brandSoft },
  tagRow: { flexDirection: 'row' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  dueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spacer: { flex: 1 },
});
