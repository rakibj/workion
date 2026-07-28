import { Button, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { ISpace } from "@/features/space/types/space.types";
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
    initialValues: { domain: space?.settings?.blog?.domain ?? "" },
  });
  const save = async () => {
    if (!space) return;
    try {
      await update.mutateAsync({
        spaceId: space.id,
        domain: form.values.domain.trim() || null,
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
      <Button
        w="fit-content"
        onClick={save}
        loading={update.isPending}
        disabled={readOnly}
      >
        {t("Save")}
      </Button>
    </Stack>
  );
}
