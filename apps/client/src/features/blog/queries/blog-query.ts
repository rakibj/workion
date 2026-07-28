import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBlogPostSettings,
  publishBlogPost,
  saveBlogPostSettings,
  unpublishBlogPost,
} from "@/features/blog/services/blog-service";
import { IBlogPostSettings } from "@/features/blog/types/blog.types";

export function useBlogPostSettingsQuery(pageId?: string) {
  return useQuery({
    queryKey: ["blog-post-settings", pageId],
    queryFn: () => getBlogPostSettings(pageId!),
    enabled: !!pageId,
  });
}

export function useSaveBlogPostSettingsMutation(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IBlogPostSettings>) =>
      saveBlogPostSettings(pageId, data),
    onSuccess: (data) =>
      queryClient.setQueryData(["blog-post-settings", pageId], data),
  });
}

export function usePublishBlogPostMutation(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (robotsIndex: boolean) => publishBlogPost(pageId, robotsIndex),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["share-for-page", pageId] }),
  });
}

export function useUnpublishBlogPostMutation(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unpublishBlogPost(pageId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["share-for-page", pageId] }),
  });
}
