import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getAppUrl, getServerAppUrl, isCloud } from "@/lib/config.ts";
import APP_ROUTE from "@/lib/app-route.ts";

export const useRedirectToCloudSelect = () => {
  const navigate = useNavigate();
  const pathname = useLocation().pathname;

  useEffect(() => {
    const pathsToRedirect = ["/login", "/home"];
    if (isCloud() && pathsToRedirect.includes(pathname)) {
      const frontendUrl = getAppUrl();
      const serverUrl = getServerAppUrl();
      if (frontendUrl === serverUrl) {
        // SELECT_WORKSPACE ("already part of a workspace? sign in") needs
        // POST /workspace/joined and /workspace/find-by-email, which don't
        // have a backend implementation (specs/MULTI_TENANCY_SPEC.md is
        // scoped to signup, not the cross-workspace switcher) — send an
        // unauthenticated apex visitor to create a workspace instead of a
        // page that 404s.
        navigate(APP_ROUTE.AUTH.CREATE_WORKSPACE);
      }
    }
  }, [navigate]);
};
