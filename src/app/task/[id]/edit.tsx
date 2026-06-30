import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AssigneePicker, DueDatePicker, OptionChips } from '@/components/form';
import { Button } from '@/components/ui/Button';
import { SpaceTag } from '@/components/ui/Indicators';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useSpaces } from '@/data/spaces';
import { useDeleteTask, useTask, useUpdateTask } from '@/data/tasks';
import { canWrite, STATUSES, type Priority, type TaskStatus } from '@/lib/types';
import { colors, priority as priorityTokens, spacing } from '@/theme/tokens';

const PRIORITY_OPTIONS: { value: Priority | 'none'; label: string; color?: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low', color: priorityTokens.low.color },
  { value: 'medium', label: 'Medium', color: priorityTokens.medium.color },
  { value: 'high', label: 'High', color: priorityTokens.high.color },
];

export default function TaskEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: task, isLoading } = useTask(id);
  const { data: spaces = [] } = useSpaces();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <ModalScaffold title="Edit task">
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </ModalScaffold>
    );
  }

  if (!task) {
    return (
      <ModalScaffold title="Edit task">
        <Text variant="body" color={colors.inkSoft}>
          This task is no longer here. It may have been deleted.
        </Text>
      </ModalScaffold>
    );
  }

  const writable = canWrite(spaces.find((s) => s.id === task.space_id)?.role);

  function patch(input: Parameters<typeof updateTask.mutate>[0]) {
    updateTask.mutate(input);
  }

  function confirmDelete() {
    Alert.alert('Delete task', 'This removes the task for everyone in the space.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTask.mutateAsync(task!.id);
          // Pop edit + view back to the board.
          router.back();
          router.back();
        },
      },
    ]);
  }

  if (!writable) {
    return (
      <ModalScaffold title="Edit task">
        <Text variant="body" color={colors.inkSoft}>
          You can view this space but not change its tasks.
        </Text>
      </ModalScaffold>
    );
  }

  return (
    <ModalScaffold
      title="Edit task"
      footer={<Button label="Delete task" variant="danger" onPress={confirmDelete} />}
    >
      {task.space ? (
        <View style={styles.tagRow}>
          <SpaceTag name={task.space.name} color={task.space.color} />
        </View>
      ) : null}

      <TextField
        label="Title"
        value={title}
        onChangeText={setTitle}
        onEndEditing={() => title.trim() && title !== task.title && patch({ id: task.id, title })}
        placeholder="Task title"
      />
      <TextField
        label="Notes"
        value={description}
        onChangeText={setDescription}
        onEndEditing={() =>
          description !== (task.description ?? '') && patch({ id: task.id, description })
        }
        placeholder="Optional details"
        multiline
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <OptionChips
        label="Status"
        options={STATUSES.map((s) => ({ value: s.key, label: s.label }))}
        value={task.status as TaskStatus}
        onChange={(status) => patch({ id: task.id, status })}
      />
      <AssigneePicker
        spaceId={task.space_id}
        value={task.assignee_id}
        onChange={(assignee_id) => patch({ id: task.id, assignee_id })}
      />
      <OptionChips
        label="Priority"
        options={PRIORITY_OPTIONS}
        value={(task.priority as Priority) ?? 'none'}
        onChange={(p) => patch({ id: task.id, priority: p === 'none' ? null : p })}
      />
      <DueDatePicker
        value={task.due_date}
        onChange={(due_date) => patch({ id: task.id, due_date })}
      />
    </ModalScaffold>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  tagRow: { flexDirection: 'row' },
});
