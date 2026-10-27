import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme/tokens';
import { Text } from './ui/Text';

const SIZE = 30;

/**
 * How many lines are ticked today. `pulse` increments on a new tick so the
 * circle scales and a ring ripples. Mounting with an existing count stays still.
 */
export function MomentumBadge({ count, pulse }: { count: number; pulse: number }) {
  const scale = useSharedValue(1);
  const ring = useSharedValue(1);
  const seen = useRef(pulse);

  useEffect(() => {
    if (pulse === seen.current) return;
    seen.current = pulse;
    scale.value = withSequence(
      withTiming(1.12, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }),
    );
    ring.value = 0;
    ring.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [pulse, ring, scale]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.35,
    transform: [{ scale: 1 + ring.value * 0.55 }],
  }));

  const label = count === 1 ? '1 line ticked today' : `${count} lines ticked today`;

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={styles.slot}
    >
      <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      <Animated.View style={[styles.circle, circleStyle]}>
        <Text variant="bodyMedium" color={colors.brandDeep} style={styles.count}>
          {count}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    minWidth: SIZE,
    height: SIZE,
    paddingHorizontal: 7,
    borderRadius: SIZE / 2,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.brand,
  },
  count: {
    fontSize: 14,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
});
