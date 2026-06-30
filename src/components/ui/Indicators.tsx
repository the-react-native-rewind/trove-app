import { StyleSheet, View } from 'react-native';

import { colors, priority as priorityTokens, radii, resolveAccent, spacing } from '@/theme/tokens';
import type { Priority } from '@/lib/types';
import { Text } from './Text';

export function AccentDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: resolveAccent(color),
      }}
    />
  );
}

export function PriorityDot({ level, size = 9 }: { level: Priority | null; size?: number }) {
  if (!level) return null;
  return (
    <View
      accessibilityLabel={`${priorityTokens[level].label} priority`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: priorityTokens[level].color,
      }}
    />
  );
}

export function SpaceTag({ name, color }: { name: string; color: string }) {
  return (
    <View style={styles.tag}>
      <AccentDot color={color} size={7} />
      <Text variant="meta" color={colors.inkSoft} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    maxWidth: '60%',
  },
});
