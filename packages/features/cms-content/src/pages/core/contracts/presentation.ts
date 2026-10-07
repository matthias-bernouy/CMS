import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { CmsPageNotFoundError } from "cms-content/pages/core/contracts/renamePage";
import {
    cmsPageRouteDetails,
    cmsPageSeoDetails,
    cmsPageId,
    cmsPageRevision,
    type CmsPageRouteDetails,
    type CmsPageSeoDetails,
} from "cms-content/pages/core/contracts/pageDetails";
import { pagePathsForSystem } from "cms-content/pages/core/lifecycle/pagePaths";

type PresentationRepository = Pick<CmsRepository, "getPageById" | "getSystem" | "setPagePaths" | "updatePage">;

export async function updateCmsPageRoute(
    repository: PresentationRepository,
    input: { readonly id: string; readonly expectedRevision: number; readonly language: string; readonly path: string },
): Promise<CmsPageRouteDetails> {
    const id = cmsPageId(input.id);
    const expectedRevision = cmsPageRevision(input.expectedRevision);
    const [page, system] = await Promise.all([repository.getPageById(id), repository.getSystem()]);
    if (!page) {
        throw new CmsPageNotFoundError(id);
    }
    const language = configuredLanguage(input.language, system.site.language, system.site.additionalLanguages);
    if (typeof input.path !== "string" || input.path.length > 2_048) {
        throw new TypeError("Invalid Page route path.");
    }
    const paths = pagePathsForSystem(page, system);
    const path = input.path.trim();
    if (path) {
        paths[language] = path;
    } else {
        delete paths[language];
    }
    if (!repository.setPagePaths) {
        throw new Error("Page route management is unavailable.");
    }
    const updated = await repository.setPagePaths(id, paths, system, undefined, expectedRevision);
    return cmsPageRouteDetails(updated, system);
}

export async function updateCmsPageSeo(
    repository: PresentationRepository,
    input: {
        readonly id: string;
        readonly expectedRevision: number;
        readonly language: string;
        readonly title?: string;
        readonly description?: string;
    },
): Promise<CmsPageSeoDetails> {
    const id = cmsPageId(input.id);
    const expectedRevision = cmsPageRevision(input.expectedRevision);
    const [page, system] = await Promise.all([repository.getPageById(id), repository.getSystem()]);
    if (!page) {
        throw new CmsPageNotFoundError(id);
    }
    const language = configuredLanguage(input.language, system.site.language, system.site.additionalLanguages);
    const seo = structuredClone(page.seo ?? {});
    const title = optionalText(input.title, 70, "SEO title");
    const description = optionalText(input.description, 200, "SEO description");
    if (title || description) {
        seo[language] = { ...(title ? { title } : {}), ...(description ? { description } : {}) };
    } else {
        delete seo[language];
    }
    const updated = await repository.updatePage({ id, seo }, expectedRevision);
    if (!updated) {
        throw new CmsPageNotFoundError(id);
    }
    return cmsPageSeoDetails(updated, system);
}

function configuredLanguage(value: unknown, primary: string, additional: readonly string[] | undefined): string {
    if (typeof value !== "string" || ![primary, ...(additional ?? [])].includes(value)) {
        throw new TypeError("The Page language is not configured for this site.");
    }
    return value;
}

function optionalText(value: unknown, maximum: number, label: string): string {
    if (value === undefined) {
        return "";
    }
    if (typeof value !== "string" || value.length > maximum) {
        throw new TypeError(`Invalid ${label}.`);
    }
    return value.trim();
}
