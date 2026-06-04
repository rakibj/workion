import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { SetupWorkspaceForm } from "@/features/auth/components/setup-workspace-form.tsx";
import { Helmet } from "react-helmet-async";
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import APP_ROUTE from "@/lib/app-route.ts";
import { getAppName } from "@/lib/config.ts";
import { useTranslation } from "react-i18next";
import { useSetupConfigQuery } from "@/features/auth/queries/auth-query.tsx";

export default function SetupWorkspace() {
  const { t } = useTranslation();
  const {
    data: workspace,
    isLoading,
    isError,
    error,
  } = useWorkspacePublicDataQuery();

  const { data: setupConfig, isLoading: isConfigLoading } = useSetupConfigQuery();

  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isConfigLoading && workspace && !setupConfig?.allowSignup) {
      navigate(APP_ROUTE.AUTH.LOGIN);
    }
  }, [isLoading, isConfigLoading, workspace, setupConfig]);

  if (isLoading || isConfigLoading) {
    return <div></div>;
  }

  if (
    setupConfig?.allowSignup ||
    (isError &&
      error?.["response"]?.status === 404 &&
      error?.["response"]?.data.message.includes("Workspace not found"))
  ) {
    return (
      <>
        <Helmet>
          <title>
            {t("Setup Workspace")} - {getAppName()}
          </title>
        </Helmet>
        <SetupWorkspaceForm />
      </>
    );
  }

  return null;
}
