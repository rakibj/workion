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
  customFields?: Record<string, boolean | number | string>;
  tags?: string[];
  category?: string | null;
  featured: boolean;
  priority: number;
}
