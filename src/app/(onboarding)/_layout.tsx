import { Stack } from 'expo-router';
import { createContext, useContext, useMemo, useState, type Dispatch, type SetStateAction } from 'react';

import { EMPTY_LISTS, type OnboardingLists, type OnboardingPlan } from '@/lib/onboarding';
import { colors } from '@/theme/tokens';

type OnboardingDraft = {
  name: string;
  setName: (value: string) => void;
  lists: OnboardingLists;
  setLists: (value: OnboardingLists) => void;
  plan: OnboardingPlan | null;
  // The setter form, so an edit always builds on the latest plan rather than
  // the one captured when the screen rendered.
  setPlan: Dispatch<SetStateAction<OnboardingPlan | null>>;
};

const OnboardingContext = createContext<OnboardingDraft | null>(null);

/** Shared draft carried across the onboarding steps (name → lists → review). */
export function useOnboardingDraft(): OnboardingDraft {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboardingDraft must be used inside the onboarding stack');
  return ctx;
}

export default function OnboardingLayout() {
  const [name, setName] = useState('');
  const [lists, setLists] = useState<OnboardingLists>(EMPTY_LISTS);
  const [plan, setPlan] = useState<OnboardingPlan | null>(null);

  const value = useMemo<OnboardingDraft>(
    () => ({ name, setName, lists, setLists, plan, setPlan }),
    [name, lists, plan],
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
        <Stack.Screen name="review" />
      </Stack>
    </OnboardingContext.Provider>
  );
}
