import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { TPage } from "cms-content/pages/interfaces/pages";
import type { TSystem } from "cms-content/settings/interfaces/settings";
import { CmsPageNotFoundError } from "cms-content/pages/core/contracts/renamePage";

export type CmsPageDetails = Pick<
    TPage,
    "id" | "revision" | "surface" | "path" | "title" | "description" | "content" | "tags" | "visible"
>;

export type CmsPageEditingDetails = CmsPageDetails & {
    readonly routes: readonly CmsPageRouteEntry[];
    readonly seoEntries: readonly CmsPageSeoEntry[];
};

export type CmsPageRouteDetails = Pick<CmsPageDetails, "id" | "revision" | "path"> & {
    readonly routes: readonly CmsPageRouteEntry[];
};

export type CmsPageSeoDetails = Pick<CmsPageDetails, "id" | "revision"> & {
    readonly seoEntries: readonly CmsPageSeoEntry[];
};

type CmsPageRouteEntry = {
    readonly language: string;
    readonly path: string;
    readonly primary: boolean;
};

type CmsPageSeoEntry = {
    readonly language: string;
    readonly title: string;
    readonly description: string;
};

export async function getCmsPage(
    repository: Pick<CmsRepository, "getPageById" | "getSystem">,
    input: { readonly id: string },
): Promise<CmsPageEditingDetails> {
    const id = cmsPageId(input.id);
    const [page, system] = await Promise.all([repository.getPageById(id), repository.getSystem()]);
    if (!page) {
        throw new CmsPageNotFoundError(id);
    }
    return cmsPageEditingDetails(page, system);
}

export function cmsPageId(value: unknown): string {
    if (typeof value !== "string" || value.length === 0 || value.length > 200) {
        throw new TypeError("Invalid Page id.");
    }
    return value;
}

export function cmsPageRevision(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1) {
        throw new TypeError("Invalid expected Page revision.");
    }
    return value as number;
}

export function cmsPageDetails(page: TPage): CmsPageDetails {
    return {
        id: page.id,
        revision: page.revision,
        surface: page.surface,
        path: page.path,
        title: page.title,
        description: page.description,
        content: page.content,
        tags: [...page.tags],
        visible: page.visible,
    };
}

function cmsPageEditingDetails(page: TPage, system: TSystem): CmsPageEditingDetails {
    const languages = system.site.language ? [system.site.language, ...(system.site.additionalLanguages ?? [])] : [];
    return {
        ...cmsPageDetails(page),
        routes: languages.map((language) => ({
            language,
            path: page.paths?.[language] ?? (language === system.site.language ? page.path : ""),
            primary: language === system.site.language,
        })),
        seoEntries: languages.map((language) => ({
            language,
            title: page.seo?.[language]?.title ?? "",
            description: page.seo?.[language]?.description ?? "",
        })),
    };
}

export function cmsPageRouteDetails(page: TPage, system: TSystem): CmsPageRouteDetails {
    const details = cmsPageEditingDetails(page, system);
    return { id: details.id, revision: details.revision, path: details.path, routes: details.routes };
}

export function cmsPageSeoDetails(page: TPage, system: TSystem): CmsPageSeoDetails {
    const details = cmsPageEditingDetails(page, system);
    return { id: details.id, revision: details.revision, seoEntries: details.seoEntries };
}
