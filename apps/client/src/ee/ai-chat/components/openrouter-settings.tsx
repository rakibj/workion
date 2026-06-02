import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Group,
  PasswordInput,
  Select,
  Stack,
  Text,
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

const OPENROUTER_MODELS = [
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini (OpenAI)" },
  { value: "openai/gpt-4o", label: "GPT-4o (OpenAI)" },
  { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet (Anthropic)" },
  { value: "anthropic/claude-3-haiku", label: "Claude 3 Haiku (Anthropic)" },
  { value: "google/gemini-flash-1.5", label: "Gemini Flash 1.5 (Google)" },
  { value: "google/gemini-pro-1.5", label: "Gemini Pro 1.5 (Google)" },
  { value: "meta-llama/llama-3.1-8b-instruct:free", label: "Llama 3.1 8B (Meta, free)" },
];

const DEFAULT_MODEL = "openai/gpt-4o-mini";

const formSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
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
    setIsSaving(true);
    try {
      await saveAiKey({ apiKey: values.apiKey, model: values.model });
      setStatus({ configured: true, model: values.model });
      form.setFieldValue("apiKey", "");
      notifications.show({ message: t("OpenRouter key saved successfully") });
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
            placeholder="sk-or-v1-..."
            {...form.getInputProps("apiKey")}
          />
          <Select
            label={t("Model")}
            data={OPENROUTER_MODELS}
            allowDeselect={false}
            {...form.getInputProps("model")}
          />
          <Group>
            <Button type="submit" loading={isSaving}>
              {status?.configured ? t("Update key") : t("Save key")}
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
