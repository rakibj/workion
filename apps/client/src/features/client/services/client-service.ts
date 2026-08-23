import api from "@/lib/api-client";
import {
  CreateClientInput,
  CreateProjectInput,
  IClient,
  IClientDetail,
  IProject,
  ProjectStatus,
  IClientContact,
  CreateClientContactInput,
  UpdateClientContactInput,
} from "../types/client.types";

export async function getClients(): Promise<IClient[]> {
  const req = await api.get<IClient[]>("/clients");
  return req.data;
}

export async function getClient(clientId: string): Promise<IClientDetail> {
  const req = await api.get<IClientDetail>(`/clients/${clientId}`);
  return req.data;
}

export async function getClientBySpace(
  spaceId: string,
): Promise<IClient | null> {
  const req = await api.get<IClient | null>(`/clients/by-space/${spaceId}`);
  return req.data;
}

export async function archiveClient(clientId: string): Promise<void> {
  await api.delete(`/clients/${clientId}`);
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`/projects/${projectId}`);
}

export async function createClient(data: CreateClientInput): Promise<IClient> {
  const req = await api.post<IClient>("/clients", data);
  return req.data;
}

export async function linkClientSpace(
  clientId: string,
  spaceId: string,
): Promise<void> {
  await api.post(`/clients/${clientId}/spaces`, { spaceId });
}

export async function unlinkClientSpace(
  clientId: string,
  spaceId: string,
): Promise<void> {
  await api.delete(`/clients/${clientId}/spaces/${spaceId}`);
}

export async function createProject(
  data: CreateProjectInput,
): Promise<IProject> {
  const req = await api.post<IProject>("/projects", data);
  return req.data;
}

export async function updateProject(
  projectId: string,
  data: Partial<Pick<IProject, "name" | "description" | "status" | "dueDate">>,
): Promise<IProject> {
  const req = await api.patch<IProject>(`/projects/${projectId}`, data);
  return req.data;
}

export async function getProjects(filters?: {
  clientId?: string;
  spaceId?: string;
  status?: ProjectStatus;
}): Promise<IProject[]> {
  const req = await api.get<IProject[]>("/projects", { params: filters });
  return req.data;
}

export async function getProject(projectId: string): Promise<IProject> {
  const req = await api.get<IProject>(`/projects/${projectId}`);
  return req.data;
}

export async function createClientContact(
  clientId: string,
  data: CreateClientContactInput,
): Promise<IClientContact> {
  const req = await api.post<IClientContact>(
    `/clients/${clientId}/contacts`,
    data,
  );
  return req.data;
}

export async function updateClientContact(
  clientId: string,
  contactId: string,
  data: UpdateClientContactInput,
): Promise<IClientContact> {
  const req = await api.patch<IClientContact>(
    `/clients/${clientId}/contacts/${contactId}`,
    data,
  );
  return req.data;
}

export async function deleteClientContact(
  clientId: string,
  contactId: string,
): Promise<void> {
  await api.delete(`/clients/${clientId}/contacts/${contactId}`);
}
