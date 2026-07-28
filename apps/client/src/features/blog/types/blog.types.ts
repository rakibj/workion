export interface IBlogPostSettings {
  pageId: string;
  spaceId: string;
  slug: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImageAttachmentId?: string | null;
  canonicalUrl?: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  focusKeyword?: string | null;
}
