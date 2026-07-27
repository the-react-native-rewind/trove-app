import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSpaces } from '@/data/spaces';
import { useWeekTasks } from '@/data/weekPlans';
import { useIsWide } from '@/hooks/useIsWide';
import { getCurrentWeekStart } from '@/lib/week';
import { useSelectedSpace } from '@/providers/SpaceProvider';
import { colors, fonts, radii, spacing } from '@/theme/tokens';
import { AccentDot } from './ui/Indicators';
import { Text } from './ui/Text';

type DrawerNav = { closeDrawer: () => void };

/** Collapsed rail and expanded widths (wide screens only). */
const RAIL_WIDTH = 64;
const FULL_WIDTH = 300;

export function SpacesDrawer({ navigation }: { navigation: DrawerNav }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWide = useIsWide();
  const { selectedSpaceId, setSelectedSpaceId } = useSelectedSpace();
  const { data: spaces = [] } = useSpaces();
  const { data: weekTasks = [] } = useWeekTasks(getCurrentWeekStart());

  const [collapsed, setCollapsed] = useState(false);
  const progress = useSharedValue(1); // 0 = rail, 1 = expanded

  useEffect(() => {
    progress.value = withTiming(collapsed ? 0 : 1, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [collapsed, progress]);

  const widthStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [RAIL_WIDTH, FULL_WIDTH]),
  }));

  // Labels fade out in the first half of the collapse so they never overlap the rail.
  const fadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 1], [0, 1], 'clamp'),
  }));

  const toggleStyle = useAnimatedStyle(() => ({
    left: interpolate(progress.value, [0, 1], [(RAIL_WIDTH - 28) / 2, FULL_WIDTH - 40]),
  }));

  const totalOpen = spaces.reduce((sum, s) => sum + s.openCount, 0);
  const weekOpen = weekTasks.filter((task) => task.status !== 'done').length;

  function select(id: string) {
    setSelectedSpaceId(id);
    navigation.closeDrawer();
  }

  const fade: StyleProp<AnimatedStyle<ViewStyle>> = isWide ? fadeStyle : undefined;

  return (
    <Animated.View
      style={[styles.container, isWide ? widthStyle : styles.fullWidth, { paddingTop: insets.top + spacing.sm }]}
    >
      {isWide ? (
        <Animated.View style={[styles.toggle, toggleStyle]}>
          <Pressable
            onPress={() => setCollapsed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={({ pressed }) => [styles.toggleButton, pressed && styles.toggleButtonPressed]}
          >
            <Ionicons
              name={collapsed ? 'chevron-forward' : 'chevron-back'}
              size={17}
              color={colors.inkFaint}
            />
          </Pressable>
        </Animated.View>
      ) : null}

      <View style={[styles.header, isWide && styles.headerWide]}>
        <LogoMark />
        <Animated.View style={fade}>
          <Text style={styles.wordmark} numberOfLines={1}>
            Trove
          </Text>
        </Animated.View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Row
          active={selectedSpaceId === 'all'}
          onPress={() => select('all')}
          leading={<Ionicons name="albums-outline" size={20} color={colors.brandDeep} />}
          label="All tasks"
          count={totalOpen}
          fade={fade}
        />
        <Row
          active={selectedSpaceId === 'my-week'}
          onPress={() => select('my-week')}
          leading={<Ionicons name="calendar-outline" size={20} color={colors.brandDeep} />}
          label="My Week"
          count={weekOpen}
          fade={fade}
        />

        <Animated.View style={fade}>
          <Text variant="label" color={colors.inkFaint} style={styles.sectionLabel} numberOfLines={1}>
            Your spaces
          </Text>
        </Animated.View>

        {spaces.map((space) => (
          <Row
            key={space.id}
            active={selectedSpaceId === space.id}
            onPress={() => select(space.id)}
            leading={<AccentDot color={space.color} size={12} />}
            label={space.name}
            count={space.openCount}
            pinned={space.is_default}
            fade={fade}
          />
        ))}

        <Pressable
          style={styles.row}
          onPress={() => {
            navigation.closeDrawer();
            router.push('/space-new');
          }}
          accessibilityRole="button"
          accessibilityLabel="New space"
        >
          <View style={styles.rowLeading}>
            <Ionicons name="add" size={20} color={colors.brand} />
          </View>
          <Animated.View style={[styles.rowRest, fade]}>
            <Text variant="bodyMedium" color={colors.brand} numberOfLines={1}>
              New space
            </Text>
          </Animated.View>
        </Pressable>
      </ScrollView>

      <Pressable
        style={[styles.account, { paddingBottom: insets.bottom + spacing.md }]}
        onPress={() => {
          navigation.closeDrawer();
          router.push('/account');
        }}
        accessibilityRole="button"
        accessibilityLabel="Account"
      >
        <View style={styles.rowLeading}>
          <Ionicons name="person-circle-outline" size={24} color={colors.inkSoft} />
        </View>
        <Animated.View style={[styles.rowRest, fade]}>
          <Text variant="bodyMedium" color={colors.ink} numberOfLines={1}>
            Account
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** The overlap mark drawn in code (three multiply-blended circles), so the
 * sidebar has no dependency on generated image assets. */
function LogoMark() {
  return (
    <View style={styles.logo}>
      <View style={[styles.logoDot, { backgroundColor: '#5F7050', left: 1, top: 3 }]} />
      <View style={[styles.logoDot, { backgroundColor: '#D29A40', left: 11, top: 3 }]} />
      <View style={[styles.logoDot, { backgroundColor: '#C16E43', left: 6, top: 11 }]} />
    </View>
  );
}

function Row({
  active,
  onPress,
  leading,
  label,
  count,
  pinned,
  fade,
}: {
  active: boolean;
  onPress: () => void;
  leading: React.ReactNode;
  label: string;
  count: number;
  pinned?: boolean;
  fade?: StyleProp<AnimatedStyle<ViewStyle>>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.row, active && styles.rowActive]}
    >
      <View style={styles.rowLeading}>{leading}</View>
      <Animated.View style={[styles.rowRest, fade]}>
        <Text variant="bodyMedium" color={colors.ink} style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {pinned ? <Ionicons name="pin" size={13} color={colors.inkFaint} /> : null}
        {count > 0 ? (
          <Text variant="meta" color={colors.inkFaint} style={styles.count}>
            {count}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, overflow: 'hidden' },
  fullWidth: { width: '100%' },
  toggle: { position: 'absolute', top: spacing.sm + 2, zIndex: 2 },
  toggleButton: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButtonPressed: { backgroundColor: colors.surfaceAlt },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: 18,
    marginBottom: spacing.md,
  },
  headerWide: { marginTop: 40 },
  logo: { width: 28, height: 28 },
  logoDot: { position: 'absolute', width: 16, height: 16, borderRadius: 8, mixBlendMode: 'multiply' },
  wordmark: { fontFamily: fonts.displayBold, fontSize: 26, lineHeight: 32, color: colors.brandDeep },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.sm, gap: 2 },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.xs, marginLeft: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.button,
  },
  rowActive: { backgroundColor: colors.brandSoft },
  rowLeading: { width: 24, alignItems: 'center' },
  rowRest: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { flex: 1 },
  count: { minWidth: 18, textAlign: 'right' },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md + spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
