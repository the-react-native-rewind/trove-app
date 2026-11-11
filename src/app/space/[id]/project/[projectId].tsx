import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TaskRow } from '@/components/TaskRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { AccentDot } from '@/components/ui/Indicators';
import { StackScreen } from '@/components/ui/StackScreen';
import { Text } from '@/components/ui/Text';
import { useTaskMediaForTasks } from '@/data/attachments';
import { useProject } from '@/data/projects';
import { useSpaces } from '@/data/spaces';
import { useMoveTaskStatus, useTasks } from '@/data/tasks';
import { sortTasksByUrgency } from '@/lib/board';
import { hapticLight } from '@/lib/haptics';
import { canWrite } from '@/lib/types';
import { colors, shadows, spacing } from '@/theme/tokens';

export default function ProjectActions() {
  const { id: spaceId, projectId } = useLocalSearchParams<{ id: string; projectId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: spaces = [] } = useSpaces();
  const { data: project, isLoading: projectLoading } = useProject(projectId ?? '');
  const { data: tasks = [], isLoading, isError } = useTasks(spaceId ?? '');
  const moveStatus = useMoveTaskStatus();
  const role = spaces.find((space) => space.id === spaceId)?.role;
  const writable = canWrite(role);
  // One list: open actions by urgency, then done ones at the bottom (most
  // recently finished first), faded out in the row below.
  const actions = useMemo(() => {
    const inProject = tasks.filter((task) => task.project_id === projectId);
    const open = sortTasksByUrgency(inProject.filter((task) => task.status !== 'done'));
    const done = inProject
      .filter((task) => task.status === 'done')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return [...open, ...done];
  }, [tasks, projectId]);
  const media = useTaskMediaForTasks(actions.map((task) => task.id));

  function addAction() {
    hapticLight();
    const params = new URLSearchParams({ spaceId: spaceId ?? '', projectId: projectId ?? '' });
    router.push(`/task-new?${params.toString()}` as never);
  }

  return (
    <View style={styles.fill}>
      <StackScreen title={project?.name ?? 'Project'}>
        {project?.description ? (
          <View style={styles.intro}>
            {project ? <AccentDot color={project.color} size={10} /> : null}
            <Text variant="body" color={colors.inkSoft} style={styles.introCopy}>
              {project.description}
            </Text>
          </View>
        ) : null}
        {isLoading || projectLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : isError || !project ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Could not load this project"
            body="It may have been archived, or you may not be able to see it."
          />
        ) : actions.length === 0 ? (
          <EmptyState
            icon="leaf-outline"
            title="No actions yet"
            body="Actions in this project show up here, in one list. Tap the plus to add one."
          />
        ) : (
          <View style={styles.list}>
            {actions.map((task) => (
              <View key={task.id} style={task.status === 'done' ? styles.doneRow : undefined}>
                <TaskRow
                  task={task}
                  canWrite={writable}
                  onOpen={() => router.push(`/task/${task.id}` as never)}
                  onMove={(next) => moveStatus.mutate({ id: task.id, status: next })}
                  media={media.data?.[task.id]}
                />
              </View>
            ))}
          </View>
        )}
      </StackScreen>
      {writable && project ? (
        <Pressable
          onPress={addAction}
          accessibilityRole="button"
          accessibilityLabel="Add action"
          style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        >
          <Ionicons name="add" size={30} color={colors.onBrand} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  intro: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  introCopy: { flex: 1 },
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  list: { gap: spacing.sm },
  doneRow: { opacity: 0.55 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    ...shadows.floating,
  },
});
