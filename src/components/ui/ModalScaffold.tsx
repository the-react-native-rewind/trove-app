import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsWide } from '@/hooks/useIsWide';
import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { Text } from './Text';

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

  function close() {
    if (onClose) onClose();
    else if (router.canGoBack()) router.back();
  }

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

  // Wide screens: a centered dialog over a dimmed, tap-to-close backdrop.
  if (isWide) {
    return (
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={styles.card}>{body}</View>
      </View>
    );
  }

  // Phones: full-screen modal.
  return <View style={[styles.container, { paddingTop: spacing.md }]}>{body}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(43, 38, 32, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
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
