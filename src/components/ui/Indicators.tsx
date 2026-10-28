import { StyleSheet, View } from 'react-native';

import {
  colors,
  labelChips,
  priority as priorityTokens,
  radii,
  resolveAccent,
  spacing,
  type as typeScale,
} from '@/theme/tokens';
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

const PROGRESS_PAD_V = 2;

/**
 * Small warm pill for a task that is in progress inside the single open list.
 * `reserveHeight` is the row it shares (the urgency dot). Vertical margin
 * cancels the pill's extra height so that row, and the card, stay the same
 * height as a task that is not in progress.
 */
export function InProgressTag({ reserveHeight }: { reserveHeight?: number }) {
  const pillHeight = typeScale.meta.lineHeight + PROGRESS_PAD_V * 2;
  const margin =
    reserveHeight == null ? undefined : -((pillHeight - reserveHeight) / 2);
  return (
    <View
      style={[styles.progress, margin != null && { marginVertical: margin }]}
      accessible={false}
    >
      <Text variant="meta" color={labelChips.content.text}>
        In progress
      </Text>
    </View>
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
  progress: {
    backgroundColor: labelChips.content.bg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: PROGRESS_PAD_V,
    flexShrink: 0,
  },
});
