import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  archiveClient,
  createClient,
  getClient,
  getClientBySpace,
  getClients,
  linkClientSpace,
  unlinkClientSpace,
  createClientContact,
  updateClientContact,
  deleteClientContact,
  addClientMember,
  getClientMemberUserIds,
  removeClientMember,
} from "../services/client-service";
import {
  CreateClientInput,
  CreateClientContactInput,
  UpdateClientContactInput,
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

export const useClientBySpaceQuery = (spaceId: string) =>
  useQuery({
    queryKey: ["client-by-space", spaceId],
    queryFn: () => getClientBySpace(spaceId),
    enabled: !!spaceId,
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

export function useArchiveClientMutation() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (clientId: string) => archiveClient(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      notifications.show({ message: t("Client deleted") });
      navigate("/clients");
    },
    onError: showError,
  });
}

export function useCreateClientContactMutation(clientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateClientContactInput) =>
      createClientContact(clientId, data),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["client", clientId] }),
    onError: showError,
  });
}

export function useUpdateClientContactMutation(clientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      contactId,
      data,
    }: {
      contactId: string;
      data: UpdateClientContactInput;
    }) => updateClientContact(clientId, contactId, data),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["client", clientId] }),
    onError: showError,
  });
}

export function useDeleteClientContactMutation(clientId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) => deleteClientContact(clientId, contactId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["client", clientId] }),
    onError: showError,
  });
}

export function useAddClientMemberMutation(clientId: string, spaceId: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (userId: string) => addClientMember(clientId, spaceId, userId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["client", clientId] });
      client.invalidateQueries({
        queryKey: ["client-member-user-ids", clientId, spaceId],
      });
      notifications.show({ message: t("Added to client") });
    },
    onError: showError,
  });
}

export const useClientMemberUserIdsQuery = (
  clientId: string,
  spaceId: string,
) =>
  useQuery({
    queryKey: ["client-member-user-ids", clientId, spaceId],
    queryFn: () => getClientMemberUserIds(clientId, spaceId),
    enabled: !!clientId && !!spaceId,
  });

export function useRemoveClientMemberMutation(
  clientId: string,
  spaceId: string,
) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (userId: string) =>
      removeClientMember(clientId, spaceId, userId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["client", clientId] });
      client.invalidateQueries({
        queryKey: ["client-member-user-ids", clientId, spaceId],
      });
      notifications.show({ message: t("Removed from client") });
    },
    onError: showError,
  });
}
