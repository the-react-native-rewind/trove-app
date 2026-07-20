import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AssigneePicker, DueDatePicker, OptionChips } from '@/components/form';
import { TaskMedia } from '@/components/TaskMedia';
import { Button } from '@/components/ui/Button';
import { SpaceTag } from '@/components/ui/Indicators';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useSpaces } from '@/data/spaces';
import { useDeleteTask, useTask, useUpdateTask } from '@/data/tasks';
import { confirmDialog, alertDialog } from '@/lib/dialog';
import { canWrite, STATUSES, type Priority, type TaskStatus } from '@/lib/types';
import { colors, priority as priorityTokens, spacing } from '@/theme/tokens';

/** Debounce for title/notes autosave — long enough to avoid a write per keystroke. */
const AUTOSAVE_MS = 600;

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

  // Refs let the debounced autosave and the on-exit flush read the freshest
  // values without recreating timers or capturing stale closures.
  const inputRef = useRef({ title: '', description: '' });
  const savedRef = useRef({ title: '', description: null as string | null });
  const taskIdRef = useRef<string | undefined>(undefined);
  inputRef.current = { title, description };
  taskIdRef.current = task?.id;

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
      savedRef.current = { title: task.title, description: task.description ?? null };
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track the latest server value so autosave only fires on genuine changes.
  useEffect(() => {
    if (task) savedRef.current = { title: task.title, description: task.description ?? null };
  }, [task?.title, task?.description]);

  // Persist title/notes if (and only if) they differ from what's on the server.
  // Reads from refs so it's safe to call from a debounce timer or on unmount.
  function flush() {
    const tid = taskIdRef.current;
    if (!tid) return;
    const nextTitle = inputRef.current.title.trim();
    if (nextTitle && nextTitle !== savedRef.current.title) {
      savedRef.current.title = nextTitle;
      updateTask.mutate({ id: tid, title: nextTitle });
    }
    const nextDescription = inputRef.current.description.trim() || null;
    if (nextDescription !== savedRef.current.description) {
      savedRef.current.description = nextDescription;
      updateTask.mutate({ id: tid, description: inputRef.current.description });
    }
  }

  // Autosave shortly after the user stops typing.
  useEffect(() => {
    if (!task) return;
    const handle = setTimeout(flush, AUTOSAVE_MS);
    return () => clearTimeout(handle);
  }, [title, description]); // eslint-disable-line react-hooks/exhaustive-deps

  // Catch the last edit when leaving the screen (e.g. swipe-to-dismiss the modal).
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function confirmDelete() {
    if (!task) return;
    const taskId = task.id;
    const ok = await confirmDialog({
      title: 'Delete task',
      message: 'This removes the task for everyone in the space.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteTask.mutateAsync(taskId);
      // Close the edit + view modals back to the board in one step.
      router.dismissAll();
    } catch {
      alertDialog('Could not delete', 'Something went wrong. Please try again.');
    }
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

  const saveState = updateTask.isPending
    ? 'saving'
    : updateTask.isError
      ? 'error'
      : updateTask.isSuccess
        ? 'saved'
        : 'idle';

  return (
    <ModalScaffold
      title="Edit task"
      footer={<Button label="Delete task" variant="danger" onPress={confirmDelete} />}
    >
      <View style={styles.headerRow}>
        {task.space ? <SpaceTag name={task.space.name} color={task.space.color} /> : <View />}
        {saveState !== 'idle' ? (
          <View style={styles.saveStatus}>
            {saveState === 'saving' ? (
              <ActivityIndicator size="small" color={colors.inkFaint} />
            ) : null}
            <Text
              variant="meta"
              color={saveState === 'error' ? colors.priorityHigh : colors.inkFaint}
            >
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'error'
                  ? "Couldn't save"
                  : 'Saved'}
            </Text>
          </View>
        ) : null}
      </View>

      <TextField
        label="Title"
        value={title}
        onChangeText={setTitle}
        onEndEditing={flush}
        placeholder="Task title"
      />
      <TextField
        label="Notes"
        value={description}
        onChangeText={setDescription}
        onEndEditing={flush}
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
      <TaskMedia taskId={task.id} spaceId={task.space_id} canWrite />
    </ModalScaffold>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 22,
  },
  saveStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
