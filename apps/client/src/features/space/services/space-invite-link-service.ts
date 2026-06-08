import api from "@/lib/api-client";

export interface ISpaceInviteLink {
  id: string;
  spaceId: string;
  workspaceId: string;
  token: string;
  spaceRole: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  disabled: boolean;
  createdAt: string;
  inviteUrl: string;
}

export interface ICreateSpaceInviteLink {
  spaceId: string;
  spaceRole: "none" | "reader" | "writer";
  expiresAt?: string;
  maxUses?: number;
}

export interface IInviteLinkPublicInfo {
  token: string;
  spaceName: string;
  spaceDescription: string | null;
  workspaceName: string;
  spaceRole: string;
  expiresAt: string | null;
  isExpired: boolean;
  isDisabled: boolean;
}

export interface IGuestSignup {
  token: string;
  name?: string;
  email: string;
  password: string;
}

export async function createSpaceInviteLink(
  data: ICreateSpaceInviteLink,
): Promise<ISpaceInviteLink> {
  const req = await api.post<ISpaceInviteLink>(
    "/spaces/invite-links/create",
    data,
  );
  return req.data;
}

export async function listSpaceInviteLinks(
  spaceId: string,
): Promise<ISpaceInviteLink[]> {
  const req = await api.post<ISpaceInviteLink[]>("/spaces/invite-links/list", {
    spaceId,
  });
  return req.data;
}

export async function deleteSpaceInviteLink(
  spaceId: string,
  linkId: string,
): Promise<void> {
  await api.post("/spaces/invite-links/delete", { spaceId, linkId });
}

export async function getInviteLinkPublicInfo(
  token: string,
): Promise<IInviteLinkPublicInfo> {
  const req = await api.get<IInviteLinkPublicInfo>(
    `/auth/invite-link/${token}`,
  );
  return req.data;
}

export async function guestSignup(data: IGuestSignup): Promise<void> {
  await api.post("/auth/invite-link/signup", data);
}

export async function guestJoin(token: string): Promise<void> {
  await api.post("/auth/invite-link/join", { token });
}
