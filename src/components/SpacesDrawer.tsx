import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSpaces } from '@/data/spaces';
import { useSelectedSpace } from '@/providers/SpaceProvider';
import { colors, fonts, radii, spacing } from '@/theme/tokens';
import { AccentDot } from './ui/Indicators';
import { Text } from './ui/Text';

type DrawerNav = { closeDrawer: () => void };

export function SpacesDrawer({ navigation }: { navigation: DrawerNav }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { selectedSpaceId, setSelectedSpaceId } = useSelectedSpace();
  const { data: spaces = [] } = useSpaces();

  const totalOpen = spaces.reduce((sum, s) => sum + s.openCount, 0);

  function select(id: string) {
    setSelectedSpaceId(id);
    navigation.closeDrawer();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.wordmark}>Trove</Text>

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
        />

        <Text variant="label" color={colors.inkFaint} style={styles.sectionLabel}>
          Your spaces
        </Text>

        {spaces.map((space) => (
          <Row
            key={space.id}
            active={selectedSpaceId === space.id}
            onPress={() => select(space.id)}
            leading={<AccentDot color={space.color} size={12} />}
            label={space.name}
            count={space.openCount}
            pinned={space.is_default}
          />
        ))}

        <Pressable
          style={styles.newSpace}
          onPress={() => {
            navigation.closeDrawer();
            router.push('/space-new');
          }}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={20} color={colors.brand} />
          <Text variant="bodyMedium" color={colors.brand}>
            New space
          </Text>
        </Pressable>
      </ScrollView>

      <Pressable
        style={[styles.account, { paddingBottom: insets.bottom + spacing.md }]}
        onPress={() => {
          navigation.closeDrawer();
          router.push('/account');
        }}
        accessibilityRole="button"
      >
        <Ionicons name="person-circle-outline" size={26} color={colors.inkSoft} />
        <Text variant="bodyMedium" color={colors.ink}>
          Account
        </Text>
      </Pressable>
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
}: {
  active: boolean;
  onPress: () => void;
  leading: React.ReactNode;
  label: string;
  count: number;
  pinned?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.row, active && styles.rowActive]}
    >
      <View style={styles.rowLeading}>{leading}</View>
      <Text variant="bodyMedium" color={colors.ink} style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      {pinned ? <Ionicons name="pin" size={13} color={colors.inkFaint} /> : null}
      {count > 0 ? (
        <Text variant="meta" color={colors.inkFaint} style={styles.count}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  wordmark: {
    fontFamily: fonts.displayBold,
    fontSize: 28,
    color: colors.brandDeep,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
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
  rowLabel: { flex: 1 },
  count: { minWidth: 18, textAlign: 'right' },
  newSpace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
