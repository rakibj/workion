import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createClient,
  createProject,
  getClient,
  getClients,
  getProject,
  linkClientSpace,
  unlinkClientSpace,
  updateProject,
} from "../services/client-service";
import {
  CreateClientInput,
  CreateProjectInput,
  IProject,
} from "../types/client.types";

const showError = (error: any) =>
  notifications.show({
    message: error?.response?.data?.message ?? "Something went wrong",
    color: "red",
  });

export const useClientsQuery = () =>
  useQuery({ queryKey: ["clients"], queryFn: getClients });

export const useClientQuery = (clientId: string) =>
  useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClient(clientId),
    enabled: !!clientId,
  });

export const useProjectQuery = (projectId: string) =>
  useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: !!projectId,
  });

export function useCreateClientMutation() {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (data: CreateClientInput) => createClient(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["clients"] });
      notifications.show({ message: t("Client created successfully") });
    },
    onError: showError,
  });
}

export function useLinkClientSpaceMutation(clientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (spaceId: string) => linkClientSpace(clientId, spaceId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["client", clientId] }),
    onError: showError,
  });
}

export function useUnlinkClientSpaceMutation(clientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (spaceId: string) => unlinkClientSpace(clientId, spaceId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["client", clientId] }),
    onError: showError,
  });
}

export function useCreateProjectMutation(clientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectInput) => createProject(data),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["client", clientId] }),
    onError: showError,
  });
}

export function useUpdateProjectMutation(clientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: Partial<IProject>;
    }) => updateProject(projectId, data),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["client", clientId] }),
    onError: showError,
  });
}
