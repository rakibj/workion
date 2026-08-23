export enum BillingPlan {
  STANDARD = "standard",
  BUSINESS = "business",
}

export interface IBilling {
  id: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: string;
  quantity: number;
  amount: number;
  interval: string;
  currency: string;
  metadata: Record<string, any>;
  stripePriceId: string;
  stripeItemId: string;
  stripeProductId: string;
  periodStartAt: Date;
  periodEndAt: Date;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date;
  canceledAt: Date;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  billingScheme: string | null;
  tieredUpTo: string | null;
  tieredFlatAmount: number | null;
  tieredUnitAmount: number | null;
  planName: string | null;
}

export interface ICheckoutLink {
  url: string;
}

export interface IBillingPortal {
  url: string;
}

export interface IBillingPlan {
  id: string;
  /** Legacy display component compatibility; Lemon plans identify variants instead. */
  productId?: string;
  name: string;
  description: string;
  monthlyId: string | null;
  yearlyId: string | null;
  price: {
    monthly: string;
    yearly: string | null;
  };
  features: string[];
}
