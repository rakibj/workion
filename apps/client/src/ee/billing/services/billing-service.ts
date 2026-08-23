import api from "@/lib/api-client.ts";
import {
  IBilling,
  IBillingPlan,
  IBillingPortal,
  ICheckoutLink,
} from "@/ee/billing/types/billing.types.ts";

export async function getBillingPlans(): Promise<IBillingPlan[]> {
  const req = await api.get<IBillingPlan[]>("/billing/plans");
  return req.data;
}

export async function getCheckoutLink(data: {
  variantId: string;
}): Promise<ICheckoutLink> {
  const req = await api.post<ICheckoutLink>("/billing/checkout", data);
  return req.data;
}

export async function getBillingPortalLink(): Promise<IBillingPortal> {
  const req = await api.get<IBillingPortal>("/billing/portal");
  return req.data;
}
export async function getBilling(): Promise<IBilling | null> {
  const req = await api.get<IBilling | null>("/billing/info");
  return req.data;
}
