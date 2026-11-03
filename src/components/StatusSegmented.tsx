import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { hapticLight } from '@/lib/haptics';
import { LIST_STATUSES, type ListStatus } from '@/lib/types';
import { colors, radii, spacing } from '@/theme/tokens';
import { Text } from './ui/Text';

export function SegmentTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={styles.track}
    >
      {options.map(({ key, label, count }) => {
        const active = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => {
              if (!active) hapticLight();
              onChange(key);
            }}
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
            {count === undefined ? null : (
              <View style={styles.badge}>
                <Text variant="meta" color={active ? colors.onBrand : colors.inkFaint}>
                  {count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function StatusSegmented({
  value,
  counts,
  onChange,
}: {
  value: ListStatus;
  counts: Record<ListStatus, number>;
  onChange: (status: ListStatus) => void;
}) {
  return (
    <SegmentTabs
      options={LIST_STATUSES.map(({ key, label }) => ({ key, label, count: counts[key] ?? 0 }))}
      value={value}
      onChange={onChange}
    />
  );
}

const styles = StyleSheet.create({
  // Pin the bar height so the horizontal ScrollView can't claim flexible
  // vertical space (which would stretch the pills to fill the screen).
  bar: { flexGrow: 0, flexShrink: 0 },
  track: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
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
