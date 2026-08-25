import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { z } from "zod/v4";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import useUserRole from "@/hooks/use-user-role.tsx";
import {
  deleteAiKey,
  getAiKeyStatus,
  saveAiKey,
} from "@/features/workspace/services/workspace-service.ts";
import type { IAiKeyStatus } from "@/features/workspace/types/workspace.types.ts";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

const formSchema = z.object({
  apiKey: z.string(),
  model: z.string().min(1, "Model is required"),
});

export default function OpenRouterSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const [status, setStatus] = useState<IAiKeyStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const form = useForm({
    validate: zod4Resolver(formSchema),
    initialValues: { apiKey: "", model: DEFAULT_MODEL },
  });

  useEffect(() => {
    if (!isAdmin) {
      setIsLoadingStatus(false);
      return;
    }
    getAiKeyStatus()
      .then((s) => {
        setStatus(s);
        if (s?.model) form.setFieldValue("model", s.model);
      })
      .catch(() => {})
      .finally(() => setIsLoadingStatus(false));
  }, [isAdmin]);

  if (!isAdmin) return null;

  const handleSave = async (values: { apiKey: string; model: string }) => {
    const apiKey = values.apiKey.trim();
    if (!status?.configured && !apiKey) {
      form.setFieldError("apiKey", t("API key is required"));
      return;
    }
    setIsSaving(true);
    try {
      await saveAiKey({ apiKey: apiKey || undefined, model: values.model });
      setStatus({ configured: true, model: values.model });
      form.setFieldValue("apiKey", "");
      notifications.show({
        message: apiKey
          ? t("OpenRouter key saved successfully")
          : t("Model updated successfully"),
      });
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message || t("Failed to save key"),
        color: "red",
      });
    }
    setIsSaving(false);
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await deleteAiKey();
      setStatus({ configured: false, model: DEFAULT_MODEL });
      form.setValues({ apiKey: "", model: DEFAULT_MODEL });
      notifications.show({ message: t("OpenRouter key removed") });
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message || t("Failed to remove key"),
        color: "red",
      });
    }
    setIsRemoving(false);
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xl">
        <div>
          <Text size="md">{t("OpenRouter API Key")}</Text>
          <Text size="sm" c="dimmed">
            {t(
              "Connect your own OpenRouter account to power AI Chat. Your key is encrypted at rest and never exposed to clients.",
            )}
          </Text>
        </div>
        {!isLoadingStatus && (
          <Badge
            color={status?.configured ? "green" : "orange"}
            variant="light"
            size="sm"
            style={{ flexShrink: 0 }}
          >
            {status?.configured ? t("Configured") : t("Not configured")}
          </Badge>
        )}
      </Group>

      <form onSubmit={form.onSubmit(handleSave)}>
        <Stack gap="sm">
          <PasswordInput
            label={
              status?.configured
                ? t("New API key (replaces existing)")
                : t("API key")
            }
            description={
              status?.configured
                ? t("Leave blank to keep the current key and only change the model")
                : undefined
            }
            placeholder="sk-or-v1-..."
            {...form.getInputProps("apiKey")}
          />
          <TextInput
            label={t("Model")}
            description={t(
              "Any OpenRouter model identifier, e.g. openai/gpt-4o-mini",
            )}
            placeholder={DEFAULT_MODEL}
            {...form.getInputProps("model")}
          />
          <Group>
            <Button type="submit" loading={isSaving}>
              {status?.configured ? t("Save changes") : t("Save key")}
            </Button>
            {status?.configured && (
              <Button
                variant="subtle"
                color="red"
                loading={isRemoving}
                onClick={handleRemove}
                type="button"
              >
                {t("Remove key")}
              </Button>
            )}
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
