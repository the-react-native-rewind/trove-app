import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sheetChrome } from '@/lib/sheetLayout';
import { useIsWide } from '@/hooks/useIsWide';
import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { Text } from './Text';

const IN = { duration: 280, easing: Easing.out(Easing.cubic) };
const OUT = { duration: 200, easing: Easing.in(Easing.quad) };

export function ModalScaffold({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const progress = useSharedValue(0);
  const keyboardLift = useSharedValue(0);
  const [leaving, setLeaving] = useState(false);
  const [frameHeight, setFrameHeight] = useState(() => Dimensions.get('screen').height);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const screen = Dimensions.get('screen');

  useEffect(() => {
    const finishClose = () => {
      if (onClose) onClose();
      else if (router.canGoBack()) router.back();
    };
    progress.value = withTiming(leaving ? 0 : 1, leaving ? OUT : IN, (finished) => {
      if (leaving && finished) runOnJS(finishClose)();
    });
  }, [leaving, onClose, progress, router]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const apply = (height: number, duration: number) => {
      const screenHeight = Dimensions.get('screen').height;
      const coversScreen = frameHeight >= screenHeight - 1;
      const outside = isWide || coversScreen ? 0 : insets.bottom;
      const lift = height > 0 ? Math.max(0, height - outside) : 0;
      keyboardLift.value = withTiming(lift, { duration });
      setKeyboardHeight(height);
    };
    const visibleKeyboard = Keyboard.metrics();
    if (visibleKeyboard) apply(visibleKeyboard.height, 0);
    const show = Keyboard.addListener(showEvent, (event) => {
      apply(event.endCoordinates.height, Platform.OS === 'ios' ? event.duration : 180);
    });
    const hide = Keyboard.addListener(hideEvent, (event) => {
      apply(0, Platform.OS === 'ios' ? event.duration : 160);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [frameHeight, insets.bottom, isWide, keyboardLift]);

  function close() {
    setLeaving(true);
  }

  const chrome = sheetChrome({
    screenHeight: screen.height,
    frameHeight,
    topInset: insets.top,
    bottomInset: insets.bottom,
    leftInset: insets.left,
    rightInset: insets.right,
    keyboardHeight,
    wide: isWide,
    contentGap: spacing.md,
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * (isWide ? 28 : 72) }],
    marginBottom: keyboardLift.value,
  }), [isWide]);

  const footerBottom = keyboardHeight > 0 ? spacing.md : isWide ? spacing.md : insets.bottom + spacing.md;

  const body = (
    <>
      <View style={styles.header}>
        <Text variant="sectionHeading">{title}</Text>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={colors.inkSoft} />
        </Pressable>
      </View>

      <View style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer ? (
          <View style={[styles.footer, { paddingBottom: footerBottom }]}>
            {footer}
          </View>
        ) : null}
      </View>
    </>
  );

  // The route is a transparent overlay. The dim fades. Only the sheet moves.
  // Phone sheets are full-height pages: the header starts below the status bar,
  // the same way a pushed screen does. The dim still covers that strip.
  return (
    <View
      style={styles.fill}
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
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>
      <View style={[styles.host, !isWide && styles.hostPhone]} pointerEvents="box-none">
        <Animated.View
          style={[
            isWide ? styles.card : [styles.container, { paddingTop: insets.top }],
            sheetStyle,
          ]}
        >
          {body}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'visible' },
  container: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  host: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  hostPhone: { padding: 0, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    backgroundColor: 'rgba(43, 38, 32, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    overflow: 'hidden',
    paddingTop: spacing.sm,
    ...shadows.floating,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  scroll: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
  },
});
