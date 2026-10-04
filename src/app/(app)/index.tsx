import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CollapsingScreenHeader, useCollapsingHeader } from '@/components/CollapsingHeader';
import { KanbanBoard } from '@/components/KanbanBoard';
import { MyWeekView } from '@/components/MyWeekView';
import { SelectionActionBar, SelectionHeader } from '@/components/SelectionChrome';
import { StatusSegmented } from '@/components/StatusSegmented';
import { TaskRow } from '@/components/TaskRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { AccentDot } from '@/components/ui/Indicators';
import { Text } from '@/components/ui/Text';
import { useTaskMediaForTasks } from '@/data/attachments';
import { useMyWeekEnabled } from '@/data/profile';
import { useMoveTaskStatus, useTasks, useUpdateTaskRank } from '@/data/tasks';
import { useSpaces } from '@/data/spaces';
import { useIsWide } from '@/hooks/useIsWide';
import { normalizeStatus, sortTasksByUrgency } from '@/lib/board';
import { hapticLight } from '@/lib/haptics';
import { rankAfterDrop } from '@/lib/rank';
import { MINE_VIEW_ID } from '@/lib/mine';
import { canWrite, type TaskStatus, type TaskWithRefs } from '@/lib/types';
import { MY_WEEK_VIEW_ID } from '@/lib/week';
import { useSelectedSpace } from '@/providers/SpaceProvider';
import { SelectionProvider, useSelection } from '@/providers/SelectionProvider';
import { colors, heatColor, radii, shadows, spacing } from '@/theme/tokens';

const EMPTY_COPY: Record<TaskStatus, { title: string; body: string }> = {
  todo: { title: 'All clear', body: 'Nothing to do right now. Tap the plus to add the next thing.' },
  in_progress: { title: 'Nothing in progress', body: 'Swipe a task to Doing when you pick it up.' },
  done: { title: 'Nothing done yet', body: 'Finished tasks land here. A good place to see what got carried.' },
};

export default function Board() {
  const { selectedSpaceId, setSelectedSpaceId } = useSelectedSpace();
  const myWeekEnabled = useMyWeekEnabled();

  useEffect(() => {
    if (!myWeekEnabled && selectedSpaceId === MY_WEEK_VIEW_ID) {
      setSelectedSpaceId(MINE_VIEW_ID);
    }
  }, [myWeekEnabled, selectedSpaceId, setSelectedSpaceId]);

  const viewId =
    !myWeekEnabled && selectedSpaceId === MY_WEEK_VIEW_ID ? MINE_VIEW_ID : selectedSpaceId;

  return (
    <SelectionProvider key={viewId}>
      {viewId === MY_WEEK_VIEW_ID ? <MyWeekView /> : <SpaceBoard />}
    </SelectionProvider>
  );
}

const MINE_EMPTY: Record<TaskStatus, { title: string; body: string }> = {
  todo: {
    title: 'Nothing assigned to you',
    body: 'Tasks handed to you, in any circle, show up here.',
  },
  in_progress: {
    title: 'Nothing in progress',
    body: 'When you pick up something that is yours, it lands here.',
  },
  done: {
    title: 'Nothing finished yet',
    body: 'Completed tasks that were yours collect here.',
  },
};

