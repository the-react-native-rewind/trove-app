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
import { FadeSheet, SheetBottom } from '@/components/ui/FadeSheet';
import { StackScreen } from '@/components/ui/StackScreen';
import { Text } from '@/components/ui/Text';
import { useTaskAttachments } from '@/data/attachments';
import { useRoster } from '@/data/members';
import { useSpaces } from '@/data/spaces';
import { useHandoffTask, useMoveTask, useTask, useUpdateTask } from '@/data/tasks';
import { confirmDialog } from '@/lib/dialog';
import { canHandOff } from '@/lib/handoff';
import { nextTaskStatus } from '@/lib/board';
import { formatDueDate, isOverdue } from '@/lib/format';
import {
  nextRecurrenceDate,
  repeatRuleFromTask,
  repeatScheduleCopy,
} from '@/lib/recurrence';
import { canManage, canWrite, STATUSES, type TaskStatus } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radii, spacing } from '@/theme/tokens';

export default function TaskView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useAuth();
  const { data: task, isLoading } = useTask(id);
  const { data: roster = [] } = useRoster(task?.space_id ?? 'all');
  const handoffTask = useHandoffTask();
  const [handingOff, setHandingOff] = useState(false);
  const [moving, setMoving] = useState(false);
  const { data: spaces = [] } = useSpaces();
  const { data: media = [] } = useTaskAttachments(id ?? '');
  const updateStatus = useUpdateTask();

  if (isLoading) {
    return (
      <StackScreen title="Task">
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </StackScreen>
    );
  }

  if (!task) {
    return (
      <StackScreen title="Task">
        <Text variant="body" color={colors.inkSoft}>
          This task is no longer here. It may have been deleted.
        </Text>
      </StackScreen>
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
  const repeatCopy = repeatScheduleCopy(
    repeatRule,
    task.due_date ? formatDueDate(nextRecurrenceDate(task.due_date, repeatRule)) : null,
    task.due_date != null,
  );

  return (
    <StackScreen
      title="Task"
      footer={
        writable ? (
          <Button
            label="Edit task"
            onPress={() => router.replace(`/task/${id}/edit` as never)}
          />
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

      <View style={styles.statusRow}>
        <Pressable
          onPress={() => {
            if (!writable || updateStatus.isPending) return;
            const next = nextTaskStatus(task.status);
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
          disabled={!writable || updateStatus.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Status ${statusLabel}. Tap to change.`}
          style={[styles.statusControl, (!writable || updateStatus.isPending) && styles.disabled]}
        >
          {updateStatus.isPending ? (
            <ActivityIndicator color={colors.brandDeep} />
          ) : (
            <>
              <Ionicons name="ellipse" size={12} color={statusDot(task.status)} />
              <Text variant="bodyMedium" numberOfLines={1}>
                {statusLabel}
              </Text>
            </>
          )}
        </Pressable>
        <Pressable
          onPress={() => setMoving(true)}
          disabled={!writable || destinations.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Move to another circle"
          style={[
            styles.moveButton,
            (!writable || destinations.length === 0) && styles.disabled,
          ]}
        >
          <Text variant="bodyMedium">Move</Text>
        </Pressable>
      </View>

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

      <MoveSheet
        visible={moving}
        taskId={task.id}
        destinations={destinations}
        onClose={() => setMoving(false)}
      />

      {task.description?.trim() ? (
        <MarkdownNotes markdown={task.description} />
      ) : (
        <Text variant="body" color={colors.inkFaint}>
          No notes yet.
        </Text>
      )}

      <AgentLogSection taskId={task.id} userId={userId} canModerate={canManage(role)} />

      <TaskMedia taskId={task.id} spaceId={task.space_id} canWrite={writable} />
    </StackScreen>
  );
}

function statusDot(status: string) {
  if (status === 'in_progress') return colors.honey;
  if (status === 'done') return colors.brand;
  return colors.inkFaint;
}

function MoveSheet({
  visible,
  taskId,
  destinations,
  onClose,
}: {
  visible: boolean;
  taskId: string;
  destinations: { id: string; name: string; color: string }[];
  onClose: () => void;
}) {
  const move = useMoveTask();

  async function onChoose(circleId: string) {
    const circle = destinations.find((item) => item.id === circleId);
    if (!circle) return;
    const confirmed = await confirmDialog({
      title: `Move to ${circle.name}?`,
      message:
        'People who are not in that circle will be unassigned. Photos and videos stay in the current circle. The project is cleared.',
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
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      Toast.show({ type: 'error', text1: 'Could not move', text2: message });
    }
  }

  return (
    <FadeSheet visible={visible} onClose={onClose} scroll>
      <SheetBottom style={styles.moveSheet}>
        <Text variant="sectionHeading">Move</Text>
        {destinations.length === 0 ? (
          <Text variant="body" color={colors.inkSoft}>
            This action is already in the only circle you belong to.
          </Text>
        ) : (
          <CirclePicker circles={destinations} value={null} onChange={(id) => void onChoose(id)} />
        )}
        {move.isPending ? <ActivityIndicator color={colors.brand} /> : null}
      </SheetBottom>
    </FadeSheet>
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
  statusRow: { flexDirection: 'row', gap: spacing.sm },
  statusControl: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  moveButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  moveSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
});
