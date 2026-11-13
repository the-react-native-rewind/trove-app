import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Attachment } from '@/data/attachments';
import { visibleHandoffNote } from '@/lib/handoff';
import { plainTextFromMarkdown } from '@/lib/markdown';
import type { TaskWithRefs } from '@/lib/types';
import { formatDueDate, isOverdue } from '@/lib/format';
import { describeRepeat, repeatRuleFromTask } from '@/lib/recurrence';
import { useSelection } from '@/providers/SelectionProvider';
import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { HandoffNoteLine } from './TaskHandoff';
import { fullBleedMediaCorners, TaskMediaStrip } from './TaskMediaStrip';
import { AvatarStack } from './ui/Avatar';
import { InProgressTag, SpaceTag } from './ui/Indicators';
import { Text } from './ui/Text';

type TaskCardProps = {
  task: TaskWithRefs;
  showSpaceTag?: boolean;
  /** The signed-in person can change this task. Long-press selects it. */
  selectable?: boolean;
  /**
   * Show the In progress pill. Narrow lists do. A status column already
   * says it, so the board hides the pill.
   */
  showProgressTag?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  media?: Attachment[];
  /** Shows a Done button on the right of an open action. */
  onComplete?: () => void;
  /** The action is on a day's plan, so the chip reads as selected. */
  onToday?: boolean;
  /** Chip text when it is planned on another day, for example Tomorrow. Defaults to Today. */
  todayLabel?: string;
  /** Hold the chip to pick which day the action goes on. */
  onScheduleToday?: () => void;
  /** Tap the Today chip to add the action to today, or pull it back off. */
  onToggleToday?: () => void;
  /** Nudge the action one place up its list. Omitted when it is already top. */
  onMoveUp?: () => void;
  /** Nudge the action one place down its list. Omitted when it is already bottom. */
  onMoveDown?: () => void;
};

