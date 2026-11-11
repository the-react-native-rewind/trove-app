import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { PRO_TRIAL_DAYS } from '@/data/pro';
import { colors, fonts, spacing } from '@/theme/tokens';

/**
 * Calm full-screen lock shown where a feature needs Trove Pro. Keeps the app's
 * tone — no hard wall — and routes to the paywall.
 */
export function ProLock({ title, body }: { title: string; body: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.topBar}>
        <Text
          onPress={() => router.canGoBack() && router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.badge}>
          <Ionicons name="lock-closed" size={22} color={colors.brand} />
        </View>
        <Text style={styles.kicker} variant="label" color={colors.brand}>
          Trove Pro
        </Text>
        <Text style={styles.title}>{title}</Text>
        <Text variant="body" color={colors.inkSoft} center style={styles.bodyText}>
          {body}
        </Text>
      </View>
      <View style={styles.footer}>
        <Button
          label={`Start my ${PRO_TRIAL_DAYS} days free`}
          onPress={() => router.push('/paywall' as never)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.xl },
  topBar: { height: 44, justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  kicker: {},
  title: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 26,
    lineHeight: 32,
    color: colors.ink,
    textAlign: 'center',
  },
  bodyText: { maxWidth: 320 },
  footer: { paddingBottom: spacing.lg },
});
