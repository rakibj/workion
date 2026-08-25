import {
  ActionIcon,
  Autocomplete,
  Button,
  Divider,
  FileButton,
  Group,
  Modal,
  NumberInput,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { IconExternalLink, IconSparkles } from "@tabler/icons-react";
import {
  useBlogCategoriesQuery,
  useBlogPostSettingsQuery,
  useGenerateBlogSeoMutation,
  usePublishBlogPostMutation,
  useSaveBlogPostSettingsMutation,
  useUnpublishBlogPostMutation,
} from "@/features/blog/queries/blog-query";
import { useShareForPageQuery } from "@/features/share/queries/share-query";
import { uploadFile } from "@/features/page/services/page-service";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { getAiStatus } from "@/features/workspace/services/workspace-service";
import { getAppUrl, getBlogDomainOrigin } from "@/lib/config";
import CopyTextButton from "@/components/common/copy";

// Mirrors RESERVED_BLOG_CUSTOM_FIELD_KEYS server-side (blog-post-settings.dto.ts) —
// space-level custom fields reusing these keys are rejected on save, but older
// data saved before that check existed can still have them; hide instead of
// rendering the same field twice.
const RESERVED_CUSTOM_FIELD_KEYS = new Set([
  "slug",
  "metatitle",
  "metadescription",
  "ogimageattachmentid",
  "canonicalurl",
  "robotsindex",
  "robotsfollow",
  "focuskeyword",
  "tags",
  "category",
  "featured",
  "priority",
]);

// Mirrors RESERVED_BLOG_CUSTOM_FIELD_LABELS server-side — keys are
// constrained ([a-zA-Z][a-zA-Z0-9_]*) so a custom field can dodge the key
// check above (e.g. key "featuredOnHome") while its free-text label still
// reads as the same built-in field ("Featured on Home" vs. the built-in
// "Featured on home"). Match on normalized label too.
const RESERVED_CUSTOM_FIELD_LABELS = new Set([
  "slug",
  "meta title",
  "meta description",
  "og image attachment id",
  "canonical url",
  "allow search indexing",
  "allow search engines to follow links",
  "focus keyword",
  "tags",
  "category",
  "featured on home",
  "priority",
]);

function normalizeFieldLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

const COMBINING_MARKS_PATTERN = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g",
);

