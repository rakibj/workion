import SettingsTitle from "@/components/settings/settings-title.tsx";
import GroupMembersList from "@/features/group/components/group-members";
import GroupDetails from "@/features/group/components/group-details";
import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import useUserRole from "@/hooks/use-user-role.tsx";

export default function GroupInfo() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();

  if (!isAdmin) return null;

  return (
    <>
      <Helmet>
        <title>
          {t("Manage Group")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("Manage Group")} />
      <GroupDetails />
      <GroupMembersList />
    </>
  );
}
