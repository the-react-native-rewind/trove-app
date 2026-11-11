import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { TaskRow } from '@/components/TaskRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { StackScreen } from '@/components/ui/StackScreen';
import { useTaskMediaForTasks } from '@/data/attachments';
import { useSpaces } from '@/data/spaces';
import { useMoveTaskStatus, useTasks } from '@/data/tasks';
import { MINE_VIEW_ID } from '@/lib/mine';
import { canWrite } from '@/lib/types';
import { colors, spacing } from '@/theme/tokens';

export default function MineCompleted() {
  const router = useRouter();
  const { data: spaces = [] } = useSpaces();
  const { data: tasks = [], isLoading, isError } = useTasks(MINE_VIEW_ID);
  const moveStatus = useMoveTaskStatus();

  // Most recently completed first (updated_at is the completion for a done task).
  const done = tasks
    .filter((task) => task.status === 'done')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
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
          body="Actions you finish, in any circle, collect here. Swipe one to reopen it."
        />
      ) : (
        <View style={styles.list}>
          {done.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              showSpaceTag
              canWrite={canWrite(spaces.find((space) => space.id === task.space_id)?.role)}
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