function SpaceBoard() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const { selectedSpaceId } = useSelectedSpace();
  const { data: spaces = [] } = useSpaces();

  const isMine = selectedSpaceId === MINE_VIEW_ID;
  const currentSpace = spaces.find((s) => s.id === selectedSpaceId);
  const writable = isMine ? true : canWrite(currentSpace?.role);
  const canWriteTask = (spaceId: string) => canWrite(spaces.find((s) => s.id === spaceId)?.role);

  const { data: tasks = [], isLoading, isError, refetch, isRefetching } = useTasks(selectedSpaceId);
  const collapse = useCollapsingHeader(insets.top);
  const moveStatus = useMoveTaskStatus();
  const updateRank = useUpdateTaskRank();
  const selection = useSelection();
  const dragMoved = useRef(false);
  const [showDrag, setShowDrag] = useState(false);

  const [status, setStatus] = useState<TaskStatus>('in_progress');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);

  const visibleTasks = useMemo(() => {
    const unfiltered =
      isMine && excluded.size ? tasks.filter((t) => !excluded.has(t.space_id)) : tasks;
    return sortTasksByUrgency(unfiltered);
  }, [tasks, isMine, excluded]);
  const mediaTaskIds = useMemo(() => visibleTasks.map((task) => task.id), [visibleTasks]);
  const { data: mediaByTask } = useTaskMediaForTasks(mediaTaskIds);

  const counts: Record<TaskStatus, number> = { todo: 0, in_progress: 0, done: 0 };
  for (const t of visibleTasks) counts[normalizeStatus(t.status)]++;

  // On first load, default to "Doing" unless it's empty, then fall back to "To do".
  const pickedInitialStatus = useRef(false);
  useEffect(() => {
    if (pickedInitialStatus.current || isLoading) return;
    pickedInitialStatus.current = true;
    setStatus(counts.in_progress > 0 ? 'in_progress' : 'todo');
  }, [isLoading, counts.in_progress]);

  const items = visibleTasks.filter((t) => normalizeStatus(t.status) === status);
  const selectableIds = (isWide ? visibleTasks : items)
    .filter((task) => canWriteTask(task.space_id))
    .map((task) => task.id);

  function openCreate() {
    hapticLight();
    const params = new URLSearchParams({ status });
    if (!isMine) params.set('spaceId', selectedSpaceId);
    router.push(`/task-new?${params.toString()}` as never);
  }

  function renderItem({ item, getIndex, drag, isActive }: RenderItemParams<TaskWithRefs>) {
    const rowWritable = isMine ? canWrite(spaces.find((s) => s.id === item.space_id)?.role) : writable;
    const rank = getIndex() ?? 0;
    return (
      <TaskRow
        task={item}
        heat={heatColor(rank, items.length)}
        canWrite={rowWritable}
        dragging={isActive && showDrag}
        showSpaceTag={isMine}
        onOpen={() => router.push(`/task/${item.id}` as never)}
        onMove={(next) => moveStatus.mutate({ id: item.id, status: next })}
        onReorder={
          rowWritable && !selection.active
            ? () => {
                dragMoved.current = false;
                setShowDrag(false);
                drag();
              }
            : undefined
        }
        media={mediaByTask?.[item.id]}
      />
    );
  }

  const headerBody = (
    <>
      <View style={[styles.header, isWide && styles.headerWide]}>
        {!isWide ? (
          <Pressable
            onPress={() => (navigation as unknown as { openDrawer: () => void }).openDrawer()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open circles"
            style={styles.iconBtn}
          >
            <Ionicons name="menu" size={26} color={colors.ink} />
          </Pressable>
        ) : null}

        <View style={styles.titleWrap}>
          {!isMine && currentSpace ? <AccentDot color={currentSpace.color} size={12} /> : null}
          <View style={styles.titleText}>
            <Text variant="screenTitle" numberOfLines={1}>
              {isMine ? 'Mine' : currentSpace?.name ?? 'Circle'}
            </Text>
            {isMine ? (
              <Text variant="meta" color={colors.inkFaint} numberOfLines={1}>
                Everything assigned to you
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.headerActions}>
          {isMine ? (
            <Pressable
              onPress={() => {
                hapticLight();
                setShowFilter((v) => !v);
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Filter circles"
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
                accessibilityLabel="Circle settings"
                style={styles.iconBtn}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {!isWide ? <StatusSegmented value={status} counts={counts} onChange={setStatus} /> : null}

      {isMine && showFilter ? (
        <View style={styles.filterRow}>
          {spaces.map((s) => {
            const on = !excluded.has(s.id);
            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  hapticLight();
                  setExcluded((prev) => {
                    const nextSet = new Set(prev);
                    if (nextSet.has(s.id)) nextSet.delete(s.id);
                    else nextSet.add(s.id);
                    return nextSet;
                  });
                }}
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
    </>
  );

  return (
    <View style={[styles.container, (isWide || selection.active) && { paddingTop: insets.top }]}>
      {selection.active ? (
        <SelectionHeader listIds={selectableIds} wide={isWide} />
      ) : isWide ? (
        headerBody
      ) : (
        <CollapsingScreenHeader
          topInset={insets.top}
          onLayout={collapse.onLayout}
          animatedStyle={collapse.animatedStyle}
          pointerEvents={collapse.pointerEvents}
        >
          {headerBody}
        </CollapsingScreenHeader>
      )}

      {isWide ? (
        <KanbanBoard
          tasks={visibleTasks}
          showSpaceTag={isMine}
          onOpen={(id) => router.push(`/task/${id}` as never)}
          onMove={(id, next, position) => moveStatus.mutate({ id, status: next, position })}
          canWriteTask={canWriteTask}
          mediaByTaskId={mediaByTask}
        />
      ) : (
        <DraggableFlatList
          data={items}
          extraData={showDrag}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          activationDistance={12}
          onScrollOffsetChange={collapse.onScrollOffsetChange}
          onPlaceholderIndexChange={() => {
            if (dragMoved.current) return;
            dragMoved.current = true;
            setShowDrag(true);
            hapticLight();
          }}
          onDragEnd={({ data, from, to }) => {
            const moved = dragMoved.current;
            dragMoved.current = false;
            setShowDrag(false);
            const task = data[from];
            if (!moved) {
              if (task && canWriteTask(task.space_id) && !selection.active) selection.enter(task.id);
              return;
            }
            hapticLight();
            const dropped = data[to];
            if (!dropped || from === to) return;
            const nextRank = rankAfterDrop(data[to - 1]?.rank, data[to + 1]?.rank);
            if (nextRank === dropped.rank) return;
            updateRank.mutate({ id: dropped.id, rank: nextRank });
          }}
          contentContainerStyle={[
            styles.listContent,
            !selection.active && { paddingTop: collapse.contentOffset + spacing.sm },
          ]}
          ListEmptyComponent={
            isLoading ? null : isError ? (
              <EmptyState
                icon="cloud-offline-outline"
                title="Could not load tasks"
                body="Pull to refresh and try again."
              />
            ) : (
              <EmptyState {...(isMine ? MINE_EMPTY : EMPTY_COPY)[status]} />
            )
          }
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand} />
          }
          containerStyle={styles.listFlex}
        />
      )}

      <SelectionActionBar tasks={tasks} />

      {writable && !selection.active ? (
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
  titleText: { flex: 1 },
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
