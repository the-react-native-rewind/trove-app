import { ScrollView, StyleSheet, View } from 'react-native';

import { groupByStatus, type KanbanProps, STATUSES } from '@/lib/board';
import type { TaskStatus } from '@/lib/types';
import { colors, heatColor, radii, spacing } from '@/theme/tokens';
import { TaskRow } from './TaskRow';
import { Text } from './ui/Text';

/**
 * Native Kanban: four columns side by side. Cross-column moves use the card's
 * swipe actions (the web build gets true drag-and-drop via KanbanBoard.web).
 */
export function KanbanBoard({ tasks, showSpaceTag, onOpen, onMove, canWriteTask }: KanbanProps) {
  const byStatus = groupByStatus(tasks);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.flex}
      contentContainerStyle={styles.board}
    >
      {STATUSES.map(({ key, label }) => {
        const column = byStatus[key as TaskStatus];
        return (
          <View key={key} style={styles.column}>
            <View style={styles.head}>
              <Text variant="label" color={colors.inkSoft}>
                {label}
              </Text>
              <Text variant="meta" color={colors.inkFaint}>
                {column.length}
              </Text>
            </View>
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              {column.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  showSpaceTag={showSpaceTag}
                  heat={heatColor(index, column.length)}
                  canWrite={canWriteTask(task.space_id)}
                  onOpen={() => onOpen(task.id)}
                  onMove={(status) => onMove(task.id, status)}
                />
              ))}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  board: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.xl },
  column: {
    width: 280,
    borderRadius: radii.lg,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  body: { flex: 1 },
  bodyContent: { gap: spacing.md, paddingBottom: spacing.md },
});
