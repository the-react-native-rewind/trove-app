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
  const headerHeight = useSharedValue(estimate);
  const translateY = useSharedValue(0);
  const hidden = useSharedValue(false);
  const lastY = useSharedValue(0);
  const pinnedSv = useSharedValue(pinned);
  const heightRef = useRef(estimate);
  const hiddenRef = useRef(false);
  const lastYRef = useRef(0);
  const [blockHeight, setBlockHeight] = useState(estimate);
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
    contentOffset: topInset + blockHeight,
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
      <Animated.View
        onLayout={onLayout}
        pointerEvents={pointerEvents}
        style={[styles.bar, { top: topInset }, animatedStyle]}
      >
        {children}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: colors.paper,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: colors.paper,
  },
});
