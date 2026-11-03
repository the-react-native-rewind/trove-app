import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const finishClose = () => {
      if (onClose) onClose();
      else if (router.canGoBack()) router.back();
    };
    progress.value = withTiming(leaving ? 0 : 1, leaving ? OUT : IN, (finished) => {
      if (leaving && finished) runOnJS(finishClose)();
    });
  }, [leaving, onClose, progress, router]);

  function close() {
    setLeaving(true);
  }

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * (isWide ? 28 : 72) }],
  }));

  const body = (
    <>
      <View style={styles.header}>
        <Text variant="sectionHeading">{title}</Text>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={colors.inkSoft} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={spacing.md}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer ? (
          <View
            style={[
              styles.footer,
              { paddingBottom: (isWide ? spacing.md : insets.bottom) + spacing.md },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </>
  );

  // The route is a transparent overlay. The dim fades. Only the sheet moves.
  return (
    <View style={styles.fill}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>
      <View style={[styles.host, !isWide && styles.hostPhone]} pointerEvents="box-none">
        <Animated.View
          style={[isWide ? styles.card : [styles.container, { paddingTop: spacing.md }], sheetStyle]}
        >
          {body}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  host: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  hostPhone: { padding: 0, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
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
