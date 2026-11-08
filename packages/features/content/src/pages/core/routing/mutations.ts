import type { ContentRepository } from "content/application/interfaces/ContentRepository";
import { PageReferencedError } from "./errors";
import { analyzePageLinks } from "./analysis/analyze";
import { analyzeExpandedPageDocument } from "content/blocs/core/markup/validation/documents/expandedPageDocument";
import { assertContentDiagnostics } from "content/application/core/validation/diagnostics";
import { expandCompositions } from "content/blocs/core/composition/expandCompositions";
import { parseHTML } from "linkedom";
import type { ContentDiagnostic } from "content/application/interfaces/diagnostics";
import { collectDocumentLinks } from "./analysis/collect";
import { ContentValidationError } from "content/application/core/validation/errors";

/** Serializes validation and Page writes through one Content facade. */
export class PageMutationValidation {
    private tail: Promise<unknown> = Promise.resolve();
    constructor(private readonly repository: ContentRepository) {}

    run<T>(operation: () => Promise<T>): Promise<T> {
        const pending = this.tail.then(operation);
        this.tail = pending.catch(() => undefined);
        return pending;
    }

    async content(
        html: string,
        availablePaths: readonly string[] = [],
        visible = false,
        analysis?: ReturnType<typeof analyzeExpandedPageDocument>,
        pageId?: string,
    ) {
        const document =
            analysis ?? analyzeExpandedPageDocument(html, await this.repository.getBlocsList({ includeHidden: true }));
        const diagnostics = await analyzePageLinks(
            this.repository,
            document,
            { path: availablePaths[0] ?? "/", visible, ...(pageId ? { id: pageId } : {}) },
            availablePaths,
        );
        assertContentDiagnostics(diagnostics);
        return diagnostics;
    }

    async unpublication(pageId: string): Promise<readonly ContentDiagnostic[]> {
        try {
            await this.deletion(pageId, 16 * 1024 * 1024);
            return [];
        } catch (error) {
            return [
                {
                    code:
                        error instanceof PageReferencedError ? "page.incoming_unpublished" : "page.incoming_unverified",
                    severity: "warning",
                    message:
                        error instanceof PageReferencedError
                            ? "Other Pages link to this Page; unpublishing it can make their destinations unavailable."
                            : "Incoming links could not be fully verified within the analysis budget. The Page was still allowed to return to draft.",
                    relatedResources: [pageId],
                },
            ];
        }
    }

    async deletion(pageId: string, volumeBudget = 16 * 1024 * 1024): Promise<void> {
        let cursor: string | undefined;
        let volume = 0;
        const definitions = await this.repository.getBlocsList({ includeHidden: true });
        const system = await this.repository.getSystem();
        do {
            const batch = await this.repository.scanPages(cursor, 50);
            for (const page of batch.pages) {
                if (page.id === pageId) {
                    continue;
                }
                volume += page.content.length;
                if (volume > volumeBudget) {
                    throw new ContentValidationError(
                        "content",
                        "Incoming link analysis budget exceeded; deletion was not performed.",
                        { code: "page.incoming_analysis_budget" },
                        [
                            {
                                code: "page.incoming_analysis_budget",
                                severity: "error",
                                message: "Incoming link analysis is incomplete; deletion was not performed.",
                            },
                        ],
                    );
                }
                const { document } = parseHTML("<!doctype html><html><body></body></html>");
                document.body.innerHTML = page.content;
                expandCompositions(document.body, definitions, "render", new WeakMap());
                const { links } = collectDocumentLinks(document.body, page.path, system.site.host);
                const paths = [...new Set(links.flatMap((link) => (link.path ? [link.path] : [])))];
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
