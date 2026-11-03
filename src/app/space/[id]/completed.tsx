import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { TaskRow } from '@/components/TaskRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { StackScreen } from '@/components/ui/StackScreen';
import { useTaskMediaForTasks } from '@/data/attachments';
import { useSpaces } from '@/data/spaces';
import { useMoveTaskStatus, useTasks } from '@/data/tasks';
import { sortTasksByUrgency } from '@/lib/board';
import { canWrite } from '@/lib/types';
import { colors, spacing } from '@/theme/tokens';

export default function CompletedActions() {
  const { id: spaceId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: spaces = [] } = useSpaces();
  const { data: tasks = [], isLoading, isError } = useTasks(spaceId ?? '');
  const moveStatus = useMoveTaskStatus();
  const role = spaces.find((space) => space.id === spaceId)?.role;
  const writable = canWrite(role);
  const done = sortTasksByUrgency(tasks.filter((task) => task.status === 'done'));
  const media = useTaskMediaForTasks(done.map((task) => task.id));

  return (
    <StackScreen title="Completed actions">
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load actions"
          body="Go back and try again."
        />
      ) : done.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="Nothing completed yet"
          body="Finished actions from this circle land here. Swipe one to reopen it."
        />
      ) : (
        <View style={styles.list}>
          {done.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              canWrite={writable}
              onOpen={() => router.push(`/task/${task.id}` as never)}
              onMove={(next) => moveStatus.mutate({ id: task.id, status: next })}
              media={media.data?.[task.id]}
            />
          ))}
        </View>
      )}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  list: { gap: spacing.sm },
});
