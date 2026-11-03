import { Ionicons } from '@expo/vector-icons';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { Project } from '@/lib/types';
import { colors, radii, spacing } from '@/theme/tokens';
import { EmptyState } from './ui/EmptyState';
import { AccentDot } from './ui/Indicators';
import { Text } from './ui/Text';

export const PROJECTS_EMPTY = {
  title: 'No projects yet',
  body: 'Projects help you organise collections of actions in Trove, and invite people who may only belong to certain efforts in a circle.',
};

export function ProjectsPane({
  projects,
  isLoading,
  isError,
  refreshing,
  onRefresh,
  onOpen,
  contentContainerStyle,
  onScroll,
}: {
  projects: Project[];
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
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onOpen(item)}
          accessibilityRole="button"
          accessibilityLabel={item.name}
          style={styles.card}
        >
          <AccentDot color={item.color} size={12} />
          <View style={styles.copy}>
            <Text variant="bodyMedium" numberOfLines={1}>
              {item.name}
            </Text>
            {item.description ? (
              <Text variant="meta" color={colors.inkFaint} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  copy: { flex: 1, gap: 2 },
});
