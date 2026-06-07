import { Modal, Button, Group, Text, Select } from "@mantine/core";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { exportSharedPage } from "@/features/share/services/share-service";
import { useTranslation } from "react-i18next";

interface ShareExportModalProps {
  shareId: string;
  pageId: string;
  open: boolean;
  onClose: () => void;
}

export default function ShareExportModal({
  shareId,
  pageId,
  open,
  onClose,
}: ShareExportModalProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<"markdown" | "html" | "docx">("markdown");
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportSharedPage({ shareId, pageId, format });
      notifications.show({ message: t("Export successful") });
      onClose();
    } catch (err) {
      let detail = "";
      try {
        if (err.response?.data instanceof Blob) {
          const text = await err.response.data.text();
          detail = JSON.parse(text)?.message ?? text;
        } else {
          detail = err.response?.data?.message ?? err.message ?? "";
        }
      } catch {}
      notifications.show({
        message: t("Export failed") + (detail ? ": " + detail : ""),
        color: "red",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal.Root
      opened={open}
      onClose={onClose}
      size={400}
      padding="xl"
      yOffset="10vh"
      xOffset={0}
      onClick={(e) => e.stopPropagation()}
    >
      <Modal.Overlay />
      <Modal.Content style={{ overflow: "hidden" }}>
        <Modal.Header py={0}>
          <Modal.Title fw={500}>{t("Export page")}</Modal.Title>
          <Modal.CloseButton aria-label={t("Close")} />
        </Modal.Header>
        <Modal.Body>
          <Group justify="space-between" wrap="nowrap">
            <Text size="md">{t("Format")}</Text>
            <Select
              data={[
                { value: "markdown", label: "Markdown" },
                { value: "html", label: "HTML" },
                { value: "docx", label: "Word (.docx)" },
              ]}
              value={format}
              onChange={(v) =>
                setFormat((v as "markdown" | "html" | "docx") ?? "markdown")
              }
              styles={{ wrapper: { maxWidth: 140 } }}
              comboboxProps={{ width: "140" }}
              allowDeselect={false}
              withCheckIcon={false}
              aria-label={t("Select export format")}
            />
          </Group>

          <Group justify="center" mt="md">
            <Button onClick={onClose} variant="default">
              {t("Cancel")}
            </Button>
            <Button onClick={handleExport} loading={isExporting}>
              {t("Export")}
            </Button>
          </Group>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
