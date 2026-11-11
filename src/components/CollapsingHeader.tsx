import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { headerHiddenAfterScroll } from '@/lib/headerScroll';
import { colors } from '@/theme/tokens';

/**
 * Hides a list header on the way down and brings it back on the way up.
 * The header sits over the list, so hiding it reveals rows that were
 * already underneath. List padding stays constant, so rows do not jump.
 */
export function useCollapsingHeader(topInset: number, estimate = 112, pinned = false) {
  // The header now spans the status bar too, so its measured height — and the
  // distance it travels to hide — include the top inset.
  const full = estimate + topInset;
  const headerHeight = useSharedValue(full);
  const translateY = useSharedValue(0);
  const hidden = useSharedValue(false);
  const lastY = useSharedValue(0);
  const pinnedSv = useSharedValue(pinned);
  const heightRef = useRef(full);
  const hiddenRef = useRef(false);
  const lastYRef = useRef(0);
  const [blockHeight, setBlockHeight] = useState(full);
  const [interactive, setInteractive] = useState(true);

  useEffect(() => {
    pinnedSv.value = pinned;
  }, [pinned, pinnedSv]);

  function reveal(nextHidden: boolean, height: number) {
    translateY.value = withTiming(nextHidden ? -height : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    setInteractive(!nextHidden);
  }

  function onLayout(event: LayoutChangeEvent) {
    const next = event.nativeEvent.layout.height;
    headerHeight.value = next;
    heightRef.current = next;
    if (hiddenRef.current && !pinned) translateY.value = -next;
    setBlockHeight((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
  }

  /** DraggableFlatList reports offset on the JS thread. */
  function onScrollOffsetChange(y: number) {
    if (pinned) {
      lastYRef.current = y;
      if (!hiddenRef.current) return;
      hiddenRef.current = false;
      reveal(false, heightRef.current);
      return;
    }
    const next = headerHiddenAfterScroll({
      y,
      previousY: lastYRef.current,
      hidden: hiddenRef.current,
      headerHeight: heightRef.current,
    });
    lastYRef.current = y;
    if (next == null) return;
    hiddenRef.current = next;
    reveal(next, heightRef.current);
  }

  const setHiddenFromUI = (next: boolean) => {
    hiddenRef.current = next;
    setInteractive(!next);
  };

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      if (pinnedSv.value) {
        lastY.value = y;
        if (!hidden.value) return;
        hidden.value = false;
        translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
        runOnJS(setHiddenFromUI)(false);
        return;
      }
      const next = headerHiddenAfterScroll({
        y,
        previousY: lastY.value,
        hidden: hidden.value,
        headerHeight: headerHeight.value,
      });
      lastY.value = y;
      if (next == null) return;
      hidden.value = next;
      translateY.value = withTiming(next ? -headerHeight.value : 0, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      runOnJS(setHiddenFromUI)(next);
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return {
    animatedStyle,
    /** Space the list reserves so the first row starts below the header. */
    contentOffset: blockHeight,
    pointerEvents: (interactive ? 'box-none' : 'none') as ViewProps['pointerEvents'],
    onLayout,
    onScroll,
    onScrollOffsetChange,
  };
}

export function CollapsingScreenHeader({
  topInset,
  onLayout,
  animatedStyle,
  pointerEvents,
  children,
}: {
  topInset: number;
  onLayout: (event: LayoutChangeEvent) => void;
  animatedStyle: object;
  pointerEvents: ViewProps['pointerEvents'];
  children: ReactNode;
}) {
  return (
    <>
      <View pointerEvents="none" style={[styles.scrim, { height: topInset }]} />
      <TopFade top={topInset} />
      <Animated.View
        onLayout={onLayout}
        pointerEvents={pointerEvents}
        style={[styles.bar, { paddingTop: topInset }, animatedStyle]}
      >
        {children}
      </Animated.View>
    </>
  );
}

const FADE_HEIGHT = 18;
const FADE_BANDS = 10;
// Status-bar strip stays partly see-through, so rows ghost behind it rather
// than vanishing. colors.paper (#F2EAD9) at 72%. A true frosted blur would
// need expo-blur (a native module / rebuild); this is the no-rebuild version.
const SCRIM_ALPHA = 0.72;
const PAPER_SCRIM = 'rgba(242, 234, 217, 0.72)';

/**
 * A short paper gradient just below the translucent status-bar strip, so rows
 * ease into it instead of stepping. Sits above the list but below the header,
 * so it never washes the header while it is open. Stacked bands of paper
 * opacity — no gradient library needed.
 */
function TopFade({ top }: { top: number }) {
  return (
    <View pointerEvents="none" style={[styles.fade, { top, height: FADE_HEIGHT }]}>
      {Array.from({ length: FADE_BANDS }).map((_, i) => (
        <View
          key={i}
          style={{ flex: 1, backgroundColor: colors.paper, opacity: SCRIM_ALPHA * (1 - i / FADE_BANDS) }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: PAPER_SCRIM,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
  },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: colors.paper,
  },
});
