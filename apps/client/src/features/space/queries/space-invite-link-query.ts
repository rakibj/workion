import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSpaceInviteLink,
  deleteSpaceInviteLink,
  getInviteLinkPublicInfo,
  ICreateSpaceInviteLink,
  listSpaceInviteLinks,
} from "@/features/space/services/space-invite-link-service";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

export function useSpaceInviteLinksQuery(spaceId: string) {
  return useQuery({
    queryKey: ["spaceInviteLinks", spaceId],
    queryFn: () => listSpaceInviteLinks(spaceId),
    enabled: !!spaceId,
  });
}

export function useCreateSpaceInviteLinkMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: ICreateSpaceInviteLink) => createSpaceInviteLink(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["spaceInviteLinks", variables.spaceId],
      });
      notifications.show({ message: t("Invite link created") });
    },
    onError: (error) => {
      notifications.show({
        message: error["response"]?.data?.message,
        color: "red",
      });
    },
  });
}

export function useDeleteSpaceInviteLinkMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ spaceId, linkId }: { spaceId: string; linkId: string }) =>
      deleteSpaceInviteLink(spaceId, linkId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["spaceInviteLinks", variables.spaceId],
      });
      notifications.show({ message: t("Invite link deleted") });
    },
    onError: (error) => {
      notifications.show({
        message: error["response"]?.data?.message,
        color: "red",
      });
    },
  });
}

export function useInviteLinkPublicInfoQuery(token: string) {
  return useQuery({
    queryKey: ["inviteLinkPublicInfo", token],
    queryFn: () => getInviteLinkPublicInfo(token),
    enabled: !!token,
    retry: false,
  });
}
