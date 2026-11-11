import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import {
  billingAvailable,
  getPlanPrices,
  hasActiveEntitlement,
  identifyBillingUser,
  onEntitlementChange,
  openManageSubscriptions,
  purchasePlan,
  restorePurchases,
  type ProPlan,
} from '@/lib/billing';
import { qk } from '@/lib/queryClient';
import type { Profile } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from './profile';

/**
 * Trove Pro entitlement for the signed-in person.
 *
 * Source of truth is profiles.is_pro, which the revenuecat-webhook edge
 * function mirrors from RevenueCat (the client can't write it — migration
 * 0037). On iPhone we also trust RevenueCat's live answer, so Pro unlocks the
 * moment a purchase or restore completes instead of waiting for the webhook.
 * Only owners/organisers ever need this — invited members use every circle
 * they're in for free.
 */
export function usePro(): { isPro: boolean; isLoading: boolean } {
  const { data: profile, isLoading } = useProfile();
  const live = useSyncExternalStore(subscribeLive, getLive, getLive);
  return { isPro: (profile?.is_pro ?? false) || live, isLoading };
}

// RevenueCat's live entitlement, shared across hooks.
let liveActive = false;
const liveListeners = new Set<() => void>();
function setLive(value: boolean) {
  if (liveActive === value) return;
  liveActive = value;
  liveListeners.forEach((l) => l());
}
function subscribeLive(listener: () => void) {
  liveListeners.add(listener);
  return () => liveListeners.delete(listener);
}
function getLive() {
  return liveActive;
}

/**
 * Mount once inside AuthProvider + QueryClientProvider. Logs RevenueCat in as
 * the Supabase user and keeps the live entitlement current.
 */
export function BillingSync() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!billingAvailable) return;
    let cancelled = false;
    setLive(false);
    identifyBillingUser(userId).then(async () => {
      if (!userId || cancelled) return;
      const active = await hasActiveEntitlement();
      if (!cancelled) setLive(active);
    });
    const off = onEntitlementChange((active) => {
      setLive(active);
      if (userId) qc.invalidateQueries({ queryKey: qk.profile(userId) });
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [userId, qc]);
  return null;
}

/** Store prices for the paywall, localised; falls back to the US list prices. */
export function usePlanPrices(): Record<ProPlan, string> {
  const { data } = useQuery({
    queryKey: ['pro', 'prices'],
    enabled: billingAvailable,
    staleTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: getPlanPrices,
  });
  return {
    annual: data?.annual?.priceString ?? PRO_PLANS.annual.price,
    monthly: data?.monthly?.priceString ?? PRO_PLANS.monthly.price,
  };
}

function useAfterUnlock() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return () => {
    setLive(true);
    if (!userId) return;
    qc.setQueryData<Profile | null>(qk.profile(userId), (prev) =>
      prev ? { ...prev, is_pro: true } : prev,
    );
    // The webhook usually lands within seconds; pick up the server truth.
    setTimeout(() => qc.invalidateQueries({ queryKey: qk.profile(userId) }), 4000);
  };
}

/** Start the free trial / subscribe through the App Store. */
export function usePurchasePro() {
  const unlock = useAfterUnlock();
  return useMutation({
    mutationFn: (plan: ProPlan) => purchasePlan(plan),
    onSuccess: (outcome) => {
      if (outcome.status === 'purchased') unlock();
    },
  });
}

/** Restore an earlier App Store purchase (new phone, reinstall). */
export function useRestorePro() {
  const unlock = useAfterUnlock();
  return useMutation({
    mutationFn: restorePurchases,
    onSuccess: (active) => {
      if (active) unlock();
    },
  });
}

export { billingAvailable, openManageSubscriptions };

export const PRO_PLANS = {
  annual: { price: '$79.99', per: 'year', note: 'Save 33%' },
  monthly: { price: '$9.99', per: 'month', note: '' },
} as const;

export const PRO_TRIAL_DAYS = 14;

// Free usage caps. Chosen to bite only once someone is genuinely using Trove —
// never during onboarding or the first days. Easy to tune.
/** Circles a free person can own, on top of their Personal circle. */
export const FREE_CIRCLES = 3;
/** Items a free person can hold on Today at once. */
export const FREE_TODAY_ITEMS = 15;
