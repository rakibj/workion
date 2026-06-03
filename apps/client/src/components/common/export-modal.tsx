import {
  Modal,
  Button,
  Group,
  Text,
  Select,
  Switch,
  Divider,
} from "@mantine/core";
import { exportPage } from "@/features/page/services/page-service.ts";
import { useState } from "react";
import { ExportFormat } from "@/features/page/types/page.types.ts";
import { notifications } from "@mantine/notifications";
import { exportSpace, getSpaceMarkdownText } from "@/features/space/services/space-service";
import { useClipboard } from "@/hooks/use-clipboard";
import { useTranslation } from "react-i18next";

interface ExportModalProps {
  id: string;
  type: "space" | "page";
  open: boolean;
  onClose: () => void;
}

export default function ExportModal({
  id,
  type,
  open,
  onClose,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>(ExportFormat.Markdown);
  const [includeChildren, setIncludeChildren] = useState<boolean>(false);
  const [includeAttachments, setIncludeAttachments] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isCopying, setIsCopying] = useState<boolean>(false);
  const clipboard = useClipboard({ timeout: 500 });
  const { t } = useTranslation();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (type === "page") {
        await exportPage({
          pageId: id,
          format,
          includeChildren,
          includeAttachments,
        });
      }
      if (type === "space") {
        await exportSpace({ spaceId: id, format, includeAttachments });
      }
      notifications.show({
        message: t("Export successful"),
      });
      onClose();
    } catch (err) {
      notifications.show({
        message: "Export failed:" + err.response?.data.message,
        color: "red",
      });
      console.error("export error", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopySpaceAsMarkdown = async () => {
    setIsCopying(true);
    try {
      const text = await getSpaceMarkdownText(id);
      clipboard.copy(text);
      notifications.show({ message: t("Copied") });
      onClose();
    } catch (err) {
      notifications.show({
        message: t("Copy failed") + ": " + err.response?.data?.message,
        color: "red",
      });
    } finally {
      setIsCopying(false);
    }
  };

  const handleChange = (format: ExportFormat) => {
    setFormat(format);
  };

  return (
    <Modal.Root
      opened={open}
      onClose={onClose}
      size={500}
      padding="xl"
      yOffset="10vh"
      xOffset={0}
      mah={400}
      onClick={(e) => e.stopPropagation()}
    >
      <Modal.Overlay />
      <Modal.Content style={{ overflow: "hidden" }}>
        <Modal.Header py={0}>
          <Modal.Title fw={500}>{t(`Export ${type}`)}</Modal.Title>
          <Modal.CloseButton aria-label={t("Close")} />
        </Modal.Header>
        <Modal.Body>
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text size="md">{t("Format")}</Text>
            </div>
            <ExportFormatSelection format={format} onChange={handleChange} />
          </Group>

          {type === "page" && (
            <>
              <Divider my="sm" />

              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text size="md">{t("Include subpages")}</Text>
                </div>
                <Switch
                  onChange={(event) =>
                    setIncludeChildren(event.currentTarget.checked)
                  }
                  checked={includeChildren}
                />
              </Group>

              <Group justify="space-between" wrap="nowrap" mt="md">
                <div>
                  <Text size="md">{t("Include attachments")}</Text>
                </div>
                <Switch
                  onChange={(event) =>
                    setIncludeAttachments(event.currentTarget.checked)
                  }
                  checked={includeAttachments}
                />
              </Group>
            </>
          )}

          {type === "space" && (
            <>
              <Divider my="sm" />

              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text size="md">{t("Include attachments")}</Text>
                </div>
                <Switch
                  onChange={(event) =>
                    setIncludeAttachments(event.currentTarget.checked)
                  }
                  checked={includeAttachments}
                />
              </Group>
            </>
          )}

          <Group justify="center" mt="md">
            <Button onClick={onClose} variant="default">
              {t("Cancel")}
            </Button>
            {type === "space" && (
              <Button
                variant="default"
                onClick={handleCopySpaceAsMarkdown}
                loading={isCopying}
              >
                {t("Copy as Markdown")}
              </Button>
            )}
            <Button onClick={handleExport} loading={isExporting}>{t("Export")}</Button>
          </Group>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

interface ExportFormatSelection {
  format: ExportFormat;
  onChange: (value: string) => void;
}
function ExportFormatSelection({ format, onChange }: ExportFormatSelection) {
  const { t } = useTranslation();

  return (
    <Select
      data={[
        { value: "markdown", label: "Markdown" },
        { value: "html", label: "HTML" },
      ]}
      defaultValue={format}
      onChange={onChange}
      styles={{ wrapper: { maxWidth: 120 } }}
      comboboxProps={{ width: "120" }}
      allowDeselect={false}
      withCheckIcon={false}
      aria-label={t("Select export format")}
    />
  );
}
