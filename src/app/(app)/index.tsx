import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KanbanBoard } from '@/components/KanbanBoard';
import { MyWeekView } from '@/components/MyWeekView';
import { StatusSegmented } from '@/components/StatusSegmented';
import { TaskRow } from '@/components/TaskRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { AccentDot } from '@/components/ui/Indicators';
import { Text } from '@/components/ui/Text';
import { positionBetween, useMoveTaskStatus, useReorderTask, useTasks } from '@/data/tasks';
import { useSpaces } from '@/data/spaces';
import { useIsWide } from '@/hooks/useIsWide';
import { sortTasksByUrgency } from '@/lib/board';
import { canWrite, type TaskStatus, type TaskWithRefs } from '@/lib/types';
import { useSelectedSpace } from '@/providers/SpaceProvider';
import { colors, radii, shadows, spacing } from '@/theme/tokens';

const EMPTY_COPY: Record<TaskStatus, { title: string; body: string }> = {
  backlog: { title: 'Nothing parked here', body: 'Ideas and someday tasks live in the backlog. Add one when it comes to you.' },
  todo: { title: 'All clear', body: 'Nothing to do right now. Tap the plus to add the next thing.' },
  in_progress: { title: 'Nothing in progress', body: 'Swipe a task to Doing when you pick it up.' },
  done: { title: 'Nothing done yet', body: 'Finished tasks land here. A good place to see what got carried.' },
};

export default function Board() {
  const { selectedSpaceId } = useSelectedSpace();
  return selectedSpaceId === 'my-week' ? <MyWeekView /> : <SpaceBoard />;
}

