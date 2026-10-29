import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { CirclePicker } from '@/components/form';
import { AgentLogSection, HandoffSheet, TaskHandoffBlock } from '@/components/TaskHandoff';
import { MarkdownNotes } from '@/components/MarkdownNotes';
import { TaskMedia } from '@/components/TaskMedia';
import { fullBleedMediaCorners, TaskMediaStrip } from '@/components/TaskMediaStrip';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { SpaceTag } from '@/components/ui/Indicators';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { useTaskAttachments } from '@/data/attachments';
import { useRoster } from '@/data/members';
import { useMyWeekEnabled } from '@/data/profile';
import { useSpaces } from '@/data/spaces';
import { useHandoffTask, useMoveTask, useTask, useUpdateTask } from '@/data/tasks';
import { useDismissTodayItem, useMoveTodayItemToDay, useRestoreTodayItem, useTodayList } from '@/data/today';
import { showUndoToast } from '@/components/ui/AppToast';
import { confirmDialog } from '@/lib/dialog';
import { canHandOff } from '@/lib/handoff';
import {
  useRemoveTaskWeekPlan,
  useSetTaskWeekPlan,
  useTaskWeekPlan,
} from '@/data/weekPlans';
import { formatDueDate, isOverdue } from '@/lib/format';
import {
  nextRecurrenceDate,
  repeatRuleFromTask,
  repeatScheduleCopy,
} from '@/lib/recurrence';
import { canManage, canWrite, STATUSES, type TaskStatus } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { localToday, openTodayLineForTask, shiftDay } from '@/lib/today';
import { formatWeekRange, getCurrentWeekStart, shiftWeek } from '@/lib/week';
import { colors, radii, spacing } from '@/theme/tokens';

