import { Stack } from 'expo-router';
import { createContext, useContext, useMemo, useState } from 'react';

import type { OnboardingPlan } from '@/lib/onboarding';
import { colors } from '@/theme/tokens';

type OnboardingDraft = {
  name: string;
  setName: (value: string) => void;
  transcript: string;
  setTranscript: (value: string) => void;
  plan: OnboardingPlan | null;
  setPlan: (value: OnboardingPlan | null) => void;
};

const OnboardingContext = createContext<OnboardingDraft | null>(null);

/** Shared draft carried across the onboarding steps (name → mic → build → review). */
export function useOnboardingDraft(): OnboardingDraft {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboardingDraft must be used inside the onboarding stack');
  return ctx;
}

export default function OnboardingLayout() {
  const [name, setName] = useState('');
  const [transcript, setTranscript] = useState('');
  const [plan, setPlan] = useState<OnboardingPlan | null>(null);

  const value = useMemo<OnboardingDraft>(
    () => ({ name, setName, transcript, setTranscript, plan, setPlan }),
    [name, transcript, plan],
  );

  return (
    <OnboardingContext.Provider value={value}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
          gestureEnabled: false,
          animation: 'fade',
        }}
      >
        <Stack.Screen name="name" />
        <Stack.Screen name="capture" />
        <Stack.Screen name="building" />
        <Stack.Screen name="review" />
      </Stack>
    </OnboardingContext.Provider>
  );
}
