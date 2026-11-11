import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { billingAvailable, PRO_TRIAL_DAYS } from '@/data/pro';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

/**
 * Compact bottom sheet shown when a usage cap is hit mid-use (a third circle,
 * the sixteenth today item, …). Calm, not a wall — tapping goes to the paywall.
 */
export function ProSheet({ title, body }: { title: string; body: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dismiss = () => {
    // Fall back to home when there's no back stack (e.g. deep-linked or a dev
    // reload landed straight on this route), so the sheet is never a dead end.
    if (router.canGoBack()) router.back();
    else router.replace('/' as never);
  };

  return (
    <View style={styles.fill}>
      <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(280)}
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
      >
        <View style={styles.grabber} />
        <View style={styles.badge}>
          <Ionicons name="lock-closed" size={20} color={colors.brand} />
        </View>
        <Text variant="label" color={colors.brand} style={styles.kicker}>
          Trove Pro
        </Text>
        <Text style={styles.title}>{title}</Text>
        <Text variant="body" color={colors.inkSoft} center style={styles.body}>
          {body}
        </Text>
        <Button
          label={billingAvailable ? `Start my ${PRO_TRIAL_DAYS} days free` : 'See Trove Pro'}
          onPress={() => router.replace('/paywall' as never)}
          haptic="light"
        />
        <Pressable onPress={dismiss} style={styles.notNow} accessibilityRole="button">
          <Text variant="meta" color={colors.inkFaint}>Not now</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(43, 38, 32, 0.45)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.floating,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.hairline,
    marginBottom: spacing.md,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  kicker: { marginTop: spacing.xs },
  title: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 24,
    lineHeight: 30,
    color: colors.ink,
    textAlign: 'center',
  },
  body: { maxWidth: 320, marginBottom: spacing.sm },
  notNow: { padding: spacing.sm, marginTop: spacing.xs },
});