export default function TaskView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useAuth();
  const { data: task, isLoading } = useTask(id);
  const { data: roster = [] } = useRoster(task?.space_id ?? 'all');
  const handoffTask = useHandoffTask();
  const [handingOff, setHandingOff] = useState(false);
  const { data: spaces = [] } = useSpaces();
  const myWeekEnabled = useMyWeekEnabled();
  const { data: weekPlan, isLoading: isWeekPlanLoading } = useTaskWeekPlan(id, myWeekEnabled);
  const { data: media = [] } = useTaskAttachments(id ?? '');
  const setWeekPlan = useSetTaskWeekPlan();
  const removeWeekPlan = useRemoveTaskWeekPlan();
  const updateStatus = useUpdateTask();
  const currentWeek = getCurrentWeekStart();
  const today = localToday();
  const tomorrow = shiftDay(today, 1);
  const todayList = useTodayList(today);
  const moveToday = useMoveTodayItemToDay();
  const dismissToday = useDismissTodayItem();
  const restoreToday = useRestoreTodayItem();

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

  const role = spaces.find((s) => s.id === task.space_id)?.role;
  const writable = canWrite(role);
  const others = roster.filter((member) => member.user_id !== userId && member.profile);
  const offerHandoff = canHandOff({
    callerId: userId,
    writable,
    status: task.status,
    assigneeIds: task.assignees.map((person) => person.id),
    otherMemberCount: others.length,
  });
  const destinations = spaces.filter((space) => space.id !== task.space_id);
  const statusLabel = STATUSES.find((s) => s.key === (task.status as TaskStatus))?.label ?? task.status;
  const due = formatDueDate(task.due_date);
  const overdue = task.status !== 'done' && isOverdue(task.due_date);
  const repeatRule = repeatRuleFromTask(task);
  const todayLine = openTodayLineForTask(todayList.data ?? [], task.id);
  const repeatCopy = repeatScheduleCopy(
    repeatRule,
    task.due_date ? formatDueDate(nextRecurrenceDate(task.due_date, repeatRule)) : null,
    task.due_date != null,
  );

  return (
    <ModalScaffold
      title="Task"
      footer={
        writable ? (
          <Button label="Edit task" onPress={() => router.push(`/task/${id}/edit` as never)} />
        ) : undefined
      }
    >
      {media.length > 0 ? (
        <View style={styles.heroBleed}>
          <TaskMediaStrip items={media} maxHeight={260} />
        </View>
      ) : null}

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
        {repeatCopy ? (
          <View style={styles.metaItem}>
            <Ionicons name="repeat" size={14} color={colors.inkFaint} />
            <Text variant="meta" color={colors.inkSoft}>
              {repeatCopy}
            </Text>
          </View>
        ) : null}
        {task.assignees.map((person) => (
          <View key={person.id} style={styles.metaItem}>
            <Avatar name={person.display_name} uri={person.avatar_url} size={22} />
            <Text variant="meta" color={colors.inkSoft}>
              {person.display_name ?? 'Member'}
            </Text>
          </View>
        ))}
      </View>

      <TaskHandoffBlock taskId={task.id} userId={userId} fallback={task.latest_handoff} />

      {writable && task.status !== 'done' ? (
        <Button
          label={task.status === 'in_progress' ? 'Back to to do' : 'Mark in progress'}
          variant="secondary"
          size="md"
          loading={updateStatus.isPending}
          onPress={() => {
            const next = task.status === 'in_progress' ? 'todo' : 'in_progress';
            updateStatus.mutate(
              { id: task.id, status: next },
              {
                onError: () =>
                  Toast.show({
                    type: 'error',
                    text1: 'Could not update that task',
                    text2: 'Please try again.',
                  }),
              },
            );
          }}
        />
      ) : null}

      {offerHandoff ? (
        <Button
          label="Hand off"
          variant="secondary"
          size="md"
          onPress={() => setHandingOff(true)}
        />
      ) : null}
      {handingOff ? (
        <HandoffSheet
          members={others.flatMap((member) =>
            member.profile
              ? [{ id: member.user_id, name: member.profile.display_name ?? 'Member', avatarUrl: member.profile.avatar_url }]
              : [],
          )}
          currentStatus={task.status}
          busy={handoffTask.isPending}
          onClose={() => setHandingOff(false)}
          onSubmit={async (input) => {
            const me = roster.find((member) => member.user_id === userId)?.profile;
            await handoffTask.mutateAsync({
              taskId: task.id,
              callerId: userId ?? '',
              toUserId: input.toUserId,
              toName: input.toName,
              toAvatarUrl: input.toAvatarUrl,
              fromName: me?.display_name ?? null,
              fromAvatarUrl: me?.avatar_url ?? null,
              status: input.status,
              note: input.note,
            });
            setHandingOff(false);
          }}
        />
      ) : null}

      {writable && destinations.length > 0 ? (
        <MoveToCircle taskId={task.id} destinations={destinations} />
      ) : null}

      {task.description?.trim() ? (
        <MarkdownNotes markdown={task.description} />
      ) : (
        <Text variant="body" color={colors.inkFaint}>
          No notes yet.
        </Text>
      )}

      <AgentLogSection taskId={task.id} userId={userId} canModerate={canManage(role)} />

      {todayLine ? (
        <View style={styles.weekPlan}>
          <View style={styles.weekPlanCopy}>
            <Text variant="bodyMedium">On today</Text>
            <Text variant="meta" color={colors.inkSoft}>
              Your private plan. The task stays in its circle, and the due date stays.
            </Text>
          </View>
          <Button
            label="Tomorrow"
            variant="secondary"
            size="md"
            loading={moveToday.isPending}
            onPress={() => {
              const line = todayLine;
              moveToday.mutate(
                { id: line.id, day: tomorrow },
                {
                  onSuccess: () => {
                    showUndoToast('Moved to tomorrow', () => {
                      moveToday.mutate(
                        { id: line.id, day: today },
                        {
                          onError: () =>
                            Toast.show({ type: 'error', text1: 'Couldn’t undo that' }),
                        },
                      );
                    });
                  },
                  onError: () => Toast.show({ type: 'error', text1: 'Couldn’t move that to tomorrow' }),
                },
              );
            }}
          />
          <Button
            label="Not today"
            variant="secondary"
            size="md"
            loading={dismissToday.isPending || restoreToday.isPending}
            onPress={() => {
              const line = todayLine;
              dismissToday.mutate(line.id, {
                onSuccess: () => {
                  showUndoToast('Off today', () => {
                    restoreToday.mutate(line, {
                      onError: () => Toast.show({ type: 'error', text1: 'Couldn’t undo that' }),
                    });
                  });
                },
                onError: () => Toast.show({ type: 'error', text1: 'Couldn’t take that off today' }),
              });
            }}
          />
        </View>
      ) : null}

      {myWeekEnabled ? (
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
      ) : null}

      <TaskMedia taskId={task.id} spaceId={task.space_id} canWrite={writable} />
    </ModalScaffold>
  );
}

function MoveToCircle({
  taskId,
  destinations,
}: {
  taskId: string;
  destinations: { id: string; name: string; color: string }[];
}) {
  const [open, setOpen] = useState(false);
  const move = useMoveTask();

  async function onChoose(circleId: string) {
    const circle = destinations.find((item) => item.id === circleId);
    if (!circle) return;
    const confirmed = await confirmDialog({
      title: `Move to ${circle.name}?`,
      message:
        'People who are not in that circle will be unassigned. Photos and videos stay in the current circle.',
      confirmLabel: 'Move',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    try {
      const result = await move.mutateAsync({ taskId, targetSpaceId: circle.id });
      Toast.show({
        type: 'success',
        text1: `Moved to ${circle.name}`,
        text2: result.assignee_cleared
          ? 'People who are not in this circle were unassigned.'
          : undefined,
      });
      setOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      Toast.show({ type: 'error', text1: 'Could not move', text2: message });
    }
  }

  return (
    <View style={styles.move}>
      <Button
        label={open ? 'Hide circles' : 'Move to…'}
        variant="secondary"
        size="md"
        loading={move.isPending}
        onPress={() => setOpen((value) => !value)}
      />
      {open ? <CirclePicker circles={destinations} value={null} onChange={onChoose} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  heroBleed: {
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    overflow: 'hidden',
    ...fullBleedMediaCorners,
  },
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
  move: { gap: spacing.md },
  weekShiftButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
});
