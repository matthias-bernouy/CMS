import type { TPage } from "cms-content/interfaces/pages";
import { ContentValidationError } from "cms-content/core/errors";
import { isValidPathFormat } from "cms-content/core/validation/predicates";
import { validateLabel, validateOptionalText, validateContent, validateTags, validateId } from "cms-content/core/validation/fields";

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

/**
 * Validate + normalize a page patch (the shape `updatePage` receives). Only
 * present fields are checked; each returned field is normalized (trimmed,
 * hardened, deduped). Throws `ContentValidationError` on the first offender.
 */
export function validatePagePatch(page: Partial<TPage>): Partial<TPage> {
    const out: Partial<TPage> = { ...page };
    if (page.id          !== undefined) out.id          = validateId(page.id);
    if (page.title       !== undefined) out.title       = validatePageTitle(page.title);
    if (page.path        !== undefined) out.path        = validatePagePath(page.path);
    if (page.content     !== undefined) out.content     = validateContent(page.content);
    if (page.description !== undefined) out.description = validateOptionalText("description", page.description, 200);
    if (page.tags        !== undefined) out.tags        = validateTags(page.tags);
    if (page.visible     !== undefined) {
        if (typeof page.visible !== "boolean") throw new ContentValidationError("visible", "boolean expected");
        out.visible = page.visible;
    }
    return out;
}
