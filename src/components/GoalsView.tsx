import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGoals } from '@/data/goals';
import { useIsWide } from '@/hooks/useIsWide';
import { goalProgress, goalResultLabel, isGoalAchieved, type Goal } from '@/lib/goals';
import { hapticLight } from '@/lib/haptics';
import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { EmptyState } from './ui/EmptyState';
import { AccentDot } from './ui/Indicators';
import { Text } from './ui/Text';

/**
 * Goals: the short list of results being worked towards. Deliberately plain —
 * a goal earns its place by being checkable, not by being decorated.
 */
export function GoalsView() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const { data: goals = [], isLoading, isError } = useGoals();

  const open = goals.filter((goal) => !isGoalAchieved(goal));

  function openDrawer() {
    (navigation as unknown as { openDrawer: () => void }).openDrawer();
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        {!isWide ? (
          <Pressable
            onPress={openDrawer}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open circles"
            style={styles.menuButton}
          >
            <Ionicons name="menu" size={26} color={colors.ink} />
          </Pressable>
        ) : null}
        <View style={styles.headerText}>
          <Text variant="screenTitle">Goals</Text>
          <Text variant="meta" color={colors.inkFaint}>
            {goals.length === 0
              ? 'What you are working towards'
              : `${open.length} in play of ${goals.length}`}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load your goals"
          body="Check your connection and try again."
        />
      ) : goals.length === 0 ? (
        <EmptyState
          icon="flag-outline"
          title="No goals yet"
          body="A goal is a result you could prove you reached. Tap the plus to set one."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onPress={() => {
                hapticLight();
                router.push(`/goal/${goal.id}` as never);
              }}
            />
          ))}
        </ScrollView>
      )}

      <Pressable
        onPress={() => {
          hapticLight();
          router.push('/goal-new' as never);
        }}
        accessibilityRole="button"
        accessibilityLabel="Set a goal"
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
      >
        <Ionicons name="add" size={30} color={colors.onBrand} />
      </Pressable>
    </View>
  );
}

function GoalCard({ goal, onPress }: { goal: Goal; onPress: () => void }) {
  const reached = isGoalAchieved(goal);
  const progress = goalProgress(goal);
  const counted = goal.resultKind === 'number';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={goal.title}
      style={[styles.card, reached && styles.cardReached]}
    >
      <View style={styles.cardHead}>
        <Text
          variant="bodyMedium"
          color={reached ? colors.inkSoft : colors.ink}
          style={[styles.cardTitle, reached && styles.struck]}
          numberOfLines={2}
        >
          {goal.title}
        </Text>
        {reached ? (
          <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
        ) : null}
      </View>

      <Text variant="meta" color={colors.inkSoft} numberOfLines={2}>
        {goalResultLabel(goal)}
      </Text>

      {counted && !reached ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}

      {goal.projects.length > 0 ? (
        <View style={styles.projects}>
          {goal.projects.slice(0, 3).map((project) => (
            <View key={project.id} style={styles.projectChip}>
              <AccentDot color={project.color} size={8} />
              <Text variant="meta" color={colors.inkFaint} numberOfLines={1}>
                {project.name}
              </Text>
            </View>
          ))}
          {goal.projects.length > 3 ? (
            <Text variant="meta" color={colors.inkFaint}>
              +{goal.projects.length - 3}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  menuButton: { padding: spacing.xs },
  headerText: { flex: 1, gap: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  cardReached: { backgroundColor: colors.surfaceAlt },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1 },
  struck: { textDecorationLine: 'line-through' },
  track: { height: 6, borderRadius: 6, backgroundColor: colors.hairline, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 6, backgroundColor: colors.brand },
  projects: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  projectChip: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
    zIndex: 40,
    ...shadows.floating,
  },
});
