import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSpaces } from '@/data/spaces';
import { useMoveTaskStatus } from '@/data/tasks';
import { useWeekTasks } from '@/data/weekPlans';
import { useIsWide } from '@/hooks/useIsWide';
import { sortTasksByUrgency } from '@/lib/board';
import { canWrite } from '@/lib/types';
import { formatWeekRange, getCurrentWeekStart, shiftWeek } from '@/lib/week';
import { colors, radii, spacing } from '@/theme/tokens';
import { TaskRow } from './TaskRow';
import { EmptyState } from './ui/EmptyState';
import { Text } from './ui/Text';

export function MyWeekView() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart);
  const currentWeek = getCurrentWeekStart();
  const { data: spaces = [] } = useSpaces();
  const { data: tasks = [], isLoading, isError, refetch, isRefetching } = useWeekTasks(weekStart);
  const moveStatus = useMoveTaskStatus();

  const sortedTasks = useMemo(() => sortTasksByUrgency(tasks), [tasks]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.header, isWide && styles.headerWide]}>
        {!isWide ? (
          <Pressable
            onPress={() => (navigation as unknown as { openDrawer: () => void }).openDrawer()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open spaces"
            style={styles.iconButton}
          >
            <Ionicons name="menu" size={26} color={colors.ink} />
          </Pressable>
        ) : null}
        <Text variant="screenTitle" style={styles.title}>
          My Week
        </Text>
        {weekStart !== currentWeek ? (
          <Pressable
            onPress={() => setWeekStart(currentWeek)}
            accessibilityRole="button"
            accessibilityLabel="Go to current week"
            style={styles.currentButton}
          >
            <Text variant="meta" color={colors.brandDeep}>
              This week
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.weekNavigation}>
        <Pressable
          onPress={() => setWeekStart((week) => shiftWeek(week, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          style={styles.weekButton}
        >
          <Ionicons name="chevron-back" size={20} color={colors.brandDeep} />
        </Pressable>
        <Text variant="sectionHeading" center style={styles.weekLabel}>
          {formatWeekRange(weekStart)}
        </Text>
        <Pressable
          onPress={() => setWeekStart((week) => shiftWeek(week, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next week"
          style={styles.weekButton}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.brandDeep} />
        </Pressable>
      </View>

      <View style={styles.listFrame}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <FlatList
            data={sortedTasks}
            keyExtractor={(task) => task.id}
            renderItem={({ item }) => (
              <TaskRow
                task={item}
                showSpaceTag
                canWrite={canWrite(spaces.find((space) => space.id === item.space_id)?.role)}
                onOpen={() => router.push(`/task/${item.id}` as never)}
                onMove={(status) => moveStatus.mutate({ id: item.id, status })}
              />
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <EmptyState
                icon="calendar-outline"
                title={isError ? 'Couldn’t load your week' : 'Nothing planned for this week'}
                body={
                  isError
                    ? 'Pull to refresh and try again.'
                    : 'Open any task and choose “Add to My Week” to make a private plan.'
                }
              />
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={colors.brand}
              />
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerWide: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  title: { flex: 1 },
  iconButton: { padding: spacing.xs },
  currentButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
  },
  weekNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 760,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  weekButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
  },
  weekLabel: { flex: 1 },
  listFrame: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
