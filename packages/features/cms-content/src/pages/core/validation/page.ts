import type { PageContributionOrigin, PageCreateOptions, TPage } from "cms-content/pages/interfaces/pages";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { isValidPathFormat } from "cms-content/application/core/validation/predicates";
import { validatePageIndexingConfiguration } from "cms-content/pages/core/validation/indexing";
import { validatePageSeo } from "cms-content/pages/core/validation/seo";
import {
    validateLabel,
    validateOptionalText,
    validateContent,
    validateTags,
    validateId,
} from "cms-content/application/core/validation/fields";

/** Page path: `/seg/seg` shape (see `isValidPathFormat`). */
export function validatePagePath(value: string): string {
    if (!isValidPathFormat(value)) {
        throw new ContentValidationError("path", "must start with '/' and contain only [a-zA-Z0-9-/]");
    }
    return value;
}

/** Page title: required, ≤70, no control chars. */
export function validatePageTitle(value: string): string {
    return validateLabel("title", value, 70);
}

export function validatePageCreateOptions(options: PageCreateOptions | undefined): PageCreateOptions | undefined {
    if (!options) {
        return undefined;
    }
    if (options.surface !== undefined && options.surface !== "control" && options.surface !== "delivery") {
        throw new ContentValidationError("surface", "must be control or delivery");
    }
    return {
        ...(options.surface ? { surface: options.surface } : {}),
        ...(options.origin ? { origin: validatePageOrigin(options.origin) } : {}),
    };
}

function validatePageOrigin(origin: PageContributionOrigin): PageContributionOrigin {
    const identifier = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
    const version = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
    if (
        !identifier.test(origin.sourceId) ||
        !identifier.test(origin.contributionId) ||
        !identifier.test(origin.pageId) ||
        !version.test(origin.version) ||
        !/^sha256:[0-9a-f]{64}$/u.test(origin.digest) ||
        !Number.isSafeInteger(origin.generation) ||
        origin.generation < 1
    ) {
        throw new ContentValidationError("origin", "must identify one exact contributed Page");
    }
    return structuredClone(origin);
}

/**
 * Validate + normalize a page patch (the shape `updatePage` receives). Only
 * present fields are checked; each returned field is normalized (trimmed,
 * hardened, deduped). Throws `ContentValidationError` on the first offender.
 */
export function validatePagePatch(page: Partial<TPage>): Partial<TPage> {
    const out: Partial<TPage> = { ...page };
    // Language paths are managed by setPagePaths so route reservations stay in sync.
    delete out.paths;
    if (page.id !== undefined) {
        out.id = validateId(page.id);
    }
    if (page.title !== undefined) {
        out.title = validatePageTitle(page.title);
    }
    if (page.path !== undefined) {
        out.path = validatePagePath(page.path);
    }
    if (page.content !== undefined) {
        out.content = validateContent(page.content);
    }
    if (page.description !== undefined) {
        out.description = validateOptionalText("description", page.description, 200);
    }
    if (page.seo !== undefined) {
        out.seo = validatePageSeo(page.seo);
    }
    if (page.tags !== undefined) {
        out.tags = validateTags(page.tags);
    }
    if (page.visible !== undefined) {
        if (typeof page.visible !== "boolean") {
            throw new ContentValidationError("visible", "boolean expected");
        }
        out.visible = page.visible;
    }
    if (page.indexing !== undefined) {
        out.indexing = validatePageIndexingConfiguration(page.indexing);
    }
    if (page.surface !== undefined && page.surface !== "control" && page.surface !== "delivery") {
        throw new ContentValidationError("surface", "must be control or delivery");
    }
    if (page.origin !== undefined) {
        throw new ContentValidationError("origin", "cannot change after Page creation");
    }
    return out;
}
