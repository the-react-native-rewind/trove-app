import { useMutation, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from './profile';

/**
 * Trove Pro entitlement for the signed-in person. Reads the mirrored
 * `profiles.is_pro` flag. Only owners/organisers ever need this — invited
 * members use every circle they're in for free.
 */
export function usePro(): { isPro: boolean; isLoading: boolean } {
  const { data: profile, isLoading } = useProfile();
  return { isPro: profile?.is_pro ?? false, isLoading };
}

// --- Placeholder billing ------------------------------------------------------
// These stubs flip the entitlement locally so the paywall and gates can be seen
// end to end. Replace the bodies with RevenueCat (react-native-purchases):
// present the offering, run the purchase, and let the RevenueCat webhook mirror
// the entitlement into profiles.is_pro. The UI below does not change.

async function setPro(userId: string | null, value: boolean) {
  if (!userId) return;
  await supabase.from('profiles').update({ is_pro: value }).eq('id', userId);
}

/** STUB: start the trial / subscribe. Swap for a RevenueCat purchase. */
export function useStartTrial() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_plan: 'monthly' | 'annual') => {
      await setPro(userId, true);
    },
    onMutate: () => {
      if (userId) {
        qc.setQueryData<Profile | null>(qk.profile(userId), (prev) =>
          prev ? { ...prev, is_pro: true } : prev,
        );
      }
    },
    onSettled: () => {
      if (userId) qc.invalidateQueries({ queryKey: qk.profile(userId) });
    },
  });
}

/** STUB: drop back to free, so Pro state is easy to test. Remove with billing. */
export function useCancelProStub() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await setPro(userId, false);
    },
    onMutate: () => {
      if (userId) {
        qc.setQueryData<Profile | null>(qk.profile(userId), (prev) =>
          prev ? { ...prev, is_pro: false } : prev,
        );
      }
    },
    onSettled: () => {
      if (userId) qc.invalidateQueries({ queryKey: qk.profile(userId) });
    },
  });
}

export const PRO_PLANS = {
  annual: { price: '$79.99', per: 'year', note: 'Two months free' },
  monthly: { price: '$9.99', per: 'month', note: '' },
} as const;

export const PRO_TRIAL_DAYS = 14;

// Free usage caps. Chosen to bite only once someone is genuinely using Trove —
// never during onboarding or the first days. Easy to tune.
/** Circles a free person can own, on top of their Personal circle. */
export const FREE_CIRCLES = 2;
/** Items a free person can hold on Today at once. */
export const FREE_TODAY_ITEMS = 15;
