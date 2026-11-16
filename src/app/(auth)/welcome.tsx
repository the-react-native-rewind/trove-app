import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors, fonts, spacing } from '@/theme/tokens';

// The logo: three multiply-blended circles, in the same proportions as the
// splash and the app icon.
const MARK_DOT = 40;
const MARK_SIZE = 62;
const MARK_DOTS = [
  { color: '#5F7050', x: -8.7, y: -6.7 }, // sage
  { color: '#D29A40', x: 8.7, y: -6.7 }, // honey
  { color: '#C16E43', x: 0, y: 9.7 }, // terracotta
];

function LogoMark() {
  const origin = (MARK_SIZE - MARK_DOT) / 2;
  return (
    <View style={styles.mark} accessibilityRole="image" accessibilityLabel="Trove">
      {MARK_DOTS.map((dot) => (
        <View
          key={dot.color}
          style={[
            styles.markDot,
            { backgroundColor: dot.color, left: origin + dot.x, top: origin + dot.y },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * The signed-out landing. It carries the same promise as the homepage, so
 * someone arriving from there finds the thing they tapped for.
 */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.body}>
        <View style={styles.brand}>
          <LogoMark />
          <Text style={styles.wordmark}>Trove</Text>
        </View>
        <Text style={styles.heading}>Close the 47 tabs in your head.</Text>
        <Text style={styles.sub}>
          List everything on your mind. Ten minutes from now it’s one list for today.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button label="Close my tabs" onPress={() => router.push('/(onboarding)/name' as never)} />
        <Text variant="meta" color={colors.inkFaint} style={styles.meta}>
          Free to start.
        </Text>
        <Button
          label="I already have an account"
          variant="ghost"
          onPress={() => router.push('/(auth)/sign-in' as never)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.xl },
  body: { flex: 1, justifyContent: 'center' },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
    // The mark has clear space around its circles; pull it back to the text edge.
    marginLeft: -4,
  },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
  markDot: {
    position: 'absolute',
    width: MARK_DOT,
    height: MARK_DOT,
    borderRadius: MARK_DOT / 2,
    mixBlendMode: 'multiply',
  },
  wordmark: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 24,
    color: colors.brand,
  },
  heading: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 36,
    lineHeight: 43,
    color: colors.ink,
  },
  sub: {
    marginTop: spacing.lg,
    fontFamily: fonts.bodyRegular,
    fontSize: 18,
    lineHeight: 26,
    color: colors.inkSoft,
  },
  footer: { gap: spacing.sm, paddingBottom: spacing.lg },
  meta: { textAlign: 'center' },
});
