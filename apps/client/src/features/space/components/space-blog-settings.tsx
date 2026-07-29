import {
  Accordion,
  ActionIcon,
  Alert,
  Button,
  Code,
  Group,
  List,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { IconAlertTriangle, IconPlus, IconTrash } from "@tabler/icons-react";
import { IBlogCustomFieldDef, ISpace } from "@/features/space/types/space.types";
import { useUpdateSpaceBlogSettingsMutation } from "@/features/space/queries/space-query";

export default function SpaceBlogSettings({
  space,
  readOnly,
}: {
  space?: ISpace;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const update = useUpdateSpaceBlogSettingsMutation();
  const form = useForm({
    initialValues: {
      domain: space?.settings?.blog?.domain ?? "",
      basePath: space?.settings?.blog?.basePath ?? "",
      customFields: space?.settings?.blog?.customFields ?? ([] as IBlogCustomFieldDef[]),
    },
  });

  const addCustomField = () => {
    form.insertListItem("customFields", { key: "", label: "", type: "boolean" });
  };

  const save = async () => {
    if (!space) return;

    const customFields = form.values.customFields
      .map((field) => ({
        key: field.key.trim(),
        label: field.label.trim(),
        type: field.type,
      }))
      .filter((field) => field.key || field.label);

    if (customFields.some((field) => !field.key || !field.label)) {
      notifications.show({
        color: "red",
        message: t("Every custom field needs both a key and a label"),
      });
      return;
    }

    const keys = customFields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
      notifications.show({
        color: "red",
        message: t("Custom field keys must be unique"),
      });
      return;
    }

    try {
      await update.mutateAsync({
        spaceId: space.id,
        domain: form.values.domain.trim() || null,
        basePath: form.values.basePath.trim(),
        customFields,
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
  return (
    <Stack py="md">
      <Text size="sm" c="dimmed">
        {t("Map a custom hostname to this space's published blog.")}
      </Text>
      <TextInput
        label={t("Blog domain")}
        placeholder="example.com"
        disabled={readOnly}
        {...form.getInputProps("domain")}
      />
      <TextInput
        label={t("Blog path")}
        description={t("Optional path prefix, for example /blogs. Leave blank to publish at the domain root.")}
        placeholder="/blogs"
        disabled={readOnly}
        {...form.getInputProps("basePath")}
      />
      {form.values.basePath.trim() && !form.values.domain.trim() && (
        <Alert
          variant="light"
          color="yellow"
          icon={<IconAlertTriangle size={16} />}
        >
          {t(
            "Blog path only takes effect once a blog domain is set above. Without a domain, posts in this space are served at the app's shared /blog path.",
          )}
        </Alert>
      )}

      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t("Custom fields")}
        </Text>
        <Text size="sm" c="dimmed">
          {t(
            "Define extra metadata fields (e.g. Featured, Priority) that editors can set per blog post. Values are returned in the public blog API.",
          )}
        </Text>
        {form.values.customFields.map((_, index) => (
          <Group key={index} wrap="nowrap" align="flex-start">
            <TextInput
              placeholder={t("Key (e.g. isFeatured)")}
              disabled={readOnly}
              style={{ flex: 1 }}
              {...form.getInputProps(`customFields.${index}.key`)}
            />
            <TextInput
              placeholder={t("Label (e.g. Featured)")}
              disabled={readOnly}
              style={{ flex: 1 }}
              {...form.getInputProps(`customFields.${index}.label`)}
            />
            <Select
              data={[
                { value: "boolean", label: t("Boolean") },
                { value: "number", label: t("Number") },
                { value: "text", label: t("Text") },
              ]}
              disabled={readOnly}
              w={120}
              allowDeselect={false}
              {...form.getInputProps(`customFields.${index}.type`)}
            />
            <ActionIcon
              variant="subtle"
              color="red"
              disabled={readOnly}
              onClick={() => form.removeListItem("customFields", index)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ))}
        <Button
          variant="default"
          size="xs"
          w="fit-content"
          leftSection={<IconPlus size={14} />}
          disabled={readOnly}
          onClick={addCustomField}
        >
          {t("Add custom field")}
        </Button>
      </Stack>

      <Button
        w="fit-content"
        onClick={save}
        loading={update.isPending}
        disabled={readOnly}
      >
        {t("Save")}
      </Button>

      <Accordion variant="contained">
        <Accordion.Item value="custom-domain-help">
          <Accordion.Control>
            {t("How do I connect a custom domain?")}
          </Accordion.Control>
          <Accordion.Panel>
            <List type="ordered" size="sm" spacing="xs">
              <List.Item>
                {t("Enter your domain above (e.g. blog.yoursite.com) and click Save.")}
              </List.Item>
              <List.Item>
                {t("In your domain's DNS settings, add a record pointing it to this server:")}
                <List size="sm" spacing={4} mt={4}>
                  <List.Item>
                    {t("Subdomain (e.g. blog.yoursite.com):")}{" "}
                    <Code>CNAME → workion.gameloops.io</Code>
                  </List.Item>
                  <List.Item>
                    {t("Root domain (e.g. yoursite.com):")}{" "}
                    <Code>A → 157.173.120.4</Code>
                  </List.Item>
                </List>
              </List.Item>
              <List.Item>
                {t("DNS changes can take anywhere from a few minutes to a few hours to propagate.")}
              </List.Item>
              <List.Item>
                {t("Once DNS is pointed here, contact your workspace administrator to finish enabling the domain on the server (SSL certificate + routing) — this last step can't be completed from this page.")}
              </List.Item>
              <List.Item>
                {t("After that, your blog is live at your domain (or at the Blog path above, if set).")}
              </List.Item>
            </List>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
