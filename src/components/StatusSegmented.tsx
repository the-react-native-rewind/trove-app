import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { STATUSES, type TaskStatus } from '@/lib/types';
import { colors, radii, spacing } from '@/theme/tokens';
import { Text } from './ui/Text';

export function StatusSegmented({
  value,
  counts,
  onChange,
}: {
  value: TaskStatus;
  counts: Record<TaskStatus, number>;
  onChange: (status: TaskStatus) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.track}
    >
      {STATUSES.map(({ key, label }) => {
        const active = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.seg, active && styles.segActive]}
          >
            <Text
              variant="bodyMedium"
              color={active ? colors.onBrand : colors.inkSoft}
            >
              {label}
            </Text>
            <View style={[styles.badge, active && styles.badgeActive]}>
              <Text variant="meta" color={active ? colors.onBrand : colors.inkFaint}>
                {counts[key] ?? 0}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  track: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  seg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  segActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  badge: { minWidth: 18, alignItems: 'center' },
  badgeActive: {},
});
