import { Ionicons } from '@expo/vector-icons';
import { type ReactElement } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import DraggableFlatList, {
  type DragEndParams,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';

import { hapticLight } from '@/lib/haptics';
import { rankAfterDrop } from '@/lib/rank';
import type { TaskWithRefs } from '@/lib/types';
import { colors, shadows, spacing } from '@/theme/tokens';
import { Text } from './ui/Text';

const ROW_HEIGHT = 44;

/**
 * Compact reorder list. The same tasks, in the same order, as the normal
 * list — title and a drag handle only. A drop writes one fractional rank.
 */
export function TaskReorderList({
  tasks,
  canDragTask,
  onCommitRank,
  onScrollOffsetChange,
  contentContainerStyle,
  ListEmptyComponent,
  refreshControl,
}: {
  tasks: TaskWithRefs[];
  canDragTask: (task: TaskWithRefs) => boolean;
  onCommitRank: (id: string, rank: string) => void;
  onScrollOffsetChange?: (offset: number) => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  ListEmptyComponent?: ReactElement | null;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  function renderItem({ item, drag, isActive }: RenderItemParams<TaskWithRefs>) {
    const canDrag = canDragTask(item);
    return (
      <ReorderRow
        title={item.title}
        canDrag={canDrag}
        isActive={isActive}
        onDrag={drag}
      />
    );
  }

  function onDragEnd({ data, from, to }: DragEndParams<TaskWithRefs>) {
    if (from === to) return;
    const dropped = data[to];
    if (!dropped || !canDragTask(dropped)) return;
    const nextRank = rankAfterDrop(data[to - 1]?.rank, data[to + 1]?.rank);
    if (nextRank === dropped.rank) return;
    onCommitRank(dropped.id, nextRank);
  }

  return (
    <DraggableFlatList
      data={tasks}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      activationDistance={8}
      autoscrollThreshold={140}
      autoscrollSpeed={160}
      dragItemOverflow
      onDragBegin={() => hapticLight()}
      onRelease={() => hapticLight()}
      onDragEnd={onDragEnd}
      onScrollOffsetChange={onScrollOffsetChange}
      contentContainerStyle={contentContainerStyle}
      ListEmptyComponent={ListEmptyComponent}
      refreshControl={refreshControl}
      containerStyle={styles.list}
    />
  );
}

function ReorderRow({
  title,
  canDrag,
  isActive,
  onDrag,
}: {
  title: string;
  canDrag: boolean;
  isActive: boolean;
  onDrag: () => void;
}) {
  function startDrag() {
    if (!canDrag || isActive) return;
    onDrag();
  }

  return (
    <View style={[styles.row, isActive && styles.rowActive]}>
      <Pressable
        onPressIn={startDrag}
        disabled={!canDrag || isActive}
        accessibilityRole="button"
        accessibilityLabel={`Drag to reorder ${title}`}
        hitSlop={4}
        style={styles.handle}
      >
        <Ionicons
          name="reorder-three"
          size={22}
          color={canDrag ? colors.ink : colors.inkFaint}
        />
      </Pressable>
      <Pressable
        onLongPress={startDrag}
        delayLongPress={160}
        disabled={!canDrag || isActive}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={styles.titleHit}
      >
        <Text variant="cardTitle" numberOfLines={1}>
          {title}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowActive: {
    backgroundColor: colors.surface,
    ...shadows.floating,
  },
  handle: {
    width: ROW_HEIGHT,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleHit: {
    flex: 1,
    height: ROW_HEIGHT,
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
});
