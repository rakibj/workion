import { Helmet } from "react-helmet-async";
import { getAppName } from "@/lib/config.ts";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import BillingPlans from "@/ee/billing/components/billing-plans.tsx";
import ManageBilling from "@/ee/billing/components/manage-billing.tsx";
import { Divider } from "@mantine/core";
import useUserRole from "@/hooks/use-user-role.tsx";

export default function Billing() {
  const { isAdmin } = useUserRole();

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>Billing - {getAppName()}</title>
      </Helmet>
      <SettingsTitle title="Billing" />

      <BillingPlans />
      <Divider my="lg" />
      <ManageBilling />
    </>
  );
}
