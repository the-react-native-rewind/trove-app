import { ScrollView, StyleSheet, View } from 'react-native';

import { groupByStatus, type KanbanProps, STATUSES } from '@/lib/board';
import type { TaskStatus } from '@/lib/types';
import { colors, radii, spacing } from '@/theme/tokens';
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
              {column.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  showSpaceTag={showSpaceTag}
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
  board: { padding: spacing.lg, gap: spacing.md },
  column: {
    width: 280,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.sm,
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
