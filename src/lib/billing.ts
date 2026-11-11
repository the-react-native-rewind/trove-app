// Web (and any platform without in-app purchase): Trove Pro can only be bought
// in the iPhone app. Everything here is a calm no-op so the paywall can explain
// that instead of breaking. The native build uses billing.native.ts.
import type { PlanPrice, ProPlan, PurchaseOutcome } from './billing.types';

export type { PlanPrice, ProPlan, PurchaseOutcome } from './billing.types';

/** True when this build can sell Trove Pro through the App Store. */
export const billingAvailable = false;

export async function identifyBillingUser(_userId: string | null): Promise<void> {}

export async function getPlanPrices(): Promise<Partial<Record<ProPlan, PlanPrice>>> {
  return {};
}

export async function purchasePlan(_plan: ProPlan): Promise<PurchaseOutcome> {
  throw new Error('Trove Pro is available in the Trove iPhone app.');
}

/** Returns whether the restored purchases include an active Trove Pro. */
export async function restorePurchases(): Promise<boolean> {
  return false;
}

export async function hasActiveEntitlement(): Promise<boolean> {
  return false;
}

export function onEntitlementChange(_cb: (active: boolean) => void): () => void {
  return () => {};
}

export async function openManageSubscriptions(): Promise<void> {}
