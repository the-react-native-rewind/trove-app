import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { hapticLight } from '@/lib/haptics';
import { colors, radii, spacing } from '@/theme/tokens';
import { FadeSheet, SheetBottom } from './ui/FadeSheet';
import { Text } from './ui/Text';

type MenuItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
};

/** Circle options, as a list so another row can be added later. */
export function circleMenuItems(spaceId: string): MenuItem[] {
  return [
    {
      key: 'settings',
      label: 'Circle settings',
      icon: 'settings-outline',
      href: `/space/${spaceId}/settings`,
    },
    {
      key: 'members',
      label: 'Members',
      icon: 'people-outline',
      href: `/space/${spaceId}/members`,
    },
    {
      key: 'completed',
      label: 'Completed actions',
      icon: 'checkmark-circle-outline',
      href: `/space/${spaceId}/completed`,
    },
  ];
}

export function CircleMenuSheet({
  visible,
  spaceId,
  onClose,
}: {
  visible: boolean;
  spaceId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const items = circleMenuItems(spaceId);

  return (
    <FadeSheet visible={visible} onClose={onClose} scroll>
      <SheetBottom style={styles.sheet}>
        <Text variant="sectionHeading">Circle</Text>
        {items.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => {
              hapticLight();
              onClose();
              router.push(item.href as never);
            }}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            style={styles.row}
          >
            <Ionicons name={item.icon} size={22} color={colors.ink} />
            <Text variant="bodyMedium" style={styles.label}>
              {item.label}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </Pressable>
        ))}
      </SheetBottom>
    </FadeSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.button,
  },
  label: { flex: 1 },
});
