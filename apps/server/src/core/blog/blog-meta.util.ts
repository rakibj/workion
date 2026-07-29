export function blogMeta(post: any, origin: string, pathPrefix: string) {
  const title = post.metaTitle || post.title;
  const canonical =
    post.canonicalUrl ||
    `${origin}${pathPrefix}/${encodeURIComponent(post.slug)}`;
  return {
    title,
    description: post.metaDescription ?? null,
    canonical,
    robots: `${post.robotsIndex ? 'index' : 'noindex'},${post.robotsFollow ? 'follow' : 'nofollow'}`,
    ogTitle: title,
    ogDescription: post.metaDescription ?? null,
    twitterCard: 'summary_large_image',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: title,
      author: {
        '@type': 'Person',
        name: post.author?.name ?? post.authorName ?? 'Unknown',
      },
      datePublished: new Date(post.publishedAt).toISOString(),
      dateModified: new Date(post.updatedAt).toISOString(),
      mainEntityOfPage: canonical,
    },
  };
}
