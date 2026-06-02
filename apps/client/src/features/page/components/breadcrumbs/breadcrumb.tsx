import { useAtomValue } from "jotai";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { findBreadcrumbPath } from "@/features/page/tree/utils";
import {
  Button,
  Anchor,
  Popover,
  Breadcrumbs,
  ActionIcon,
  Text,
  Tooltip,
  TextInput,
} from "@mantine/core";
import { IconCornerDownRightDouble, IconDots } from "@tabler/icons-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import classes from "./breadcrumb.module.css";
import { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import {
  updatePageData,
  usePageQuery,
  useUpdateTitlePageMutation,
} from "@/features/page/queries/page-query.ts";
import { extractPageSlugId } from "@/lib";
import { useMediaQuery } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { useQueryEmit } from "@/features/websocket/use-query-emit";
import type { UpdateEvent } from "@/features/websocket/types";
import localEmitter from "@/lib/local-emitter";

function getTitle(name: string, icon: string) {
  if (icon) {
    return `${icon} ${name}`;
  }
  return name;
}

interface BreadcrumbProps {
  readOnly?: boolean;
}

export default function Breadcrumb({ readOnly }: BreadcrumbProps) {
  const { t } = useTranslation();
  const treeData = useAtomValue(treeDataAtom);
  const [breadcrumbNodes, setBreadcrumbNodes] = useState<SpaceTreeNode[] | null>(null);
  const { pageSlug, spaceSlug } = useParams();
  const { data: currentPage } = usePageQuery({
    pageId: extractPageSlugId(pageSlug),
  });
  const isMobile = useMediaQuery("(max-width: 48em)");

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: updateTitle } = useUpdateTitlePageMutation();
  const emit = useQueryEmit();
  const navigate = useNavigate();

  const isBoardPage = currentPage?.type === "board";
  const canEditTitle = isBoardPage && !readOnly;

  useEffect(() => {
    if (treeData?.length > 0 && currentPage) {
      const breadcrumb = findBreadcrumbPath(treeData, currentPage.id);
      setBreadcrumbNodes(breadcrumb || null);
    }
  }, [currentPage?.id, treeData]);

  // Keep edit value in sync when page title changes externally
  useEffect(() => {
    if (!editing && currentPage?.title) {
      setEditValue(currentPage.title);
    }
  }, [currentPage?.title, editing]);

  const startEditing = useCallback(() => {
    if (!canEditTitle) return;
    setEditValue(currentPage?.title ?? "");
    setEditing(true);
    // Focus after render
    setTimeout(() => inputRef.current?.select(), 0);
  }, [canEditTitle, currentPage?.title]);

  const commitEdit = useCallback(async () => {
    if (!editing || !currentPage) return;
    setEditing(false);
    const value = editValue.trim() || currentPage.title;
    if (value === currentPage.title) return;
    const page = await updateTitle({ pageId: currentPage.id, title: value });
    updatePageData(page);
    const event: UpdateEvent = {
      operation: "updateOne",
      spaceId: page.spaceId,
      entity: ["pages"],
      id: page.id,
      payload: {
        title: page.title,
        slugId: page.slugId,
        parentPageId: page.parentPageId,
        icon: page.icon,
      },
    };
    localEmitter.emit("message", event);
    emit(event);
    navigate(buildPageUrl(spaceSlug, page.slugId, page.title), { replace: true });
  }, [editing, editValue, currentPage, updateTitle, emit, navigate, spaceSlug]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditValue(currentPage?.title ?? "");
  }, [currentPage?.title]);

  const HiddenNodesTooltipContent = () =>
    breadcrumbNodes?.slice(1, -1).map((node) => (
      <Button.Group orientation="vertical" key={node.id}>
        <Button
          justify="start"
          component={Link}
          to={buildPageUrl(spaceSlug, node.slugId, node.name)}
          variant="default"
          style={{ border: "none" }}
        >
          <Text fz={"sm"} className={classes.truncatedText}>
            {getTitle(node.name, node.icon)}
          </Text>
        </Button>
      </Button.Group>
    ));

  const MobileHiddenNodesTooltipContent = () =>
    breadcrumbNodes?.map((node) => (
      <Button.Group orientation="vertical" key={node.id}>
        <Button
          justify="start"
          component={Link}
          to={buildPageUrl(spaceSlug, node.slugId, node.name)}
          variant="default"
          style={{ border: "none" }}
        >
          <Text fz={"sm"} className={classes.truncatedText}>
            {getTitle(node.name, node.icon)}
          </Text>
        </Button>
      </Button.Group>
    ));

  const renderAnchor = useCallback(
    (node: SpaceTreeNode, isCurrent = false) => {
      if (isCurrent && canEditTitle) {
        if (editing) {
          return (
            <TextInput
              key={node.id}
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.currentTarget.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
              }}
              variant="unstyled"
              size="xs"
              styles={{
                input: {
                  fontSize: "var(--mantine-font-size-sm)",
                  padding: 0,
                  height: "auto",
                  minWidth: 60,
                  maxWidth: 200,
                  width: `${Math.max(60, editValue.length * 7)}px`,
                  color: "var(--mantine-color-default-color)",
                },
              }}
            />
          );
        }
        return (
          <Tooltip label={t("Click to rename")} key={node.id} openDelay={600} withArrow>
            <Anchor
              component="button"
              type="button"
              onClick={startEditing}
              underline="never"
              fz="sm"
              className={classes.truncatedText}
              aria-current="page"
              style={{ cursor: "text" }}
            >
              {getTitle(node.name, node.icon)}
            </Anchor>
          </Tooltip>
        );
      }

      return (
        <Tooltip label={node.name} key={node.id}>
          <Anchor
            component={Link}
            to={buildPageUrl(spaceSlug, node.slugId, node.name)}
            underline="never"
            fz="sm"
            key={node.id}
            className={classes.truncatedText}
            aria-current={isCurrent ? "page" : undefined}
          >
            {getTitle(node.name, node.icon)}
          </Anchor>
        </Tooltip>
      );
    },
    [spaceSlug, canEditTitle, editing, editValue, startEditing, commitEdit, cancelEdit, t],
  );

  const getBreadcrumbItems = () => {
    if (!breadcrumbNodes) return [];

    if (breadcrumbNodes.length > 3) {
      const firstNode = breadcrumbNodes[0];
      const lastNode = breadcrumbNodes[breadcrumbNodes.length - 1];

      return [
        renderAnchor(firstNode),
        <Popover
          width={250}
          position="bottom"
          withArrow
          shadow="xl"
          key="hidden-nodes"
        >
          <Popover.Target>
            <ActionIcon
              color="gray"
              variant="transparent"
              aria-label={t("Show hidden breadcrumbs")}
            >
              <IconDots size={20} stroke={2} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <HiddenNodesTooltipContent />
          </Popover.Dropdown>
        </Popover>,
        renderAnchor(lastNode, true),
      ];
    }

    return breadcrumbNodes.map((node, i) =>
      renderAnchor(node, i === breadcrumbNodes.length - 1),
    );
  };

  const getMobileBreadcrumbItems = () => {
    if (!breadcrumbNodes) return [];

    if (breadcrumbNodes.length > 0) {
      return [
        <Popover
          width={250}
          position="bottom"
          withArrow
          shadow="xl"
          key="mobile-hidden-nodes"
        >
          <Popover.Target>
            <Tooltip label={t("Breadcrumbs")}>
              <ActionIcon
                color="gray"
                variant="transparent"
                aria-label={t("Breadcrumbs")}
              >
                <IconCornerDownRightDouble size={20} stroke={2} />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <MobileHiddenNodesTooltipContent />
          </Popover.Dropdown>
        </Popover>,
      ];
    }

    return breadcrumbNodes.map((node, i) =>
      renderAnchor(node, i === breadcrumbNodes.length - 1),
    );
  };

  return (
    <nav aria-label={t("Breadcrumb")} className={classes.breadcrumbDiv}>
      {breadcrumbNodes && (
        <Breadcrumbs className={classes.breadcrumbs}>
          {isMobile ? getMobileBreadcrumbItems() : getBreadcrumbItems()}
        </Breadcrumbs>
      )}
    </nav>
  );
}
