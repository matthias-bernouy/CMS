import type { TPage } from "cms-content/interfaces/pages";

export type PublishedPageSnapshot = Pick<TPage, "id" | "path" | "title" | "description" | "content">;

export function isPublishedPage(page: Pick<TPage, "visible"> | null | undefined): page is TPage {
    return page?.visible === true;
}

export function publishedPageSnapshot(page: TPage): PublishedPageSnapshot {
    return {
        id: page.id,
        path: page.path,
        title: page.title,
        description: page.description,
        content: page.content,
    };
}

export function serializePublishedPageSnapshot(snapshot: PublishedPageSnapshot): string {
    return JSON.stringify({
        id: snapshot.id,
        path: snapshot.path,
        title: snapshot.title,
        description: snapshot.description,
        content: snapshot.content,
    });
}
