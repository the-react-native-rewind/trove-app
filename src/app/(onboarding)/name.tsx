import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput } from 'react-native';

import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useProfile, useUpdateProfile } from '@/data/profile';
import { hapticMedium } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

import { useOnboardingDraft } from './_layout';

export default function OnboardingName() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const draft = useOnboardingDraft();

  const [name, setName] = useState(draft.name || profile?.display_name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Pop your first name in so Trove knows what to call you.');
      return;
    }
    setError(null);
    setBusy(true);
    hapticMedium();
    try {
      if (session) {
        // Already signed in (e.g. came in via email sign-up) — just save the name.
        await updateProfile.mutateAsync({ display_name: trimmed });
      } else {
        const { error: signInError } = await supabase.auth.signInAnonymously({
          options: { data: { display_name: trimmed } },
        });
        if (signInError) throw signInError;
      }
      draft.setName(trimmed);
      router.push('/(onboarding)/capture' as never);
    } catch {
      setError('Something went wrong starting you off. Please try again.');
    } finally {
      // This screen stays underneath the next one, so it must be usable again
      // when the person comes back to it.
      setBusy(false);
    }
  }

  // Leaving onboarding means leaving the account it started: sign out, then
  // show the welcome page again.
  async function onExit() {
    if (busy) return;
    setBusy(true);
    try {
      if (session) await signOut();
    } finally {
      // Go back to the welcome page when it is underneath, so it slides the way
      // a back arrow should. Opened straight into onboarding, there is nothing
      // underneath, so put the welcome page in its place.
      if (router.canGoBack()) router.back();
      else router.replace('/(auth)/welcome' as never);
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OnboardingScaffold
        step={1}
        onBack={onExit}
        footer={
          <Button label="Continue" onPress={onContinue} loading={busy} haptic="none" />
        }
      >
        <Text style={styles.heading}>First, what should we call you?</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your first name"
          placeholderTextColor={colors.inkFaint}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={onContinue}
          style={styles.input}
        />
        {error ? (
          <Text variant="meta" color={colors.priorityHigh} style={styles.error}>
            {error}
          </Text>
        ) : null}
      </OnboardingScaffold>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  heading: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 32,
    lineHeight: 39,
    color: colors.ink,
  },
  input: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    fontFamily: fonts.bodyRegular,
    fontSize: 19,
    color: colors.ink,
  },
  error: { marginTop: spacing.md },
});
