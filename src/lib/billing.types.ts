export type ProPlan = 'annual' | 'monthly';

export type PlanPrice = {
  /** Localised store price, e.g. "$79.99" or "79,99 €". */
  priceString: string;
};

export type PurchaseOutcome = { status: 'purchased' | 'cancelled' | 'pending' };
