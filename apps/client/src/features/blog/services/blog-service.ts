import api from "@/lib/api-client";
import { IBlogPostSettings } from "@/features/blog/types/blog.types";

export async function getBlogPostSettings(pageId: string) {
  const response = await api.get<IBlogPostSettings | null>(
    `/blog/posts/${pageId}/settings`,
  );
  return response.data;
}

export async function saveBlogPostSettings(
  pageId: string,
  data: Partial<IBlogPostSettings>,
) {
  const response = await api.post<IBlogPostSettings>(
    `/blog/posts/${pageId}/settings`,
    data,
  );
  return response.data;
}

export async function publishBlogPost(pageId: string, robotsIndex: boolean) {
  const response = await api.post(`/blog/posts/${pageId}/publish`, {
    robotsIndex,
  });
  return response.data;
}

export async function unpublishBlogPost(pageId: string) {
  await api.post(`/blog/posts/${pageId}/unpublish`);
}