function SpaceBoard() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const { selectedSpaceId } = useSelectedSpace();
  const { data: spaces = [] } = useSpaces();

  const isAll = selectedSpaceId === 'all';
  const currentSpace = spaces.find((s) => s.id === selectedSpaceId);
  const writable = isAll ? true : canWrite(currentSpace?.role);
  const canWriteTask = (spaceId: string) => canWrite(spaces.find((s) => s.id === spaceId)?.role);

  const { data: tasks = [], isLoading, refetch, isRefetching } = useTasks(selectedSpaceId);
  const moveStatus = useMoveTaskStatus();
  const reorder = useReorderTask();

  const [status, setStatus] = useState<TaskStatus>('in_progress');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const [items, setItems] = useState<TaskWithRefs[]>([]);

  const unfilteredTasks =
    isAll && excluded.size ? tasks.filter((t) => !excluded.has(t.space_id)) : tasks;
  const visibleTasks = sortTasksByUrgency(unfilteredTasks);

  const counts: Record<TaskStatus, number> = { backlog: 0, todo: 0, in_progress: 0, done: 0 };
  for (const t of visibleTasks) counts[t.status as TaskStatus]++;

  // On first load, default to "Doing" unless it's empty, then fall back to "To do".
  const pickedInitialStatus = useRef(false);
  useEffect(() => {
    if (pickedInitialStatus.current || isLoading) return;
    pickedInitialStatus.current = true;
    setStatus(counts.in_progress > 0 ? 'in_progress' : 'todo');
  }, [isLoading, counts.in_progress]);

  // Re-sync the visible column whenever any rendered/sorted field changes so
  // edits (title, priority, due date, assignee, …) show up without a refresh.
  const signature =
    visibleTasks
      .map(
        (t) =>
          `${t.id}:${t.status}:${t.position}:${t.title}:${t.priority}:${t.due_date}:${t.assignee_id}:${t.updated_at}`,
      )
      .join('|') + `#${status}`;
  useEffect(() => {
    // visibleTasks is already urgency-sorted; filtering preserves that order.
    setItems(visibleTasks.filter((t) => t.status === status));
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const dragEnabled = !isAll && writable && status !== 'done';

  function openCreate() {
    const params = new URLSearchParams({ status });
    if (!isAll) params.set('spaceId', selectedSpaceId);
    router.push(`/task-new?${params.toString()}` as never);
  }

  function renderItem({ item, drag, isActive }: RenderItemParams<TaskWithRefs>) {
    const rowWritable = isAll ? canWrite(spaces.find((s) => s.id === item.space_id)?.role) : writable;
    return (
      <TaskRow
        task={item}
        showSpaceTag={isAll}
        canWrite={rowWritable}
        dragging={isActive}
        onOpen={() => router.push(`/task/${item.id}` as never)}
        onMove={(next) => moveStatus.mutate({ id: item.id, status: next })}
        onDrag={dragEnabled ? drag : undefined}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, isWide && styles.headerWide]}>
        {!isWide ? (
          <Pressable
            onPress={() => (navigation as unknown as { openDrawer: () => void }).openDrawer()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open spaces"
            style={styles.iconBtn}
          >
            <Ionicons name="menu" size={26} color={colors.ink} />
          </Pressable>
        ) : null}

        <View style={styles.titleWrap}>
          {!isAll && currentSpace ? <AccentDot color={currentSpace.color} size={12} /> : null}
          <Text variant="screenTitle" numberOfLines={1}>
            {isAll ? 'All tasks' : currentSpace?.name ?? 'Space'}
          </Text>
        </View>

        <View style={styles.headerActions}>
          {isAll ? (
            <Pressable
              onPress={() => setShowFilter((v) => !v)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Filter spaces"
              style={styles.iconBtn}
            >
              <Ionicons
                name={excluded.size ? 'funnel' : 'funnel-outline'}
                size={20}
                color={colors.ink}
              />
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={() => router.push(`/space/${selectedSpaceId}/members` as never)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Members"
                style={styles.iconBtn}
              >
                <Ionicons name="people-outline" size={22} color={colors.ink} />
              </Pressable>
              <Pressable
                onPress={() => router.push(`/space/${selectedSpaceId}/settings` as never)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Space settings"
                style={styles.iconBtn}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {!isWide ? <StatusSegmented value={status} counts={counts} onChange={setStatus} /> : null}

      {isAll && showFilter ? (
        <View style={styles.filterRow}>
          {spaces.map((s) => {
            const on = !excluded.has(s.id);
            return (
              <Pressable
                key={s.id}
                onPress={() =>
                  setExcluded((prev) => {
                    const nextSet = new Set(prev);
                    if (nextSet.has(s.id)) nextSet.delete(s.id);
                    else nextSet.add(s.id);
                    return nextSet;
                  })
                }
                style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
              >
                <AccentDot color={s.color} size={8} />
                <Text variant="meta" color={on ? colors.brandDeep : colors.inkFaint}>
                  {s.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {isWide ? (
        <KanbanBoard
          tasks={visibleTasks}
          showSpaceTag={isAll}
          onOpen={(id) => router.push(`/task/${id}` as never)}
          onMove={(id, next, position) => moveStatus.mutate({ id, status: next, position })}
          canWriteTask={canWriteTask}
        />
      ) : (
        <DraggableFlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onDragEnd={({ data, to }) => {
            const moved = data[to];
            if (!moved) return;
            const prev = data[to - 1]?.position ?? null;
            const next = data[to + 1]?.position ?? null;
            const position = positionBetween(prev, next);
            setItems(
              sortTasksByUrgency(
                data.map((task) => (task.id === moved.id ? { ...task, position } : task)),
              ),
            );
            reorder.mutate({ id: moved.id, position });
          }}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={isLoading ? null : <EmptyState {...EMPTY_COPY[status]} />}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand} />
          }
          containerStyle={styles.listFlex}
        />
      )}

      {writable ? (
        <Pressable
          onPress={openCreate}
          accessibilityRole="button"
          accessibilityLabel="Add task"
          style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
        >
          <Ionicons name="add" size={30} color={colors.onBrand} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  // Match the Kanban board's horizontal padding so the title and actions
  // line up with the first and last columns.
  headerWide: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  iconBtn: { padding: spacing.xs },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  chipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoft },
  chipOff: { backgroundColor: colors.surfaceAlt, borderColor: colors.hairline },
  listFlex: { flex: 1 },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 120, flexGrow: 1 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.floating,
  },
});
