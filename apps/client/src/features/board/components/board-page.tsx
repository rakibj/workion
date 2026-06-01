import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Loader, Text, TextInput } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  updatePageData,
  useUpdateTitlePageMutation,
} from "@/features/page/queries/page-query";
import { useQueryEmit } from "@/features/websocket/use-query-emit";
import type { UpdateEvent } from "@/features/websocket/types";
import localEmitter from "@/lib/local-emitter";
import { buildPageUrl } from "@/features/page/page.utils";

const BoardEditor = lazy(() => import("./board-editor"));

interface BoardPageProps {
  pageId: string;
  canEdit: boolean;
  title: string;
  spaceSlug: string;
}

export default function BoardPage({
  pageId,
  canEdit,
  title,
  spaceSlug,
}: BoardPageProps) {
  const { t } = useTranslation();
  const [titleValue, setTitleValue] = useState(title);
  const { mutateAsync: updateTitleMutate } = useUpdateTitlePageMutation();
  const emit = useQueryEmit();
  const navigate = useNavigate();

  useEffect(() => {
    setTitleValue(title);
  }, [pageId, title]);

  const saveTitle = useCallback(
    async (value: string) => {
      if (value === title) return;
      const page = await updateTitleMutate({ pageId, title: value });
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
    },
    [pageId, title, spaceSlug, emit, navigate, updateTitleMutate],
  );

  const debouncedSaveTitle = useDebouncedCallback(saveTitle, 500);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "6px 16px",
          borderBottom: "1px solid var(--mantine-color-default-border)",
          flexShrink: 0,
        }}
      >
        {canEdit ? (
          <TextInput
            value={titleValue}
            onChange={(e) => {
              setTitleValue(e.currentTarget.value);
              debouncedSaveTitle(e.currentTarget.value);
            }}
            onBlur={() => saveTitle(titleValue)}
            placeholder={t("Untitled")}
            variant="unstyled"
            styles={{ input: { fontWeight: 700, fontSize: "1.25rem" } }}
          />
        ) : (
          <Text fw={700} size="xl">
            {titleValue || t("Untitled")}
          </Text>
        )}
      </div>

      <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
        <Suspense fallback={<Loader size="sm" m="md" />}>
          <BoardEditor key={pageId} pageId={pageId} readOnly={!canEdit} />
        </Suspense>
      </div>
    </div>
  );
}
