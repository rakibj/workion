import { ActionIcon, Button, ColorPicker, Group, Menu, Modal, Text, ThemeIcon, Tooltip } from "@mantine/core";
import {
  IconArrowRight,
  IconArrowsHorizontal,
  IconDeviceFloppy,
  IconDots,
  IconEraser,
  IconEye,
  IconEyeOff,
  IconFileExport,
  IconFolderOpen,
  IconHistory,
  IconLink,
  IconList,
  IconMarkdown,
  IconMessage,
  IconPalette,
  IconPhoto,
  IconPrinter,
  IconSearch,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconVectorTriangle,
  IconWifiOff,
} from "@tabler/icons-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAsideTriggerProps } from "@/hooks/use-toggle-aside.tsx";
import { useAtom, useAtomValue } from "jotai";
import {
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import {
  excalidrawAPIAtom,
  excalidrawOpsAtom,
} from "@/features/excalidraw/atoms/excalidraw-atom";
import { historyAtoms } from "@/features/page-history/atoms/history-atoms.ts";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { useClipboard } from "@/hooks/use-clipboard";
import { useParams } from "react-router-dom";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { notifications } from "@mantine/notifications";
import { getAppUrl } from "@/lib/config.ts";
import { extractPageSlugId } from "@/lib";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation.ts";
import { useDeletePageModal } from "@/features/page/hooks/use-delete-page-modal.tsx";
import { PageWidthToggle } from "@/features/user/components/page-width-pref.tsx";
import { Trans, useTranslation } from "react-i18next";
import ExportModal from "@/components/common/export-modal";
import { htmlToMarkdown } from "@docmost/editor-ext";
import {
  pageEditorAtom,
  yjsConnectionStatusAtom,
} from "@/features/editor/atoms/editor-atoms.ts";
import { formattedDate } from "@/lib/time.ts";
import { PageEditModeToggle } from "@/features/user/components/page-state-pref.tsx";
import MovePageModal from "@/features/page/components/move-page-modal.tsx";
import { useKanbanBoardQuery } from "@/features/kanban/queries/kanban-query";
import { kanbanToMarkdown } from "@/features/kanban/utils/kanban-markdown";
import { useTimeAgo } from "@/hooks/use-time-ago.tsx";
import { PageShareModal } from "@/ee/page-permission";
import {
  PageVerificationMenuItem,
  PageVerificationModal,
} from "@/ee/page-verification";
import {
  useFavoriteIds,
  useAddFavoriteMutation,
  useRemoveFavoriteMutation,
} from "@/features/favorite/queries/favorite-query";
import {
  useWatchStatusQuery,
  useWatchPageMutation,
  useUnwatchPageMutation,
} from "@/features/page/queries/watcher-query";

interface PageHeaderMenuProps {
  readOnly?: boolean;
}
export default function PageHeaderMenu({ readOnly }: PageHeaderMenuProps) {
  const { t } = useTranslation();
  const commentsTriggerProps = useAsideTriggerProps("comments");
  const tocTriggerProps = useAsideTriggerProps("toc");
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({
    pageId: extractPageSlugId(pageSlug),
  });
  const isDeleted = !!page?.deletedAt;

  useHotkeys(
    [
      [
        "mod+F",
        () => {
          const event = new CustomEvent("openFindDialogFromEditor", {});
          document.dispatchEvent(event);
        },
      ],
      [
        "Escape",
        () => {
          const event = new CustomEvent("closeFindDialogFromEditor", {});
          document.dispatchEvent(event);
        },
        { preventDefault: false },
      ],
    ],
    [],
  );

  if (isDeleted) {
    return null;
  }

  return (
    <>
      <ConnectionWarning />

      {!readOnly && page?.type !== "kanban" && page?.type !== "excalidraw" && <PageEditModeToggle size="xs" />}

      <PageShareModal readOnly={readOnly} />

      {page?.type !== "excalidraw" && (
        <Tooltip label={t("Comments")} openDelay={250} withArrow>
          <ActionIcon
            variant="subtle"
            color="dark"
            aria-label={t("Comments")}
            {...commentsTriggerProps}
          >
            <IconMessage size={20} stroke={2} />
          </ActionIcon>
        </Tooltip>
      )}

      {page?.type !== "kanban" && page?.type !== "excalidraw" && (
        <Tooltip label={t("Table of contents")} openDelay={250} withArrow>
          <ActionIcon
            variant="subtle"
            color="dark"
            aria-label={t("Table of contents")}
            {...tocTriggerProps}
          >
            <IconList size={20} stroke={2} />
          </ActionIcon>
        </Tooltip>
      )}

      <PageActionMenu readOnly={readOnly} />
    </>
  );
}

interface PageActionMenuProps {
  readOnly?: boolean;
}
function PageActionMenu({ readOnly }: PageActionMenuProps) {
  const { t } = useTranslation();
  const [, setHistoryModalOpen] = useAtom(historyAtoms);
  const clipboard = useClipboard({ timeout: 500 });
  const { pageSlug, spaceSlug } = useParams();
  const { data: page, isLoading } = usePageQuery({
    pageId: extractPageSlugId(pageSlug),
  });
  const { data: kanbanColumns } = useKanbanBoardQuery(
    page?.type === "kanban" ? page.id : undefined,
  );
  const { openDeleteModal } = useDeletePageModal();
  const { handleDelete } = useTreeMutation(page?.spaceId ?? "");
  const [exportOpened, { open: openExportModal, close: closeExportModal }] =
    useDisclosure(false);
  const [
    movePageModalOpened,
    { open: openMovePageModal, close: closeMoveSpaceModal },
  ] = useDisclosure(false);
  const [
    verificationOpened,
    { open: openVerificationModal, close: closeVerificationModal },
  ] = useDisclosure(false);
  const [pageEditor] = useAtom(pageEditorAtom);
  const pageUpdatedAt = useTimeAgo(page?.updatedAt);
  const favoriteIds = useFavoriteIds("page", page?.spaceId);
  const addFavoriteMutation = useAddFavoriteMutation();
  const removeFavoriteMutation = useRemoveFavoriteMutation();
  const isFavorited = page?.id ? favoriteIds.has(page.id) : false;
  const { data: watchStatus } = useWatchStatusQuery(page?.id);
  const watchPage = useWatchPageMutation();
  const unwatchPage = useUnwatchPageMutation();

  // Excalidraw-specific state
  const excalidrawAPI = useAtomValue(excalidrawAPIAtom);
  const excalidrawOps = useAtomValue(excalidrawOpsAtom);
  const openFileRef = useRef<HTMLInputElement>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [bgModalOpen, setBgModalOpen] = useState(false);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [origBgColor, setOrigBgColor] = useState("#ffffff");

  const handleExcalidrawOpen = useCallback(() => {
    openFileRef.current?.click();
  }, []);

  const handleExcalidrawFileLoad = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !excalidrawOps) return;
      try {
        await excalidrawOps.openFile(file);
      } catch {
        notifications.show({ message: t("Failed to load file"), color: "red" });
      }
      e.target.value = "";
    },
    [excalidrawOps, t],
  );

  const handleExcalidrawSaveTo = useCallback(() => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();
    const json = serializeAsJSON(elements, appState as any, files, "local");
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page?.title || "Untitled"}.excalidraw`;
    a.click();
    URL.revokeObjectURL(url);
  }, [excalidrawAPI, page?.title]);

  const handleExcalidrawExportPNG = useCallback(async () => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();
    const blob = await exportToBlob({
      elements,
      appState: appState as any,
      files,
      mimeType: "image/png",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page?.title || "Untitled"}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, [excalidrawAPI, page?.title]);

  const handleExcalidrawExportSVG = useCallback(async () => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();
    const svg = await exportToSvg({ elements, appState: appState as any, files });
    const svgStr = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page?.title || "Untitled"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [excalidrawAPI, page?.title]);

  const handleFindOnCanvas = useCallback(() => {
    setTimeout(() => {
      const btn = document.querySelector<HTMLElement>(".excalidraw .search-menu-button");
      btn?.click();
    }, 50);
  }, []);

  const handleOpenBgModal = useCallback(() => {
    const c = (excalidrawAPI?.getAppState() as any)?.viewBackgroundColor ?? "#ffffff";
    setBgColor(c);
    setOrigBgColor(c);
    setBgModalOpen(true);
  }, [excalidrawAPI]);

  const handleCancelBg = useCallback(() => {
    excalidrawAPI?.updateScene({ appState: { viewBackgroundColor: origBgColor } as any });
    setBgModalOpen(false);
  }, [excalidrawAPI, origBgColor]);

  const handleApplyBg = useCallback(() => {
    excalidrawAPI?.updateScene({ appState: { viewBackgroundColor: bgColor } as any });
    setBgModalOpen(false);
  }, [excalidrawAPI, bgColor]);

  const handleResetCanvas = useCallback(() => {
    excalidrawOps?.resetCanvas();
    setResetConfirmOpen(false);
  }, [excalidrawOps]);

  const handleCopyLink = () => {
    const pageUrl =
      getAppUrl() + buildPageUrl(spaceSlug, page.slugId, page.title);

    clipboard.copy(pageUrl);
    notifications.show({ message: t("Link copied") });
  };

  const handleCopyAsMarkdown = () => {
    if (page?.type === "kanban") {
      const markdown = kanbanToMarkdown(page.title ?? "", kanbanColumns ?? []);
      clipboard.copy(markdown);
      notifications.show({ message: t("Copied") });
      return;
    }
    if (!pageEditor) return;
    const html = pageEditor.getHTML();
    const markdown = htmlToMarkdown(html);
    const title = page?.title ? `# ${page.title}\n\n` : "";
    clipboard.copy(`${title}${markdown}`);
    notifications.show({ message: t("Copied") });
  };

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 250);
  };

  const openHistoryModal = () => {
    setHistoryModalOpen(true);
  };

  const handleDeletePage = () => {
    openDeleteModal({ onConfirm: () => handleDelete(page.id) });
  };

  const handleToggleFavorite = () => {
    if (!page?.id) return;
    const params = { type: "page" as const, pageId: page.id };
    if (isFavorited) {
      removeFavoriteMutation.mutate(params);
    } else {
      addFavoriteMutation.mutate(params);
    }
  };

  return (
    <>
      <Menu
        shadow="xl"
        position="bottom-end"
        offset={20}
        width={230}
        withArrow
        arrowPosition="center"
      >
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            color="dark"
            aria-label={t("Page actions")}
          >
            <IconDots size={20} />
          </ActionIcon>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconLink size={16} />}
            onClick={handleCopyLink}
          >
            {t("Copy link")}
          </Menu.Item>

          {page?.type !== "excalidraw" && (
            <Menu.Item
              leftSection={<IconMarkdown size={16} />}
              onClick={handleCopyAsMarkdown}
            >
              {t("Copy as Markdown")}
            </Menu.Item>
          )}

          <Menu.Item
            leftSection={
              isFavorited ? (
                <IconStarFilled size={16} color="var(--mantine-color-yellow-5)" />
              ) : (
                <IconStar size={16} />
              )
            }
            onClick={handleToggleFavorite}
          >
            {isFavorited ? t("Remove from favorites") : t("Add to favorites")}
          </Menu.Item>

          {watchStatus?.watching ? (
            <Menu.Item
              leftSection={<IconEyeOff size={16} />}
              onClick={() => unwatchPage.mutate(page.id)}
            >
              {t("Stop watching")}
            </Menu.Item>
          ) : (
            <Menu.Item
              leftSection={<IconEye size={16} />}
              onClick={() => watchPage.mutate(page.id)}
            >
              {t("Watch page")}
            </Menu.Item>
          )}

          <Menu.Divider />

          {page?.type === "excalidraw" && (
            <>
              <Menu.Item
                leftSection={<IconFolderOpen size={16} />}
                onClick={handleExcalidrawOpen}
              >
                {t("Open")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={handleExcalidrawSaveTo}
              >
                {t("Save to file")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconPhoto size={16} />}
                onClick={handleExcalidrawExportPNG}
              >
                {t("Export as PNG")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconVectorTriangle size={16} />}
                onClick={handleExcalidrawExportSVG}
              >
                {t("Export as SVG")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconSearch size={16} />}
                onClick={handleFindOnCanvas}
              >
                {t("Find on canvas")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconPalette size={16} />}
                onClick={handleOpenBgModal}
              >
                {t("Canvas background")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconEraser size={16} />}
                color="red"
                onClick={() => setResetConfirmOpen(true)}
              >
                {t("Reset canvas")}
              </Menu.Item>
              <Menu.Divider />
            </>
          )}

          {page?.type !== "kanban" && page?.type !== "excalidraw" && (
            <Menu.Item leftSection={<IconArrowsHorizontal size={16} />}>
              <Group wrap="nowrap">
                <PageWidthToggle label={t("Full width")} />
              </Group>
            </Menu.Item>
          )}

          <Menu.Item
            leftSection={<IconHistory size={16} />}
            onClick={openHistoryModal}
          >
            {t("Page history")}
          </Menu.Item>

          {!readOnly && (
            <PageVerificationMenuItem
              pageId={page?.id}
              onClick={openVerificationModal}
            />
          )}

          <Menu.Divider />

          {!readOnly && (
            <Menu.Item
              leftSection={<IconArrowRight size={16} />}
              onClick={openMovePageModal}
            >
              {t("Move")}
            </Menu.Item>
          )}

          {page?.type !== "kanban" && page?.type !== "excalidraw" && (
            <>
              <Menu.Item
                leftSection={<IconFileExport size={16} />}
                onClick={openExportModal}
              >
                {t("Export")}
              </Menu.Item>

              <Menu.Item
                leftSection={<IconPrinter size={16} />}
                onClick={handlePrint}
              >
                {t("Print PDF")}
              </Menu.Item>
            </>
          )}

          {!readOnly && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={"red"}
                leftSection={<IconTrash size={16} />}
                onClick={handleDeletePage}
              >
                {t("Move to trash")}
              </Menu.Item>
            </>
          )}

          <Menu.Divider />

          <>
            <Group px="sm" wrap="nowrap" style={{ cursor: "pointer" }}>
              <Tooltip
                label={t("Edited by {{name}} {{time}}", {
                  name: page.lastUpdatedBy.name,
                  time: pageUpdatedAt,
                })}
                position="left-start"
              >
                <div style={{ width: 210 }}>
                  {page?.type !== "kanban" && page?.type !== "excalidraw" && (
                    <Text size="xs" c="dimmed" truncate="end">
                      {t("Word count: {{wordCount}}", {
                        wordCount: pageEditor?.storage?.characterCount?.words(),
                      })}
                    </Text>
                  )}

                  <Text size="xs" c="dimmed" lineClamp={1}>
                    <Trans
                      defaults="Created by: <b>{{creatorName}}</b>"
                      values={{ creatorName: page?.creator?.name }}
                      components={{ b: <Text span fw={500} /> }}
                    />
                  </Text>
                  <Text size="xs" c="dimmed" truncate="end">
                    {t("Created at: {{time}}", {
                      time: formattedDate(page.createdAt),
                    })}
                  </Text>
                </div>
              </Tooltip>
            </Group>
          </>
        </Menu.Dropdown>
      </Menu>

      {/* Hidden file input for excalidraw Open */}
      <input
        ref={openFileRef}
        type="file"
        accept=".excalidraw,application/json"
        style={{ display: "none" }}
        onChange={handleExcalidrawFileLoad}
      />

      {/* Excalidraw: Reset canvas confirmation */}
      <Modal
        opened={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title={t("Reset canvas")}
        size="sm"
      >
        <Text size="sm">
          {t("This will clear all elements on the canvas. This action cannot be undone.")}
        </Text>
        <Group justify="flex-end" mt="md" gap="sm">
          <Button variant="default" onClick={() => setResetConfirmOpen(false)}>
            {t("Cancel")}
          </Button>
          <Button color="red" onClick={handleResetCanvas}>
            {t("Reset")}
          </Button>
        </Group>
      </Modal>

      {/* Excalidraw: Canvas background color picker */}
      <Modal
        opened={bgModalOpen}
        onClose={handleCancelBg}
        title={t("Canvas background")}
        size="sm"
      >
        <ColorPicker
          value={bgColor}
          onChange={setBgColor}
          format="hex"
          swatches={[
            "#ffffff", "#f8f9fa", "#fff3bf", "#d3f9d8", "#d0ebff",
            "#e5dbff", "#ffd6e7", "#ffe8cc", "#343a40", "#1c7ed6",
          ]}
          fullWidth
        />
        <Group justify="flex-end" mt="md" gap="sm">
          <Button variant="default" onClick={handleCancelBg}>
            {t("Cancel")}
          </Button>
          <Button onClick={handleApplyBg}>{t("Apply")}</Button>
        </Group>
      </Modal>

      <ExportModal
        type="page"
        id={page.id}
        open={exportOpened}
        onClose={closeExportModal}
      />

      <MovePageModal
        pageId={page.id}
        slugId={page.slugId}
        currentSpaceSlug={spaceSlug}
        onClose={closeMoveSpaceModal}
        open={movePageModalOpened}
      />

      <PageVerificationModal
        pageId={page.id}
        opened={verificationOpened}
        onClose={closeVerificationModal}
      />
    </>
  );
}

function ConnectionWarning() {
  const { t } = useTranslation();
  const yjsConnectionStatus = useAtomValue(yjsConnectionStatusAtom);
  const [showWarning, setShowWarning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const isDisconnected = ["disconnected", "connecting"].includes(
      yjsConnectionStatus,
    );

    if (isDisconnected) {
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => setShowWarning(true), 5000);
      }
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setShowWarning(false);
    }
  }, [yjsConnectionStatus]);

  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!showWarning) return null;

  return (
    <Tooltip
      label={t("Real-time editor connection lost. Retrying...")}
      openDelay={250}
      withArrow
    >
      <ThemeIcon
        variant="default"
        c="red"
        role="status"
        aria-label={t("Real-time editor connection lost. Retrying...")}
        style={{ border: "none" }}
      >
        <IconWifiOff size={20} stroke={2} />
      </ThemeIcon>
    </Tooltip>
  );
}