export function TaskCard({
  task,
  showSpaceTag,
  selectable = false,
  showProgressTag = true,
  onPress,
  onLongPress,
  media,
  onComplete,
  onToday = false,
  todayLabel = 'Today',
  onToggleToday,
  onScheduleToday,
  onMoveUp,
  onMoveDown,
}: TaskCardProps) {
  const selection = useSelection();
  const due = formatDueDate(task.due_date);
  const overdue = task.status !== 'done' && isOverdue(task.due_date);
  const done = task.status === 'done';
  const inProgress = task.status === 'in_progress';
  const showTag = Boolean(showSpaceTag && task.space);
  const showProgress = showProgressTag && inProgress;
  const repeats = describeRepeat(repeatRuleFromTask(task));
  const notes = plainTextFromMarkdown(task.description ?? '');
  const handoffNote = visibleHandoffNote(task);
  const handoffName = task.latest_handoff?.from_name ?? 'Former member';
  const selecting = selection.active;
  const selected = selecting && selection.isSelected(task.id);
  const showDone = Boolean(onComplete) && !done && !selecting;
  const showCarets = Boolean(onMoveUp || onMoveDown);
  const showTodayChip = Boolean(onToggleToday) && !done;

  function handlePress() {
    if (selecting) {
      if (selectable) selection.toggle(task.id);
      return;
    }
    onPress?.();
  }

  function handleLongPress() {
    if (selectable && selecting) {
      selection.toggle(task.id);
      return;
    }
    if (selectable) {
      selection.enter(task.id);
      return;
    }
    onLongPress?.();
  }

  const assigneeNames = task.assignees
    .map((person) => person.display_name ?? 'Member')
    .join(', ');
  const label = [
    selected ? 'Selected' : selecting && selectable ? 'Not selected' : null,
    task.title,
    inProgress ? 'In progress' : null,
    assigneeNames ? `Assigned to ${assigneeNames}` : null,
    repeats,
    handoffNote ? `${handoffName}: ${handoffNote}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      style={[
        styles.card,
        overdue && styles.overdue,
        selected && styles.selected,
      ]}
    >
      {media && media.length > 0 ? (
        <View style={styles.clip}>
          <TaskMediaStrip items={media} />
        </View>
      ) : null}
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={selectable ? 400 : 180}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={styles.body}
      >
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
          {showCarets ? (
            <View style={styles.caretCol}>
              <Pressable
                onPress={onMoveUp}
                disabled={!onMoveUp}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Move up"
                style={[styles.caret, styles.caretTop, !onMoveUp && styles.caretOff]}
              >
                <Ionicons name="chevron-up" size={15} color={onMoveUp ? colors.inkSoft : colors.inkFaint} />
              </Pressable>
              <Pressable
                onPress={onMoveDown}
                disabled={!onMoveDown}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Move down"
                style={[styles.caret, styles.caretBottom, !onMoveDown && styles.caretOff]}
              >
                <Ionicons name="chevron-down" size={15} color={onMoveDown ? colors.inkSoft : colors.inkFaint} />
              </Pressable>
            </View>
          ) : null}
        </View>

        {showTag && task.space ? (
          <View style={styles.tagRow}>
            <SpaceTag name={task.space.name} color={task.space.color} />
          </View>
        ) : null}

        {notes ? (
          <Text variant="meta" color={colors.inkSoft} numberOfLines={handoffNote ? 1 : 2}>
            {notes}
          </Text>
        ) : null}
        {handoffNote ? (
          <HandoffNoteLine
            name={handoffName}
            avatarUrl={task.latest_handoff?.from_avatar_url}
            note={handoffNote}
            accent={task.space?.color}
          />
        ) : null}

        {(due ||
          task.assignees.length > 0 ||
          repeats ||
          showProgress ||
          task.project ||
          showTodayChip ||
          showDone) && (
          <View style={styles.meta}>
            <View style={styles.metaLeft}>
              {showTodayChip ? (
                <Pressable
                  onPress={onToggleToday}
                  onLongPress={onScheduleToday}
                  delayLongPress={300}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityState={{ selected: onToday }}
                  accessibilityLabel={onToday ? `On ${todayLabel.toLowerCase()}` : 'Add to today'}
                  accessibilityHint={onScheduleToday ? 'Hold to pick a day' : undefined}
                  style={[styles.todayChip, onToday && styles.todayChipOn]}
                >
                  <Text variant="meta" color={onToday ? colors.onBrand : colors.inkSoft}>
                    {todayLabel}
                  </Text>
                </Pressable>
              ) : null}
              {task.assignees.length > 0 ? (
                <AvatarStack
                  people={task.assignees}
                  size={26}
                  ringColor={
                    selected ? colors.brandSoft : overdue ? colors.overdueSurface : colors.surface
                  }
                />
              ) : null}
              {task.project ? (
                <View style={styles.projectTag}>
                  <Ionicons name="folder-outline" size={12} color={colors.inkSoft} />
                  <Text variant="meta" color={colors.inkSoft} numberOfLines={1}>
                    {task.project.name}
                  </Text>
                </View>
              ) : null}
              {showProgress ? <InProgressTag reserveHeight={PROGRESS_TAG_HEIGHT} /> : null}
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
            </View>
            {showDone ? (
              <Pressable
                onPress={onComplete}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Mark ${task.title} done`}
                style={styles.doneButton}
              >
                <Ionicons name="checkmark" size={14} color={colors.brandDeep} />
                <Text variant="meta" color={colors.brandDeep}>
                  Done
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </Pressable>
    </View>
  );
}

const PROGRESS_TAG_HEIGHT = 9;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadows.card,
  },
  clip: { ...fullBleedMediaCorners, overflow: 'hidden' },
  body: { padding: spacing.lg, gap: spacing.sm },
  overdue: { backgroundColor: colors.overdueSurface, borderColor: colors.overdueBorder },
  selected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
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
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
  },
  caretCol: { alignSelf: 'center' },
  caret: {
    width: 34,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  caretTop: { borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomWidth: 0 },
  caretBottom: { borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  caretOff: { opacity: 0.4 },
  todayChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  todayChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  // Chips wrap onto a second line rather than push the Done button off the card.
  metaLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  dueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  projectTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
});
