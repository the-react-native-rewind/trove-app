import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useSkipOnboarding } from '@/data/onboarding';
import { isEmptyPlan, structureBrainDump } from '@/lib/onboarding';
import { colors, fonts, spacing } from '@/theme/tokens';

import { useOnboardingDraft } from './_layout';

export default function OnboardingBuilding() {
  const router = useRouter();
  const draft = useOnboardingDraft();
  const skip = useSkipOnboarding();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const running = useRef(false);

  async function onSkip() {
    await skip.mutateAsync();
    router.replace('/');
  }

  async function run() {
    setStatus('working');
    const plan = await structureBrainDump({ transcript: draft.transcript });
    if (!plan || isEmptyPlan(plan)) {
      setStatus('error');
      return;
    }
    draft.setPlan(plan);
    router.replace('/(onboarding)/review' as never);
  }

  useEffect(() => {
    if (running.current) return;
    running.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'error') {
    return (
      <OnboardingScaffold
        step={3}
        footer={
          <Button
            label="Try again"
            onPress={() => {
              running.current = true;
              void run();
            }}
          />
        }
      >
        <View style={styles.center}>
          <Text style={styles.heading}>Let’s give that another go</Text>
          <Text variant="body" color={colors.inkSoft} style={styles.sub}>
            I couldn’t quite make sense of that one. Try again, or head in and add
            things yourself.
          </Text>
          <Button label="Skip for now" variant="ghost" onPress={onSkip} />
        </View>
      </OnboardingScaffold>
    );
  }

  return (
    <OnboardingScaffold step={3}>
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.heading}>Making sense of it…</Text>
        <Text variant="body" color={colors.inkSoft} style={styles.sub}>
          Sorting everything into circles and pulling out what matters. One moment.
        </Text>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.lg },
  heading: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 26,
    lineHeight: 32,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  sub: { textAlign: 'center' },
});
