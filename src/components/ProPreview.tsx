import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { PRO_TRIAL_DAYS } from '@/data/pro';
import { colors, fonts, radii, resolveAccent, shadows, spacing } from '@/theme/tokens';

const SAMPLE = [
  { name: 'Work', color: 'brand', rate: 0.86 },
  { name: 'Finca', color: 'moss', rate: 0.72 },
  { name: 'Home', color: 'terracotta', rate: 0.64 },
  { name: 'Newsletter', color: 'honey', rate: 0.5 },
];

/** A faded, non-interactive taste of Insights behind a Pro unlock card. */
export function ProPreview({ title, body }: { title: string; body: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.fill}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as never))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
      </View>

      {/* The real thing, with sample numbers — faded and not tappable. */}
      <View style={styles.preview} pointerEvents="none">
        <Text variant="screenTitle">Insights</Text>
        <View style={styles.hero}>
          <Text style={styles.heroPct}>78%</Text>
          <Text variant="body" color={colors.inkSoft}>
            You ticked off 32 of the 41 lines you wrote in the last 30 days.
          </Text>
        </View>
        <Text variant="sectionHeading" style={styles.sectionHeading}>
          Where you finish
        </Text>
        {SAMPLE.map((row) => (
          <View key={row.name} style={styles.row}>
            <View style={styles.rowHead}>
              <View style={[styles.dot, { backgroundColor: resolveAccent(row.color) }]} />
              <Text variant="cardTitle">{row.name}</Text>
              <View style={styles.spacer} />
              <Text variant="meta" color={colors.inkFaint}>{Math.round(row.rate * 100)}%</Text>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fillBar,
                  { width: `${Math.round(row.rate * 100)}%`, backgroundColor: resolveAccent(row.color) },
                ]}
              />
            </View>
          </View>
        ))}
      </View>

      {/* Fade the preview into the unlock card. */}
      <View style={styles.scrim} pointerEvents="none" />

      <View style={[styles.card, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.badge}>
          <Ionicons name="lock-closed" size={18} color={colors.brand} />
        </View>
        <Text variant="label" color={colors.brand}>Trove Pro</Text>
        <Text style={styles.title}>{title}</Text>
        <Text variant="body" color={colors.inkSoft} center style={styles.body}>
          {body}
        </Text>
        <Button
          label={`Start my ${PRO_TRIAL_DAYS} days free`}
          onPress={() => router.push('/paywall' as never)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  topBar: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { paddingHorizontal: spacing.xl, gap: spacing.md, opacity: 0.4 },
  hero: { gap: spacing.xs, marginTop: spacing.sm },
  heroPct: { fontFamily: fonts.displayBold, fontSize: 64, lineHeight: 70, color: colors.brand },
  sectionHeading: { marginTop: spacing.lg },
  row: { gap: spacing.xs },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  spacer: { flex: 1 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fillBar: { height: 8, borderRadius: 4 },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '42%',
    bottom: 0,
    backgroundColor: colors.paper,
    opacity: 0.86,
  },
  card: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 0,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    ...shadows.floating,
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 24,
    lineHeight: 30,
    color: colors.ink,
    textAlign: 'center',
  },
  body: { maxWidth: 320, marginBottom: spacing.sm },
});
