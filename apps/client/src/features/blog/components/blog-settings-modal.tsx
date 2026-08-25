import {
  ActionIcon,
  Button,
  Divider,
  FileButton,
  Group,
  Modal,
  NumberInput,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { IconExternalLink } from "@tabler/icons-react";
import {
  useBlogPostSettingsQuery,
  usePublishBlogPostMutation,
  useSaveBlogPostSettingsMutation,
  useUnpublishBlogPostMutation,
} from "@/features/blog/queries/blog-query";
import { useShareForPageQuery } from "@/features/share/queries/share-query";
import { uploadFile } from "@/features/page/services/page-service";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { getAppUrl, getBlogDomainOrigin } from "@/lib/config";
import CopyTextButton from "@/components/common/copy";

export function BlogSettingsModal({
  pageId,
  opened,
  onClose,
}: {
  pageId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: settings } = useBlogPostSettingsQuery(pageId);
  const { data: share } = useShareForPageQuery(pageId);
  const { data: space } = useSpaceQuery(settings?.spaceId);
  const save = useSaveBlogPostSettingsMutation(pageId);
  const publish = usePublishBlogPostMutation(pageId);
  const unpublish = useUnpublishBlogPostMutation(pageId);
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
    },
  });

  const customFieldDefs = space?.settings?.blog?.customFields ?? [];
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
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, settings, space]);

  const saveSettings = async () => {
    try {
      await save.mutateAsync({
        ...form.values,
        ogImageAttachmentId: form.values.ogImageAttachmentId || undefined,
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
  const liveLink = useMemo(() => {
    if (!settings?.slug) return undefined;
    const blogSettings = space?.settings?.blog;
    if (blogSettings?.domain) {
      const basePath = blogSettings.basePath || "";
      return `${getBlogDomainOrigin(blogSettings.domain)}${basePath}/${settings.slug}`;
    }
    return `${getAppUrl()}/blog/${settings.slug}`;
  }, [settings?.slug, space?.settings?.blog]);

  const publishPost = async () => {
    if (!form.values.slug.trim()) {
      form.setFieldError("slug", t("Slug is required before publishing"));
      return;
    }
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
        <TextInput label={t("Slug")} {...form.getInputProps("slug")} />
        <TextInput
          label={t("Meta title")}
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
