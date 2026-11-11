import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { colors } from '@/theme/tokens';

// Final logo geometry (matches the app icon: three multiply-blended circles).
// dx/dy is the unit direction each circle flies when the splash opens.
const D = 120;
type SplashDot = { color: string; x: number; y: number; dx: number; dy: number };
const CIRCLES: SplashDot[] = [
  { color: '#5F7050', x: -26, y: -20, dx: -0.79, dy: -0.61 }, // sage → up-left
  { color: '#D29A40', x: 26, y: -20, dx: 0.79, dy: -0.61 }, // honey → up-right
  { color: '#C16E43', x: 0, y: 29, dx: 0, dy: 1 }, // terracotta → down
];

function SplashCircle({ dot, progress, spread }: { dot: SplashDot; progress: SharedValue<number>; spread: number }) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      transform: [
        { translateX: dot.x + dot.dx * spread * p },
        { translateY: dot.y + dot.dy * spread * p },
        { scale: 1 + p * 1.8 },
      ],
    };
  });
  return <Animated.View style={[styles.circle, { backgroundColor: dot.color }, style]} />;
}

/**
 * Cold-start splash: the three circles sit together as the logo, hold a beat,
 * then fly apart in their own directions and grow, opening the screen while the
 * paper overlay fades to reveal the app.
 */
export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const spread = Math.max(width, height) * 0.55;
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    progress.value = withDelay(
      450,
      withTiming(1, { duration: 800, easing: Easing.in(Easing.cubic) }),
    );
    opacity.value = withDelay(
      820,
      withTiming(0, { duration: 520, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(onDone)();
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View pointerEvents="none" style={[styles.overlay, overlayStyle]}>
      <View>
        {CIRCLES.map((dot) => (
          <SplashCircle key={dot.color} dot={dot} progress={progress} spread={spread} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  circle: {
    position: 'absolute',
    left: -D / 2,
    top: -D / 2,
    width: D,
    height: D,
    borderRadius: D / 2,
    mixBlendMode: 'multiply',
  },
});
