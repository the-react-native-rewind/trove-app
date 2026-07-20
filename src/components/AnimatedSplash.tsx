import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme/tokens';

// Final logo geometry (matches the app icon: three multiply-blended circles).
const D = 120;
const CIRCLES = [
  { color: '#5F7050', x: -26, y: -20 }, // sage
  { color: '#D29A40', x: 26, y: -20 }, // honey
  { color: '#C16E43', x: 0, y: 29 }, // terracotta
];

/**
 * Cold-start splash: the overlap starts huge (circles cover the screen, their
 * blend filling the viewport), zooms down into the logo, holds a beat, then
 * fades out to reveal the app.
 */
export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(Math.max(width, height) / 45);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) });
    opacity.value = withDelay(
      1350,
      withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(onDone)();
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const groupStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View pointerEvents="none" style={[styles.overlay, overlayStyle]}>
      <Animated.View style={groupStyle}>
        {CIRCLES.map((c) => (
          <View
            key={c.color}
            style={[
              styles.circle,
              {
                backgroundColor: c.color,
                transform: [{ translateX: c.x }, { translateY: c.y }],
              },
            ]}
          />
        ))}
      </Animated.View>
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
