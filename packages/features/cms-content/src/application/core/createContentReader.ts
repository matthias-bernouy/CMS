import { resolvePublishedRoute } from "cms-content/pages/core/queries/resolvePublishedRoute";
import { projectRenderingSettings } from "cms-content/settings/core/renderingSettings";
import { projectPublishedPage } from "cms-content/pages/core/queries/publishedPage";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { ContentReader } from "cms-content/application/interfaces/ContentReader";

/**
 * Creates a public-rendering facade over an authoring repository.
 *
 * The returned object deliberately has no repository back-reference and does
 * not expose editorial page operations.
 */
export function createContentReader(repository: CmsRepository): ContentReader {
    return {
        getCollectionRevision: async () => (await repository.getInstalledCollections?.())?.revision ?? 0,
        getCollectionTexts: async () =>
            ((await repository.getInstalledCollections?.())?.collections ?? []).map((item) => ({
                collection: item.release,
                overrides: item.textOverrides,
            })),
        getPublishedPage: async (path) => projectPublishedPage(await repository.getPublishedPage(path)),
        getPublishedPageById: async (id) => projectPublishedPage(await repository.getPublishedPageById(id)),
        getPublishedPages: async () =>
            (await repository.getPublishedPages())
                .map((page) => projectPublishedPage(page))
                .filter((page): page is NonNullable<typeof page> => page !== null),
        resolvePublishedRoute: async (path) => {
            const resolved = await resolvePublishedRoute(path, repository);
            if (resolved?.kind !== "current") {
                return resolved;
            }
            const page = projectPublishedPage(resolved.page);
            return page ? { ...resolved, page } : { kind: "unavailable" };
        },
        getRenderableBlocs: async () =>
            (await repository.getBlocsList({ includeInactive: true })).map((bloc) => ({
                id: bloc.id,
                ...(bloc.compositionHTML ? { compositionHTML: bloc.compositionHTML } : {}),
                ...(bloc.componentHTML ? { componentHTML: bloc.componentHTML } : {}),
                ...(bloc.nativeElement ? { nativeElement: bloc.nativeElement } : {}),
            })),
        getBlocViewJS: (tag) => repository.getBlocViewJS(tag),
        getRenderingSettings: async () => projectRenderingSettings(await repository.getSystem()),
    };
}
