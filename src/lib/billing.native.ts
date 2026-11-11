// Native billing through RevenueCat (react-native-purchases).
//
// - Configured once with the public iOS SDK key (EXPO_PUBLIC_REVENUECAT_IOS_KEY,
//   safe to ship in the app).
// - Logged in with the Supabase user id, so RevenueCat's app_user_id is a
//   profiles.id and the revenuecat-webhook edge function can mirror the "pro"
//   entitlement into profiles.is_pro.
// - Offering "default" holds $rc_annual (trove_pro_annual) and $rc_monthly
//   (trove_pro_monthly), both with a 14-day free trial set in App Store Connect.
import { Linking, Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type PurchasesPackage,
} from 'react-native-purchases';

import type { PlanPrice, ProPlan, PurchaseOutcome } from './billing.types';

export type { PlanPrice, ProPlan, PurchaseOutcome } from './billing.types';

const ENTITLEMENT = 'pro';
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';

export const billingAvailable = Platform.OS === 'ios' && IOS_KEY.length > 0;

let configured = false;
let currentUser: string | null = null;

function ensureConfigured(): boolean {
  if (!billingAvailable) return false;
  if (!configured) {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: IOS_KEY, appUserID: currentUser ?? undefined });
    configured = true;
  }
  return true;
}

function isActive(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements.active[ENTITLEMENT];
}

export async function identifyBillingUser(userId: string | null): Promise<void> {
  if (!billingAvailable) return;
  if (!configured) {
    currentUser = userId;
    ensureConfigured();
    return;
  }
  if (userId === currentUser) return;
  try {
    if (userId) await Purchases.logIn(userId);
    else if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  } catch {
    // Network blips: RevenueCat retries on the next call.
  }
  currentUser = userId;
}

async function packages(): Promise<Partial<Record<ProPlan, PurchasesPackage>>> {
  if (!ensureConfigured()) return {};
  const offerings = await Purchases.getOfferings();
  const offering = offerings.current ?? offerings.all['default'];
  if (!offering) return {};
  return {
    annual: offering.annual ?? undefined,
    monthly: offering.monthly ?? undefined,
  };
}

export async function getPlanPrices(): Promise<Partial<Record<ProPlan, PlanPrice>>> {
  const pkgs = await packages();
  const out: Partial<Record<ProPlan, PlanPrice>> = {};
  for (const plan of ['annual', 'monthly'] as const) {
    const p = pkgs[plan];
    if (p) out[plan] = { priceString: p.product.priceString };
  }
  return out;
}

export async function purchasePlan(plan: ProPlan): Promise<PurchaseOutcome> {
  const pkgs = await packages();
  const pkg = pkgs[plan];
  if (!pkg) throw new Error('The App Store isn’t answering right now. Try again in a moment.');
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { status: isActive(customerInfo) ? 'purchased' : 'pending' };
  } catch (e) {
    const err = e as { userCancelled?: boolean; code?: string };
    if (err.userCancelled || err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return { status: 'cancelled' };
    }
    if (err.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return { status: 'pending' };
    throw e;
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (!ensureConfigured()) return false;
  const info = await Purchases.restorePurchases();
  return isActive(info);
}

export async function hasActiveEntitlement(): Promise<boolean> {
  if (!ensureConfigured()) return false;
  try {
    return isActive(await Purchases.getCustomerInfo());
  } catch {
    return false;
  }
}

export function onEntitlementChange(cb: (active: boolean) => void): () => void {
  if (!ensureConfigured()) return () => {};
  const listener = (info: CustomerInfo) => cb(isActive(info));
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

export async function openManageSubscriptions(): Promise<void> {
  try {
    if (ensureConfigured()) {
      await Purchases.showManageSubscriptions();
      return;
    }
  } catch {
    // fall through to the App Store page
  }
  await Linking.openURL('https://apps.apple.com/account/subscriptions');
}
