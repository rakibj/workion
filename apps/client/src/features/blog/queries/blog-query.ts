import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBlogCategories,
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

export function useBlogCategoriesQuery(spaceId?: string) {
  return useQuery({
    queryKey: ["blog-categories", spaceId],
    queryFn: () => getBlogCategories(spaceId!),
    enabled: !!spaceId,
  });
}

export function useSaveBlogPostSettingsMutation(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IBlogPostSettings>) =>
      saveBlogPostSettings(pageId, data),
    onSuccess: (data) => {
      queryClient.setQueryData(["blog-post-settings", pageId], data);
      queryClient.invalidateQueries({
        queryKey: ["blog-categories", data.spaceId],
      });
    },
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
