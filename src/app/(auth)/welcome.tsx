import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.body}>
        <Text style={styles.wordmark}>Trove</Text>
        <Text style={styles.heading}>A calm home for everything{'\n'}on your plate.</Text>
        <Text variant="body" color={colors.inkSoft} style={styles.sub}>
          Say what’s in your head and Trove sorts it into circles, actions and
          routines — so you can see it all in one quiet place.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button label="Get started" onPress={() => router.push('/(onboarding)/name' as never)} />
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
  wordmark: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 22,
    color: colors.brand,
    marginBottom: spacing.xxl,
  },
  heading: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 34,
    lineHeight: 41,
    color: colors.ink,
  },
  sub: { marginTop: spacing.lg },
  footer: { gap: spacing.sm, paddingBottom: spacing.lg },
});
