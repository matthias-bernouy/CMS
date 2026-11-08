import type { z } from "zod";
import type { siteSettingsSchema } from "content/application/schemas/site";
import { validatePageReference } from "content/pages/core/routing/values";
import type { ContentRepository } from "content/application/interfaces/ContentRepository";
import type { ContentServices } from "content/application/interfaces/ContentServices";
import type { TSystem } from "content/settings/interfaces/settings";
import { ContentCapabilityError } from "./errors";
const PAGE_FIELDS = ["notFound", "forbidden", "serverError", "login"] as const;
type SitePageSettings = Pick<TSystem["site"], (typeof PAGE_FIELDS)[number]>;
export function projectSite(
    system: Awaited<ReturnType<ContentServices["repo"]["updateSystem"]>>,
    revision: number,
): z.output<typeof siteSettingsSchema> {
    return {
        revision,
        name: system.site.name,
        host: system.site.host,
        visible: system.site.visible,
        notFound: system.site.notFound,
        forbidden: system.site.forbidden,
        serverError: system.site.serverError,
        login: system.site.login,
    };
}

export async function sitePageSettings(
    repository: ContentRepository,
    input: Readonly<Record<string, unknown>>,
): Promise<Partial<SitePageSettings>> {
    const pages: Partial<SitePageSettings> = {};
    for (const field of PAGE_FIELDS) {
        const value = input[field];
        if (value === undefined) {
            continue;
        }
        try {
            pages[field] =
                value === null ? null : validatePageReference(value as Exclude<SitePageSettings[typeof field], null>);
        } catch {
            throw new ContentCapabilityError("INVALID_INPUT");
        }
    }
    const pageIds = new Set(Object.values(pages).flatMap((reference) => (reference ? [reference.pageId] : [])));
    for (const pageId of pageIds) {
        if (!(await repository.getPageById(pageId))) {
            throw new ContentCapabilityError("INVALID_INPUT");
        }
    }
    return pages;
}

export function text(value: unknown): string {
    if (typeof value !== "string") {
        throw new ContentCapabilityError("INVALID_INPUT");
    }
    return value;
}

export function boolean(value: unknown): boolean {
    if (typeof value !== "boolean") {
        throw new ContentCapabilityError("INVALID_INPUT");
    }
    return value;
}
