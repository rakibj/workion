import { ISpace } from "@/features/space/types/space.types";

export type ClientStatus = "active" | "archived";

export interface IClient {
  id: string;
  workspaceId: string;
  name: string;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
  contactCount?: number;
}

export interface IClientListItem extends IClient {
  spaces: ISpace[];
}

export type ClientContactSource = "manual" | "guest_invite";

export interface IClientContact {
  id: string;
  workspaceId: string;
  clientId: string;
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  isPrimary: boolean;
  source: ClientContactSource;
  createdAt: string;
  updatedAt: string;
}

export interface IClientDetail {
  client: IClient;
  spaces: ISpace[];
  contacts: IClientContact[];
  canManage: boolean;
}

export type CreateClientInput = { name: string; spaceId: string };
export type CreateClientContactInput = {
  name: string;
  email: string;
  phone?: string;
  title?: string;
  isPrimary?: boolean;
};
export type UpdateClientContactInput = {
  name?: string;
  email?: string;
  phone?: string | null;
  title?: string | null;
  isPrimary?: boolean;
};
