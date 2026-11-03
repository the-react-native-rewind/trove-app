import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sheetChrome } from '@/lib/sheetLayout';
import { spacing } from '@/theme/tokens';

const IN = { duration: 280, easing: Easing.out(Easing.cubic) };
const OUT = { duration: 200, easing: Easing.in(Easing.quad) };

const SheetBottomContext = createContext<number | null>(null);

/**
 * Padding under sheet content. One home-indicator inset while the keyboard
 * is closed, and a small gap once the keyboard is covering that inset.
 */
export function useSheetBottomInset() {
  const provided = useContext(SheetBottomContext);
  const insets = useSafeAreaInsets();
  return provided ?? Math.max(insets.bottom, spacing.lg);
}

/** Sheet surface that keeps one bottom inset, including under the home indicator. */
export function SheetBottom({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const paddingBottom = useSheetBottomInset();
  return <View style={[style, { paddingBottom }]}>{children}</View>;
}

/**
 * A sheet over a dimmed backdrop. The backdrop fades. Only the sheet moves.
 * React Native's `animationType="slide"` slides the backdrop with the sheet,
 * so this drives both with `animationType="none"`.
 *
 * The dim is extended by the safe area so it still covers the home indicator
 * when the modal view is laid out short of the screen. Text sheets lift with
 * the keyboard and scroll inside the space that remains.
 */
export function FadeSheet({
  visible,
  wide,
  scroll = false,
  onClose,
  onClosed,
  children,
}: {
  visible: boolean;
  wide?: boolean;
  /** Scroll the sheet when its content is taller than the space above the keyboard. */
  scroll?: boolean;
  onClose: () => void;
  /** Fires after the close animation, once the modal is gone. */
  onClosed?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const [frameHeight, setFrameHeight] = useState(() => Dimensions.get('screen').height);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardLift = useSharedValue(0);
  const progress = useSharedValue(0);
  const generation = useRef(0);
  const seen = useRef(false);
  const onClosedRef = useRef(onClosed);
  const screen = Dimensions.get('screen');

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

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const apply = (height: number, duration: number) => {
      const screenHeight = Dimensions.get('screen').height;
      const coversScreen = frameHeight >= screenHeight - 1;
      const outside = wide || coversScreen ? 0 : insets.bottom;
      const lift = height > 0 ? Math.max(0, height - outside) : 0;
      keyboardLift.value = withTiming(lift, { duration });
      setKeyboardHeight(height);
    };
    const visibleKeyboard = Keyboard.metrics();
    if (visibleKeyboard) apply(visibleKeyboard.height, 0);
    const show = Keyboard.addListener(showEvent, (event) => {
      const duration = Platform.OS === 'ios' ? event.duration : 180;
      apply(event.endCoordinates.height, duration);
    });
    const hide = Keyboard.addListener(hideEvent, (event) => {
      const duration = Platform.OS === 'ios' ? event.duration : 160;
      apply(0, duration);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [frameHeight, insets.bottom, keyboardLift, wide]);

  const chrome = sheetChrome({
    screenHeight: screen.height,
    frameHeight,
    topInset: insets.top,
    bottomInset: insets.bottom,
    leftInset: insets.left,
    rightInset: insets.right,
    keyboardHeight,
    wide: wide === true,
    contentGap: spacing.lg,
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * (wide ? 28 : 420) }],
  }));
  const liftStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboardLift.value + (wide ? 24 : 0),
  }), [wide]);

  const body = scroll ? (
    <ScrollView
      style={{ maxHeight: chrome.maxBodyHeight, flexGrow: 0 }}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      nestedScrollEnabled
      bounces={false}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        style={styles.fill}
        pointerEvents="box-none"
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          setFrameHeight((current) => (Math.abs(current - next) < 1 ? current : next));
        }}
      >
        <Animated.View
          style={[
            styles.backdrop,
            backdropStyle,
            {
              top: -chrome.bleedTop,
              bottom: -chrome.bleedBottom,
              left: -chrome.bleedLeft,
              right: -chrome.bleedRight,
            },
          ]}
          pointerEvents={visible ? 'auto' : 'none'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.host,
            wide && styles.hostWide,
            { marginBottom: wide || keyboardHeight > 0 ? 0 : -chrome.drop },
            liftStyle,
          ]}
          pointerEvents="box-none"
        >
          <SheetBottomContext.Provider value={chrome.contentBottom}>
            <Animated.View style={sheetStyle} pointerEvents="box-none">
              {body}
            </Animated.View>
          </SheetBottomContext.Provider>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'visible' },
  backdrop: {
    position: 'absolute',
    backgroundColor: 'rgba(43, 38, 32, 0.45)',
  },
  host: { flex: 1, justifyContent: 'flex-end' },
  hostWide: { justifyContent: 'center', paddingHorizontal: 24, paddingTop: 24 },
  scrollContent: { flexGrow: 0 },
});
