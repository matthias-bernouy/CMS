import type { ContentRepository } from "cms-content/application/interfaces/ContentRepository";
import { assertPageContentLinks, createPageRouteReader, pageContentPaths } from "./links";
import { PageReferencedError } from "./errors";

/** Serializes validation and Page writes through one Content facade. */
export class PageMutationValidation {
    private tail: Promise<unknown> = Promise.resolve();
    constructor(private readonly repository: ContentRepository) {}

    run<T>(operation: () => Promise<T>): Promise<T> {
        const pending = this.tail.then(operation);
        this.tail = pending.catch(() => undefined);
        return pending;
    }

    content(html: string, availablePaths: readonly string[] = []): Promise<void> {
        return assertPageContentLinks(createPageRouteReader(this.repository), html, new Set(availablePaths));
    }

    async deletion(pageId: string): Promise<void> {
        let cursor: string | undefined;
        do {
            const batch = await this.repository.scanPages(cursor, 250);
            for (const page of batch.pages) {
                if (page.id === pageId) {
                    continue;
                }
                const paths = pageContentPaths(page.content);
                const routes = this.repository.getPageRoutes
                    ? await this.repository.getPageRoutes(paths)
                    : await Promise.all(paths.map((path) => this.repository.getPageRoute(path)));
                if (routes.some((route) => route?.state !== "gone" && route?.pageId === pageId)) {
                    throw new PageReferencedError(pageId);
                }
            }
            cursor = batch.nextCursor;
        } while (cursor);
    }
}
