import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme/tokens';

const TOTAL_STEPS = 4;

/**
 * The calm frame every onboarding step shares: cream background, generous
 * breathing room, progress dots at the top and an optional pinned footer.
 */
export function OnboardingScaffold({
  step,
  children,
  footer,
}: {
  /** 1-based step, for the progress dots. Omit to hide them. */
  step?: number;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { paddingTop: insets.top + spacing.lg }]}>
      {step ? (
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[styles.dot, i < step && styles.dotOn]} />
          ))}
        </View>
      ) : null}
      <View style={styles.body}>{children}</View>
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
    paddingVertical: spacing.md,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.hairline,
  },
  dotOn: { backgroundColor: colors.brand },
  body: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
});
