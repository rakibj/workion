import { ISpace } from "@/features/space/types/space.types";

export type ClientStatus = "active" | "archived";
export type ProjectStatus =
  | "planning"
  | "in_progress"
  | "in_review"
  | "approved"
  | "delivered"
  | "archived";

export interface IClient {
  id: string;
  workspaceId: string;
  name: string;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
  contactCount?: number;
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

export interface IProject {
  id: string;
  workspaceId: string;
  clientId: string;
  spaceId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IClientDetail {
  client: IClient;
  spaces: ISpace[];
  projects: IProject[];
  contacts: IClientContact[];
  canManage: boolean;
}

export type CreateClientInput = { name: string; spaceId: string };
export type CreateProjectInput = {
  clientId: string;
  spaceId: string;
  name: string;
  description?: string;
  dueDate?: string;
};
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
