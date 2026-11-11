import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useSkipOnboarding } from '@/data/onboarding';
import { useDictation } from '@/hooks/useDictation';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

import { useOnboardingDraft } from './_layout';

export default function OnboardingCapture() {
  const router = useRouter();
  const draft = useOnboardingDraft();
  const skip = useSkipOnboarding();
  const [text, setText] = useState(draft.transcript);

  const dictationBaseRef = useRef('');
  const dictation = useDictation((sessionTranscript) => {
    const base = dictationBaseRef.current;
    const joiner = base && !base.endsWith(' ') ? ' ' : '';
    setText(base + joiner + sessionTranscript);
  });

  function toggleDictation() {
    hapticMedium();
    if (dictation.listening) {
      dictation.stop();
    } else {
      dictationBaseRef.current = text;
      dictation.start();
    }
  }

  function onContinue() {
    if (dictation.listening) dictation.stop();
    draft.setTranscript(text.trim());
    router.push('/(onboarding)/building' as never);
  }

  const hasText = text.trim().length > 0;

  return (
    <OnboardingScaffold
      step={2}
      footer={
        <Button
          label={hasText ? 'That’s everything' : 'Add a few things first'}
          onPress={onContinue}
          disabled={!hasText}
          haptic="light"
        />
      }
    >
      <Text style={styles.heading}>What’s on your plate?</Text>
      <Text variant="body" color={colors.inkSoft} style={styles.sub}>
        Hold the mic and talk it all out — the business, the house, the side
        project, the thing at 3am. No order needed.
      </Text>

      <View style={styles.micWrap}>
        {dictation.available ? (
          <Pressable
            onPress={toggleDictation}
            accessibilityRole="button"
            accessibilityLabel={dictation.listening ? 'Stop talking' : 'Start talking'}
            style={[styles.mic, dictation.listening && styles.micOn]}
          >
            <Ionicons
              name={dictation.listening ? 'stop' : 'mic'}
              size={38}
              color={dictation.listening ? colors.onBrand : colors.brand}
            />
          </Pressable>
        ) : null}
        <Text variant="meta" color={dictation.listening ? colors.brand : colors.inkFaint}>
          {dictation.listening ? 'Listening…' : dictation.available ? 'Tap to talk' : 'Type it below'}
        </Text>
      </View>

      <ScrollView style={styles.transcriptWrap} keyboardShouldPersistTaps="handled">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="…or type it here instead."
          placeholderTextColor={colors.inkFaint}
          multiline
          style={styles.transcript}
          onFocus={() => {
            if (dictation.listening) dictation.stop();
          }}
        />
      </ScrollView>

      <Pressable
        onPress={async () => {
          hapticLight();
          if (dictation.listening) dictation.stop();
          await skip.mutateAsync();
          router.replace('/');
        }}
        style={styles.skip}
        accessibilityRole="button"
      >
        <Text variant="meta" color={colors.inkFaint}>
          I’ll do this later
        </Text>
      </Pressable>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 30,
    lineHeight: 36,
    color: colors.ink,
  },
  sub: { marginTop: spacing.md },
  micWrap: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  mic: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micOn: { backgroundColor: colors.brand },
  transcriptWrap: {
    marginTop: spacing.xl,
    maxHeight: 180,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
  },
  transcript: {
    padding: spacing.lg,
    minHeight: 96,
    textAlignVertical: 'top',
    fontFamily: fonts.bodyRegular,
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
  },
  skip: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
});
