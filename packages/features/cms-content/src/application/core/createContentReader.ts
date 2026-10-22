import { resolvePublishedRoute } from "cms-content/pages/core/queries/resolvePublishedRoute";
import { projectRenderingSettings } from "cms-content/settings/core/renderingSettings";
import { projectPublishedPage } from "cms-content/pages/core/queries/publishedPage";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { ContentReader, RenderablePage } from "cms-content/application/interfaces/ContentReader";
import type { RegisteredPageRoute } from "cms-content/pages/interfaces/routing";

export type ContentReaderOptions = {
    readonly resolvePageRoute?: (path: string) => Promise<RegisteredPageRoute | null>;
};

/**
 * Creates a public-rendering facade over an authoring repository.
 *
 * The returned object deliberately has no repository back-reference and does
 * not expose editorial page operations.
 */
export function createContentReader(repository: CmsRepository, options: ContentReaderOptions = {}): ContentReader {
    const contributedPages = async (): Promise<readonly RenderablePage[]> =>
        (await repository.getContentContributions?.())?.pages ?? [];
    const sitePage = async (page: NonNullable<ReturnType<typeof projectPublishedPage>>): Promise<RenderablePage> => ({
        reference: { kind: "site", pageId: page.id },
        page,
        source: { kind: "site", pageId: page.id, revision: page.revision },
        requirements: [...((await repository.getPageRequirements?.(page)) ?? [])],
    });
    const getRenderablePage = async (path: string): Promise<RenderablePage | null> => {
        const local = projectPublishedPage(await repository.getPublishedPage(path));
        if (local) {
            return sitePage(local);
        }
        return (await contributedPages()).find(({ page }) => page.path === path && page.visible) ?? null;
    };
    const getRenderablePages = async (): Promise<RenderablePage[]> => {
        const local = await Promise.all(
            (await repository.getPublishedPages())
                .map((page) => projectPublishedPage(page))
                .filter((page): page is NonNullable<typeof page> => page !== null)
                .map(sitePage),
        );
        return [...local, ...(await contributedPages()).filter(({ page }) => page.visible)];
    };
    const registeredPage = async (route: RegisteredPageRoute): Promise<RenderablePage | null> => {
        if (route.page.kind === "site") {
            const page = projectPublishedPage(await repository.getPublishedPageById(route.page.pageId));
            return page ? sitePage(page) : null;
        }
        const contribution = route.page;
        return (
            (await contributedPages()).find(
                ({ reference }) =>
                    reference.kind === "contribution" &&
                    reference.sourceId === contribution.sourceId &&
                    reference.contributionId === contribution.contributionId &&
                    reference.pageId === contribution.pageId,
            ) ?? null
        );
    };
    return {
        getContentRevision: async () => (await repository.getContentContributions?.())?.revision ?? 0,
        getRenderingRevision: async () => {
            const [contentRevision, systemRevision] = await Promise.all([
                repository.getContentContributions?.().then((contributions) => contributions.revision) ?? 0,
                repository.getSystemRevision?.() ?? 0,
            ]);
            return JSON.stringify([contentRevision, systemRevision]);
        },
        getContentTexts: async () => [...((await repository.getContentContributions?.())?.texts ?? [])],
        getRenderablePage,
        getRenderablePages,
        resolvePageReference: async (reference) => {
            if (reference.kind === "site") {
                return projectPublishedPage(await repository.getPublishedPageById(reference.pageId))?.path ?? null;
            }
            return (
                (await contributedPages()).find(
                    ({ reference: candidate }) =>
                        candidate.kind === "contribution" &&
                        candidate.sourceId === reference.sourceId &&
                        candidate.contributionId === reference.contributionId &&
                        candidate.pageId === reference.pageId,
                )?.page.path ?? null
            );
        },
        resolvePagePaths: async (paths) => {
            const requested = new Set(paths);
            const resolved: Record<string, string> = {};
            await Promise.all(
                [...requested].map(async (path) => {
                    const route = await repository.getPageRoute(path);
                    if (route?.state === "gone") {
                        return;
                    }
                    const page = route
                        ? projectPublishedPage(await repository.getPublishedPageById(route.pageId))
                        : null;
                    if (page) {
                        resolved[path] = page.path;
                        return;
                    }
                    const registered = await options.resolvePageRoute?.(path);
                    if (registered) {
                        resolved[path] = registered.path;
                    }
                }),
            );
            for (const renderable of await contributedPages()) {
                if (renderable.source.kind !== "contribution") {
                    continue;
                }
                const authoredPath = renderable.source.defaultPath;
                if (requested.has(authoredPath) && resolved[authoredPath] === undefined) {
                    resolved[authoredPath] = renderable.page.path;
                }
            }
            return resolved;
        },
        resolveRenderableRoute: async (path) => {
            const resolved = await resolvePublishedRoute(path, repository);
            if (resolved?.kind === "current") {
                const page = projectPublishedPage(resolved.page);
                return page ? { ...resolved, page: await sitePage(page) } : { kind: "unavailable" as const };
            }
            if (resolved) {
                return resolved;
            }
            const registered = await options.resolvePageRoute?.(path);
            if (registered) {
                if (registered.path !== path) {
                    return { kind: "redirect", path: registered.path };
                }
                const page = await registeredPage(registered);
                return page?.page.visible
                    ? { kind: "current", page, language: page.language ?? "en" }
                    : { kind: "unavailable" as const };
            }
            const contributed = await getRenderablePage(path);
            return contributed ? { kind: "current", page: contributed, language: contributed.language ?? "en" } : null;
        },
        getPublishedPage: async (path) => (await getRenderablePage(path))?.page ?? null,
        getPublishedPageById: async (id) => projectPublishedPage(await repository.getPublishedPageById(id)),
        getPublishedPages: async () => (await getRenderablePages()).map(({ page }) => page),
        resolvePublishedRoute: async (path) => {
            const resolved = await resolvePublishedRoute(path, repository);
            if (resolved?.kind !== "current") {
                return resolved;
            }
            const page = projectPublishedPage(resolved.page);
            return page ? { ...resolved, page } : { kind: "unavailable" };
        },
        getRenderableBlocs: async () =>
            (await repository.getBlocsList({ includeHidden: true })).map((bloc) => ({
                id: bloc.id,
                kind: bloc.kind,
                markupHTML: bloc.markupHTML,
                ...(bloc.browser ? { browser: bloc.browser } : {}),
                ...(bloc.uses?.length ? { uses: [...bloc.uses] } : {}),
                root: bloc.root,
                ...(bloc.styleCSS ? { styleCSS: bloc.styleCSS } : {}),
                ...(bloc.styleCollectionId ? { styleCollectionId: bloc.styleCollectionId } : {}),
                hasBehavior: bloc.hasBehavior,
            })),
        getBlocViewJS: (tag) => repository.getBlocViewJS(tag),
        getRenderingSettings: async () => projectRenderingSettings(await repository.getSystem()),
    };
}
