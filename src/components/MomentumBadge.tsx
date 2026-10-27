import { useEffect, useRef } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { momentumAppearance, momentumScale } from '@/lib/today';
import { fonts } from '@/theme/tokens';
import { Text } from './ui/Text';

const SIZE = 30;

/**
 * How many lines are ticked today, including zero. `pulse` increments on a new
 * tick so the circle bumps and a ring ripples. The resting size grows with the
 * count. Mounting with an existing count stays still.
 *
 * The box stays the resting circle, so the header's right inset does not grow
 * with the count. Scale is a transform from the right edge.
 */
export function MomentumBadge({ count, pulse }: { count: number; pulse: number }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const appearance = momentumAppearance(count, scheme);
  const resting = momentumScale(count);
  const base = useSharedValue(resting);
  const bump = useSharedValue(1);
  const ring = useSharedValue(1);
  const seen = useRef(pulse);

  useEffect(() => {
    base.value = withTiming(momentumScale(count), {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [base, count]);

  useEffect(() => {
    if (pulse === seen.current) return;
    seen.current = pulse;
    bump.value = withSequence(
      withTiming(1.12, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }),
    );
    ring.value = 0;
    ring.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [bump, pulse, ring]);

  const circleStyle = useAnimatedStyle(() => ({
    transformOrigin: 'right center',
    transform: [{ scale: base.value * bump.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.35,
    transformOrigin: 'right center',
    transform: [{ scale: base.value * (1 + ring.value * 0.55) }],
  }));

  const label =
    count === 0 ? 'No lines ticked today' : count === 1 ? '1 line ticked today' : `${count} lines ticked today`;

  return (
    <View accessible accessibilityLabel={label} style={styles.slot}>
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { borderColor: appearance.ink }, ringStyle]}
      />
      <Animated.View style={[styles.circle, { backgroundColor: appearance.fill }, circleStyle]}>
        <Text variant="bodyMedium" color={appearance.ink} style={styles.count}>
          {count}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: SIZE,
    height: SIZE,
    overflow: 'visible',
  },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
  },
  count: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
});
