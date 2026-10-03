import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import type { Attachment } from '@/data/attachments';
import { plainTextFromMarkdown } from '@/lib/markdown';
import type { TaskWithRefs } from '@/lib/types';
import { formatDueDate, isOverdue } from '@/lib/format';
import { describeRepeat, repeatRuleFromTask } from '@/lib/recurrence';
import { useSelection } from '@/providers/SelectionProvider';
import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { TaskMediaStrip } from './TaskMediaStrip';
import { Avatar } from './ui/Avatar';
import { SpaceTag } from './ui/Indicators';
import { Text } from './ui/Text';

function useDotPop() {
  const scale = useSharedValue(1);
  function pop() {
    scale.value = withSequence(withTiming(1.5, { duration: 90 }), withTiming(1, { duration: 180 }));
  }
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return { style, pop };
}

type TaskCardProps = {
  task: TaskWithRefs;
  showSpaceTag?: boolean;
  /** Colour for the urgency dot, derived from the task's rank in its list. */
  heat?: string;
  /** The signed-in person can change this task. Long-press selects it. */
  selectable?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Tap the priority dot. Return true when the task actually moved up. */
  onLift?: () => boolean;
  /** Brief landing highlight after the list scrolls to follow a lift. */
  highlighted?: boolean;
  dragging?: boolean;
  media?: Attachment[];
};

export function TaskCard({
  task,
  showSpaceTag,
  heat,
  selectable = false,
  onPress,
  onLongPress,
  onLift,
  highlighted,
  dragging,
  media,
}: TaskCardProps) {
  const selection = useSelection();
  const dot = useDotPop();
  const due = formatDueDate(task.due_date);
  const overdue = task.status !== 'done' && isOverdue(task.due_date);
  const done = task.status === 'done';
  const repeats = describeRepeat(repeatRuleFromTask(task));
  const notes = plainTextFromMarkdown(task.description ?? '');
  const selecting = selection.active;
  const selected = selecting && selection.isSelected(task.id);

  function handlePress() {
    if (selecting) {
      if (selectable) selection.toggle(task.id);
      return;
    }
    onPress?.();
  }

  function handleDotPress() {
    if (selecting) {
      if (selectable) selection.toggle(task.id);
      return;
    }
    if (onLift) {
      if (onLift()) dot.pop();
      return;
    }
    onPress?.();
  }

  function handleLongPress() {
    if (selectable) {
      if (selecting) selection.toggle(task.id);
      else selection.enter(task.id);
      return;
    }
    onLongPress?.();
  }

  const label = [
    selected ? 'Selected' : selecting && selectable ? 'Not selected' : null,
    task.title,
    repeats,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      style={[
        styles.card,
        overdue && styles.overdue,
        selected && styles.selected,
        highlighted && styles.highlighted,
        dragging && styles.dragging,
      ]}
    >
      {media && media.length > 0 ? (
        <View style={styles.clip}>
          <TaskMediaStrip items={media} />
        </View>
      ) : null}
      <View style={styles.main}>
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={selectable ? 400 : 180}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={styles.body}
      >
      {showSpaceTag && task.space ? (
        <View style={styles.tagRow}>
          <SpaceTag name={task.space.name} color={task.space.color} />
        </View>
      ) : null}

      <View style={styles.titleRow}>
        {selecting && selectable ? (
          <View style={[styles.check, selected && styles.checkOn]}>
            {selected ? <Ionicons name="checkmark" size={14} color={colors.onBrand} /> : null}
          </View>
        ) : null}
        <Text
          variant="cardTitle"
          color={done ? colors.inkFaint : colors.ink}
          numberOfLines={3}
          style={styles.title}
        >
          {task.title}
        </Text>
      </View>

      {notes ? (
        <Text variant="meta" color={colors.inkSoft} numberOfLines={2}>
          {notes}
        </Text>
      ) : null}

      {(due || task.assignee || repeats) && (
        <View style={[styles.meta, heat ? styles.metaWithDot : null]}>
          {repeats ? (
            <View style={styles.dueWrap}>
              <Ionicons name="repeat" size={13} color={colors.inkFaint} />
              <Text variant="meta" color={colors.inkFaint}>
                Repeats
              </Text>
            </View>
          ) : null}
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
      {heat ? (
        <Pressable
          onPress={handleDotPress}
          onLongPress={handleLongPress}
          delayLongPress={selectable ? 400 : 180}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Raise ${task.title}`}
          style={styles.dotHit}
        >
          <Animated.View style={[styles.heatDot, { backgroundColor: heat }, dot.style]} />
        </Pressable>
      ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadows.card,
  },
  clip: { borderRadius: radii.card, overflow: 'hidden' },
  main: { position: 'relative' },
  dotHit: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    zIndex: 2,
    padding: 6,
  },
  body: { padding: spacing.lg, gap: spacing.sm },
  overdue: { backgroundColor: colors.overdueSurface, borderColor: colors.overdueBorder },
  dragging: { ...shadows.floating, borderColor: colors.brandSoft },
  selected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  highlighted: { borderColor: colors.honey, backgroundColor: '#FBEFD9' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1 },
  check: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tagRow: { flexDirection: 'row' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  metaWithDot: { paddingLeft: 26 },
  heatDot: { width: 14, height: 14, borderRadius: 7 },
  dueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spacer: { flex: 1 },
});
