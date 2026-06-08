import { useParams } from "react-router-dom";
import { usePageQuery } from "@/features/page/queries/page-query";
import { FullEditor } from "@/features/editor/full-editor";
import HistoryModal from "@/features/page-history/components/history-modal";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/features/page/components/header/page-header.tsx";
import { extractPageSlugId } from "@/lib";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { useMarkPageRead } from "@/features/page/hooks/use-mark-page-read";
import { useTranslation } from "react-i18next";
import React, { lazy, Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { IconAlertTriangle, IconFileOff } from "@tabler/icons-react";
import { Button, Loader } from "@mantine/core";
import { Link } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
const MemoizedFullEditor = React.memo(FullEditor);
const MemoizedPageHeader = React.memo(PageHeader);
const MemoizedHistoryModal = React.memo(HistoryModal);
const KanbanBoardPage = lazy(
  () => import("@/features/kanban/components/kanban-board-page"),
);
const ExcalidrawPage = lazy(
  () => import("@/features/excalidraw/components/excalidraw-page"),
);

export default function Page() {
  const { t } = useTranslation();
  const { pageSlug } = useParams();

  return (
    <ErrorBoundary
      resetKeys={[pageSlug]}
      fallbackRender={({ resetErrorBoundary }) => (
        <EmptyState
          icon={IconAlertTriangle}
          title={t("Failed to load page. An error occurred.")}
          action={
            <Button variant="default" size="sm" mt="xs" onClick={resetErrorBoundary}>
              {t("Try again")}
            </Button>
          }
        />
      )}
    >
      <PageContent pageSlug={pageSlug} />
    </ErrorBoundary>
  );
}

function PageContent({ pageSlug }: { pageSlug: string | undefined }) {
  const { t } = useTranslation();

  const {
    data: page,
    isLoading,
    isError,
    error,
  } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  const { data: space } = useGetSpaceBySlugQuery(page?.space?.slug);

  useMarkPageRead(page?.id);

  const canEdit = !page?.deletedAt && (page?.permissions?.canEdit ?? false);
  const canComment = !page?.deletedAt && (page?.permissions?.canComment ?? false);

  if (isLoading) {
    return <></>;
  }

  if (isError || !page) {
    if ([401, 403, 404].includes(error?.["status"])) {
      return (
        <EmptyState
          icon={IconFileOff}
          title={t("Page not found")}
          description={t(
            "This page may have been deleted, moved, or you may not have access.",
          )}
          action={
            <Button component={Link} to="/home" variant="default" size="sm" mt="xs">
              {t("Go to homepage")}
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={IconFileOff}
        title={t("Error fetching page data.")}
      />
    );
  }

  if (!space) {
    return <></>;
  }

  const isFullHeight = page.type === "kanban" || page.type === "excalidraw";

  return (
    page && (
      <div style={isFullHeight ? { height: "calc(100vh - 45px - 2 * var(--mantine-spacing-md))", display: "flex", flexDirection: "column", overflow: "hidden" } : undefined}>
        <Helmet>
          <title>{`${page?.icon || ""}  ${page?.title || t("untitled")}`}</title>
        </Helmet>

        <MemoizedPageHeader readOnly={!canEdit} />

        {page.type === "kanban" ? (
          <Suspense fallback={<Loader size="sm" m="md" />}>
            <KanbanBoardPage
              key={page.id}
              pageId={page.id}
              spaceId={space.id}
              canEdit={canEdit}
              title={page.title ?? ""}
              spaceSlug={page?.space?.slug ?? ""}
            />
          </Suspense>
        ) : page.type === "excalidraw" ? (
          <Suspense fallback={<Loader size="sm" m="md" />}>
            <ExcalidrawPage
              key={page.id}
              pageId={page.id}
              title={page.title ?? ""}
              icon={page.icon ?? ""}
              spaceId={space.id}
              canEdit={canEdit}
            />
          </Suspense>
        ) : (
          <>
            <MemoizedFullEditor
              key={page.id}
              pageId={page.id}
              title={page.title}
              icon={page.icon}
              content={page.content as string}
              slugId={page.slugId}
              spaceSlug={page?.space?.slug}
              editable={canEdit}
              creator={page.creator}
              contributors={page.contributors}
              canComment={canComment}
            />
            <MemoizedHistoryModal pageId={page.id} />
          </>
        )}
      </div>
    )
  );
}
