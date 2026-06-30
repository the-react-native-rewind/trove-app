import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { TaskStatus, TaskWithRefs } from '@/lib/types';
import { colors, radii, spacing } from '@/theme/tokens';
import { TaskCard } from './TaskCard';
import { Text } from './ui/Text';

const NEXT_ACTIONS: Record<TaskStatus, { label: string; status: TaskStatus; done?: boolean }[]> = {
  backlog: [{ label: 'To do', status: 'todo' }, { label: 'Done', status: 'done', done: true }],
  todo: [{ label: 'Doing', status: 'in_progress' }, { label: 'Done', status: 'done', done: true }],
  in_progress: [{ label: 'To do', status: 'todo' }, { label: 'Done', status: 'done', done: true }],
  done: [{ label: 'Reopen', status: 'todo' }],
};

export function TaskRow({
  task,
  showSpaceTag,
  canWrite,
  onOpen,
  onMove,
  onDrag,
  dragging,
}: {
  task: TaskWithRefs;
  showSpaceTag?: boolean;
  canWrite: boolean;
  onOpen: () => void;
  onMove: (status: TaskStatus) => void;
  onDrag?: () => void;
  dragging?: boolean;
}) {
  const ref = useRef<SwipeableMethods>(null);
  const actions = NEXT_ACTIONS[task.status as TaskStatus];

  function renderRightActions() {
    return (
      <View style={styles.actions}>
        {actions.map((a) => (
          <Pressable
            key={a.status + a.label}
            onPress={() => {
              ref.current?.close();
              onMove(a.status);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Move to ${a.label}`}
            style={[styles.action, a.done ? styles.actionDone : styles.actionNeutral]}
          >
            <Text variant="meta" color={a.done ? colors.onBrand : colors.brandDeep}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ReanimatedSwipeable
        ref={ref}
        enabled={canWrite}
        friction={1.6}
        rightThreshold={36}
        overshootRight={false}
        renderRightActions={canWrite ? renderRightActions : undefined}
      >
        <TaskCard
          task={task}
          showSpaceTag={showSpaceTag}
          onPress={onOpen}
          onLongPress={onDrag}
          dragging={dragging}
        />
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.sm },
  action: {
    height: '100%',
    minWidth: 64,
    paddingHorizontal: spacing.md,
    borderRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionNeutral: { backgroundColor: colors.brandSoft },
  actionDone: { backgroundColor: colors.brand },
});