function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(COMBINING_MARKS_PATTERN, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

export function BlogSettingsModal({
  pageId,
  spaceId,
  title,
  opened,
  onClose,
}: {
  pageId: string;
  spaceId: string;
  title: string;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: settings } = useBlogPostSettingsQuery(pageId);
  const { data: share } = useShareForPageQuery(pageId);
  const { data: space } = useSpaceQuery(settings?.spaceId ?? spaceId);
  const { data: categories = [] } = useBlogCategoriesQuery(spaceId);
  const { data: aiStatus } = useQuery({
    queryKey: ["ai-status"],
    queryFn: getAiStatus,
  });
  const save = useSaveBlogPostSettingsMutation(pageId);
  const publish = usePublishBlogPostMutation(pageId);
  const unpublish = useUnpublishBlogPostMutation(pageId);
  const generateSeo = useGenerateBlogSeoMutation(pageId);
  const form = useForm({
    initialValues: {
      slug: "",
      metaTitle: "",
      metaDescription: "",
      ogImageAttachmentId: "",
      canonicalUrl: "",
      focusKeyword: "",
      robotsIndex: true,
      robotsFollow: true,
      customFields: {} as Record<string, boolean | number | string>,
      tags: [] as string[],
      category: "",
      featured: false,
      priority: 0,
    },
  });

  const customFieldDefs = (space?.settings?.blog?.customFields ?? []).filter(
    (field) =>
      !RESERVED_CUSTOM_FIELD_KEYS.has(field.key.toLowerCase()) &&
      !RESERVED_CUSTOM_FIELD_LABELS.has(normalizeFieldLabel(field.label)),
  );
  const defaultForType = (type: "boolean" | "number" | "text") =>
    type === "boolean" ? false : type === "number" ? 0 : "";

  const uploadOgImage = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      form.setFieldError("ogImageAttachmentId", t("Choose an image file"));
      return;
    }
    try {
      const attachment = await uploadFile(file, pageId);
      form.setFieldValue("ogImageAttachmentId", attachment.id);
      form.clearFieldError("ogImageAttachmentId");
      notifications.show({ message: t("OG image uploaded") });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error["response"]?.data?.message ?? t("Unable to upload image"),
      });
    }
  };

  useEffect(() => {
    const defaultCustomFields = Object.fromEntries(
      customFieldDefs.map((field) => [
        field.key,
        settings?.customFields?.[field.key] ?? defaultForType(field.type),
      ]),
    );
    form.setValues(
      settings
        ? {
            slug: settings.slug,
            metaTitle: settings.metaTitle ?? "",
            metaDescription: settings.metaDescription ?? "",
            ogImageAttachmentId: settings.ogImageAttachmentId ?? "",
            canonicalUrl: settings.canonicalUrl ?? "",
            focusKeyword: settings.focusKeyword ?? "",
            robotsIndex: settings.robotsIndex,
            robotsFollow: settings.robotsFollow,
            customFields: defaultCustomFields,
            tags: settings.tags ?? [],
            category: settings.category ?? "",
            featured: settings.featured,
            priority: settings.priority,
          }
        : {
            slug: "",
            metaTitle: "",
            metaDescription: "",
            ogImageAttachmentId: "",
            canonicalUrl: "",
            focusKeyword: "",
            robotsIndex: true,
            robotsFollow: true,
            customFields: defaultCustomFields,
            tags: [],
            category: "",
            featured: false,
            priority: 0,
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, settings, space]);

  const saveSettings = async () => {
    try {
      await save.mutateAsync({
        ...form.values,
        // blank strings should defer to the derive-from-title/content default
        // (slug from page title; meta title/canonical from the public render)
        // rather than persisting as a literal empty value.
        slug: form.values.slug.trim() || undefined,
        metaTitle: form.values.metaTitle.trim() || undefined,
        canonicalUrl: form.values.canonicalUrl.trim() || undefined,
        ogImageAttachmentId: form.values.ogImageAttachmentId || undefined,
        category: form.values.category || null,
      });
      notifications.show({ message: t("Blog settings saved") });
    } catch (error) {
      notifications.show({
        color: "red",
        message:
          error["response"]?.data?.message ?? t("Unable to save blog settings"),
      });
    }
  };
  const derivedSlug = useMemo(() => slugify(title || "untitled"), [title]);
  const effectiveSlug = (form.values.slug || derivedSlug).trim();
  const previewUrl = useMemo(() => {
    const blogSettings = space?.settings?.blog;
    if (blogSettings?.domain) {
      const basePath = blogSettings.basePath || "";
      return `${getBlogDomainOrigin(blogSettings.domain)}${basePath}/${effectiveSlug}`;
    }
    return `${getAppUrl()}/blog/${effectiveSlug}`;
  }, [effectiveSlug, space?.settings?.blog]);
  const liveLink = useMemo(() => {
    if (!settings?.slug) return undefined;
    const blogSettings = space?.settings?.blog;
    if (blogSettings?.domain) {
      const basePath = blogSettings.basePath || "";
      return `${getBlogDomainOrigin(blogSettings.domain)}${basePath}/${settings.slug}`;
    }
    return `${getAppUrl()}/blog/${settings.slug}`;
  }, [settings?.slug, space?.settings?.blog]);

  const handleGenerateSeo = async () => {
    try {
      const result = await generateSeo.mutateAsync();
      form.setFieldValue("tags", result.tags);
      form.setFieldValue("metaDescription", result.metaDescription);
      notifications.show({
        message: t("Generated tags and meta description with AI"),
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message:
          error["response"]?.data?.message ??
          t("Unable to generate SEO fields"),
      });
    }
  };

  const publishPost = async () => {
    await saveSettings();
    try {
      await publish.mutateAsync(form.values.robotsIndex);
      notifications.show({ message: t("Post published") });
    } catch (error) {
      notifications.show({
        color: "red",
        message:
          error["response"]?.data?.message ?? t("Unable to publish post"),
      });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Blog post settings")}
      size="lg"
    >
      <Stack>
        {aiStatus?.configured && (
          <Button
            variant="light"
            leftSection={<IconSparkles size={16} />}
            onClick={handleGenerateSeo}
            loading={generateSeo.isPending}
          >
            {t("Generate tags & meta description with AI")}
          </Button>
        )}
        <TextInput
          label={t("Slug")}
          description={t("Derived from the page title when left blank")}
          placeholder={derivedSlug}
          {...form.getInputProps("slug")}
        />
        <TextInput
          label={t("Meta title")}
          description={t("Falls back to the page title when left blank")}
          placeholder={title}
          {...form.getInputProps("metaTitle")}
        />
        <Textarea
          label={t("Meta description")}
          autosize
          minRows={3}
          {...form.getInputProps("metaDescription")}
        />
        <TextInput
          label={t("OG image attachment ID")}
          description={t("Upload an image or paste an existing attachment ID")}
          {...form.getInputProps("ogImageAttachmentId")}
          rightSectionWidth={72}
          rightSectionPointerEvents="all"
          rightSection={
            <FileButton onChange={uploadOgImage} accept="image/*">
              {(props) => <Button {...props} size="compact-xs">{t("Upload")}</Button>}
            </FileButton>
          }
        />
        <TextInput
          label={t("Canonical URL")}
          description={t("Falls back to the live post URL when left blank")}
          placeholder={previewUrl}
          {...form.getInputProps("canonicalUrl")}
        />
        <TextInput
          label={t("Focus keyword")}
          {...form.getInputProps("focusKeyword")}
        />
        <Switch
          label={t("Allow search indexing")}
          {...form.getInputProps("robotsIndex", { type: "checkbox" })}
        />
        <Switch
          label={t("Allow search engines to follow links")}
          {...form.getInputProps("robotsFollow", { type: "checkbox" })}
        />
        <Divider />
        <Autocomplete
          label={t("Category")}
          placeholder={t("Select or type a category")}
          data={categories}
          {...form.getInputProps("category")}
        />
        <TagsInput
          label={t("Tags")}
          placeholder={t("Type a tag and press Enter")}
          {...form.getInputProps("tags")}
        />
        <Group grow>
          <Switch
            label={t("Featured on home")}
            {...form.getInputProps("featured", { type: "checkbox" })}
          />
          <NumberInput
            label={t("Priority")}
            description={t("Higher sorts first")}
            {...form.getInputProps("priority")}
          />
        </Group>
        {customFieldDefs.length > 0 && (
          <>
            <Divider label={t("Custom fields")} labelPosition="left" />
            {customFieldDefs.map((field) =>
              field.type === "boolean" ? (
                <Switch
                  key={field.key}
                  label={field.label}
                  {...form.getInputProps(`customFields.${field.key}`, {
                    type: "checkbox",
                  })}
                />
              ) : field.type === "number" ? (
                <NumberInput
                  key={field.key}
                  label={field.label}
                  {...form.getInputProps(`customFields.${field.key}`)}
                />
              ) : (
                <TextInput
                  key={field.key}
                  label={field.label}
                  {...form.getInputProps(`customFields.${field.key}`)}
                />
              ),
            )}
          </>
        )}
        <Divider />
        {share && liveLink && (
          <Group gap={4} wrap="nowrap">
            <TextInput
              variant="filled"
              value={liveLink}
              readOnly
              rightSection={<CopyTextButton text={liveLink} />}
              style={{ flex: 1 }}
            />
            <ActionIcon
              component="a"
              variant="default"
              target="_blank"
              rel="noopener noreferrer"
              href={liveLink}
              size="lg"
            >
              <IconExternalLink size={16} />
            </ActionIcon>
          </Group>
        )}
        <Group justify="space-between">
          <Text size="sm" c={share ? "green" : "dimmed"}>
            {share ? t("Published") : t("Draft")}
          </Text>
          <Group>
            <Button
              variant="default"
              onClick={saveSettings}
              loading={save.isPending}
            >
              {t("Save")}
            </Button>
            {share ? (
              <Button
                color="red"
                variant="light"
                onClick={() => unpublish.mutate()}
                loading={unpublish.isPending}
              >
                {t("Unpublish")}
              </Button>
            ) : (
              <Button onClick={publishPost} loading={publish.isPending}>
                {t("Publish")}
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
