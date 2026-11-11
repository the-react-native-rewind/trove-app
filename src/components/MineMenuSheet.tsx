import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { hapticLight } from '@/lib/haptics';
import { colors, radii, spacing } from '@/theme/tokens';
import { FadeSheet, SheetBottom } from './ui/FadeSheet';
import { Text } from './ui/Text';

/** Settings sheet for the Mine view. A list so more rows can be added later. */
export function MineMenuSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();

  return (
    <FadeSheet visible={visible} onClose={onClose} scroll>
      <SheetBottom style={styles.sheet}>
        <Text variant="sectionHeading">Mine</Text>
        <Pressable
          onPress={() => {
            hapticLight();
            onClose();
            router.push('/mine/completed' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel="Completed actions"
          style={styles.row}
        >
          <Ionicons name="checkmark-circle-outline" size={22} color={colors.ink} />
          <Text variant="bodyMedium" style={styles.label}>
            Completed actions
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
        </Pressable>
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
