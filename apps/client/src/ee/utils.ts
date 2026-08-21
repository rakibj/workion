import { getServerAppUrl, getSubdomainHost } from "@/lib/config.ts";

export function getHostnameUrl(hostname: string): string {
  const url = new URL(getServerAppUrl());
  const isHttps = url.protocol === "https:";

  const protocol = isHttps ? "https" : "http";
  // Preserve a non-default port (e.g. local dev's SERVER_URL=http://localhost:3000).
  // In production Caddy fronts everything on 80/443 so url.port is empty and this
  // is a no-op; dropping it unconditionally broke every local cloud-mode test.
  const port = url.port ? `:${url.port}` : "";
  return `${protocol}://${hostname}.${getSubdomainHost()}${port}`;
}

export function exchangeTokenRedirectUrl(
  hostname: string,
  exchangeToken: string,
) {
  return getHostnameUrl(hostname) + "/api/auth/exchange?token=" + exchangeToken;
}
