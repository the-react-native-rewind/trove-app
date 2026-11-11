import { Ionicons } from '@expo/vector-icons';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { Project, TaskAssignee } from '@/lib/types';
import { colors, radii, spacing } from '@/theme/tokens';
import { AvatarStack } from './ui/Avatar';
import { EmptyState } from './ui/EmptyState';
import { AccentDot } from './ui/Indicators';
import { Text } from './ui/Text';

export const PROJECTS_EMPTY = {
  title: 'No projects yet',
  body: 'Projects help you organise collections of actions in Trove, and invite people who may only belong to certain efforts in a circle.',
};

export type ProjectStat = { done: number; total: number; assignees: TaskAssignee[] };

export function ProjectsPane({
  projects,
  stats,
  isLoading,
  isError,
  refreshing,
  onRefresh,
  onOpen,
  contentContainerStyle,
  onScroll,
}: {
  projects: Project[];
  stats?: Record<string, ProjectStat>;
  isLoading: boolean;
  isError: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (project: Project) => void;
  contentContainerStyle?: object;
  onScroll?: Animated.FlatList<Project>['props']['onScroll'];
}) {
  const empty = isLoading ? null : isError ? (
    <EmptyState
      icon="cloud-offline-outline"
      title="Could not load projects"
      body="Pull to refresh and try again."
    />
  ) : (
    <EmptyState icon="layers-outline" {...PROJECTS_EMPTY} />
  );

  return (
    <Animated.FlatList
      data={projects}
      keyExtractor={(item) => item.id}
      onScroll={onScroll}
      scrollEventThrottle={16}
      style={styles.list}
      contentContainerStyle={contentContainerStyle}
      ListEmptyComponent={empty}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
      }
      renderItem={({ item }) => {
        const stat = stats?.[item.id];
        const total = stat?.total ?? 0;
        const done = stat?.done ?? 0;
        const fraction = total > 0 ? done / total : 0;
        return (
          <Pressable
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            style={styles.card}
          >
            <View style={styles.header}>
              <AccentDot color={item.color} size={12} />
              <Text variant="bodyMedium" numberOfLines={1} style={styles.name}>
                {item.name}
              </Text>
              {stat && stat.assignees.length > 0 ? (
                <AvatarStack people={stat.assignees} size={24} ringColor={colors.surface} />
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>

            {item.description ? (
              <Text variant="meta" color={colors.inkFaint} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}

            {total > 0 ? (
              <View style={styles.progressRow}>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]} />
                </View>
                <Text variant="meta" color={colors.inkSoft}>
                  {done} of {total} done
                </Text>
              </View>
            ) : (
              <Text variant="meta" color={colors.inkFaint}>
                No actions yet
              </Text>
            )}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  card: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 6,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 6, backgroundColor: colors.brand },
});
