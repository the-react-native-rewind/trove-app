import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme/tokens';

// Name, four lists, then routines, circles and the day.
const TOTAL_STEPS = 8;

/**
 * The calm frame every onboarding step shares: cream background, generous
 * breathing room, progress dots at the top and an optional pinned footer.
 */
export function OnboardingScaffold({
  step,
  align = 'center',
  onBack,
  children,
  footer,
}: {
  /** 1-based step, for the progress dots. Omit to hide them. */
  step?: number;
  /** Where the body sits. List steps start at the top so the list can grow. */
  align?: 'center' | 'top';
  /** Shows a back arrow beside the progress dots. */
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { paddingTop: insets.top + spacing.lg }]}>
      {step ? (
        <View style={styles.dots}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.back}
            >
              <Ionicons name="chevron-back" size={24} color={colors.inkSoft} />
            </Pressable>
          ) : null}
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[styles.dot, i < step && styles.dotOn]} />
          ))}
        </View>
      ) : null}
      <View style={[styles.body, align === 'top' && styles.bodyTop]}>{children}</View>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>{footer}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  back: {
    position: 'absolute',
    left: spacing.md,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.hairline,
  },
  dotOn: { backgroundColor: colors.brand },
  body: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  bodyTop: { justifyContent: 'flex-start' },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
});
