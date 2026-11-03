import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const IN = { duration: 280, easing: Easing.out(Easing.cubic) };
const OUT = { duration: 200, easing: Easing.in(Easing.quad) };

/**
 * A sheet over a dimmed backdrop. The backdrop fades. Only the sheet moves.
 * React Native's `animationType="slide"` slides the backdrop with the sheet,
 * so this drives both with `animationType="none"`.
 */
export function FadeSheet({
  visible,
  wide,
  onClose,
  onClosed,
  children,
}: {
  visible: boolean;
  wide?: boolean;
  onClose: () => void;
  /** Fires after the close animation, once the modal is gone. */
  onClosed?: () => void;
  children: ReactNode;
}) {
  const [rendered, setRendered] = useState(visible);
  const progress = useSharedValue(0);
  const generation = useRef(0);
  const seen = useRef(false);
  const onClosedRef = useRef(onClosed);

  if (visible && !rendered) {
    setRendered(true);
  }

  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  useEffect(() => {
    const token = generation.current + 1;
    generation.current = token;
    const finish = (closedToken: number) => {
      if (closedToken !== generation.current) return;
      setRendered(false);
      onClosedRef.current?.();
    };
    if (!seen.current) {
      seen.current = true;
      if (!visible) return;
    }
    if (visible) {
      progress.value = withTiming(1, IN);
      return;
    }
    progress.value = withTiming(0, OUT, (finished) => {
      if (!finished) return;
      runOnJS(finish)(token);
    });
  }, [progress, visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * (wide ? 28 : 420) }],
  }));

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.fill} pointerEvents="box-none">
        <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents={visible ? 'auto' : 'none'}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>
        <View style={[styles.host, wide && styles.hostWide]} pointerEvents="box-none">
          <Animated.View style={sheetStyle} pointerEvents="box-none">
            {children}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(43, 38, 32, 0.45)',
  },
  host: { flex: 1, justifyContent: 'flex-end' },
  hostWide: { justifyContent: 'center', padding: 24 },
});
