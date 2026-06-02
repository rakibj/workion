import { lazy, Suspense } from "react";
import { Loader } from "@mantine/core";

const BoardEditor = lazy(() => import("./board-editor"));

interface BoardPageProps {
  pageId: string;
  canEdit: boolean;
  title: string;
  spaceSlug: string;
}

export default function BoardPage({ pageId, canEdit }: BoardPageProps) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* spacer that clears the 45px fixed PageHeader */}
      <div style={{ height: 45, flexShrink: 0 }} />
      <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
        <Suspense fallback={<Loader size="sm" m="md" />}>
          <BoardEditor key={pageId} pageId={pageId} readOnly={!canEdit} />
        </Suspense>
      </div>
    </div>
  );
}
