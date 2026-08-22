import { isSourceUrn } from "@bernouy/cms-sources";
import type { PageIndexingConfiguration, TPage } from "cms-content/interfaces/pages";
import { ContentValidationError } from "cms-content/core/validation/errors";
import { isValidPathFormat } from "cms-content/core/validation/predicates";
import { isCmsQueryParamName } from "cms-content/interfaces/Editor/BindingSyntax";
import {
    validateLabel,
    validateOptionalText,
    validateContent,
    validateTags,
    validateId,
} from "cms-content/core/validation/fields";

const MAX_INDEXING_REFERENCE_LENGTH = 512;
const MAX_INDEXING_TEMPLATE_LENGTH = 10_000;

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

export function validatePageIndexingConfiguration(value: unknown): PageIndexingConfiguration {
    if (!isRecord(value)) {
        throw new ContentValidationError("indexing", "object expected");
    }
    if (value.mode === "disabled") {
        return { mode: "disabled" };
    }
    if (value.mode !== "entity") {
        throw new ContentValidationError("indexing.mode", "must be disabled or entity");
    }

    const sourceUrn = requiredIndexingText(value.sourceUrn, "indexing.sourceUrn");
    if (!isSourceUrn(sourceUrn)) {
        throw new ContentValidationError("indexing.sourceUrn", "source URN expected");
    }
    const entityId = requiredIndexingText(value.entityId, "indexing.entityId");
    const pageQueryParam = requiredIndexingText(value.pageQueryParam, "indexing.pageQueryParam");
    if (!isCmsQueryParamName(pageQueryParam)) {
        throw new ContentValidationError("indexing.pageQueryParam", "invalid CMS query parameter name");
    }

    const titleTemplate = optionalIndexingTemplate(value.titleTemplate, "indexing.titleTemplate");
    const descriptionTemplate = optionalIndexingTemplate(value.descriptionTemplate, "indexing.descriptionTemplate");
    return {
        mode: "entity",
        sourceUrn,
        entityId,
        pageQueryParam,
        ...(titleTemplate ? { titleTemplate } : {}),
        ...(descriptionTemplate ? { descriptionTemplate } : {}),
    };
}

/**
 * Validate + normalize a page patch (the shape `updatePage` receives). Only
 * present fields are checked; each returned field is normalized (trimmed,
 * hardened, deduped). Throws `ContentValidationError` on the first offender.
 */
export function validatePagePatch(page: Partial<TPage>): Partial<TPage> {
    const out: Partial<TPage> = { ...page };
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
    return out;
}

function requiredIndexingText(value: unknown, field: string): string {
    if (typeof value !== "string") {
        throw new ContentValidationError(field, "string expected");
    }
    return validateLabel(field, value, MAX_INDEXING_REFERENCE_LENGTH);
}

function optionalIndexingTemplate(value: unknown, field: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new ContentValidationError(field, "string expected");
    }
    return validateOptionalText(field, value, MAX_INDEXING_TEMPLATE_LENGTH) || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
