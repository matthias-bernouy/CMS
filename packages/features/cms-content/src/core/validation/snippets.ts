import type { TSnippet } from "cms-content/interfaces/snippets";
import { ContentValidationError } from "cms-content/core/errors";
import { isValidSnippetIdentifier } from "cms-content/core/validation/predicates";
import { validateLabel, validateOptionalText, validateCategory, validateContent, validateId } from "cms-content/core/validation/fields";

/** Snippet identifier: kebab-case (see `isValidSnippetIdentifier`). */
export function validateSnippetIdentifier(value: string): string {
    if (value.length === 0) throw new ContentValidationError("identifier", "required");
    if (!isValidSnippetIdentifier(value)) {
        throw new ContentValidationError("identifier", "use kebab-case (lowercase letters, digits, single dashes)");
    }
    return value;
}

export function validateSnippetCreate(snippet: Partial<Omit<TSnippet, "id">>): Omit<TSnippet, "id"> {
    return {
        identifier:  validateSnippetIdentifier(requiredString(snippet.identifier, "identifier")),
        name:        validateLabel("name", requiredString(snippet.name, "name"), 50),
        description: validateOptionalText("description", requiredString(snippet.description, "description"), 200),
        content:     validateContent(requiredString(snippet.content, "content")),
        category:    validateCategory(requiredString(snippet.category, "category")),
        createdAt:   validateDate(snippet.createdAt, "createdAt"),
        updatedAt:   validateDate(snippet.updatedAt, "updatedAt"),
    };
}

/**
 * Validate + normalize a snippet patch. Only present fields are checked;
 * returned fields are normalized. Throws `ContentValidationError`.
 */
export function validateSnippetPatch(snippet: Partial<TSnippet>): Partial<TSnippet> {
    const out: Partial<TSnippet> = { ...snippet };
    if (snippet.id          !== undefined) out.id          = validateId(snippet.id);
    if (snippet.identifier  !== undefined) out.identifier  = validateSnippetIdentifier(snippet.identifier);
    if (snippet.name        !== undefined) out.name        = validateLabel("name", snippet.name, 50);
    if (snippet.description !== undefined) out.description = validateOptionalText("description", snippet.description, 200);
    if (snippet.category    !== undefined) out.category    = validateCategory(snippet.category);
    if (snippet.content     !== undefined) out.content     = validateContent(snippet.content);
    return out;
}

function requiredString(value: unknown, field: string): string {
    if (typeof value !== "string") throw new ContentValidationError(field, "required");
    return value;
}

function validateDate(value: unknown, field: string): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        throw new ContentValidationError(field, "valid Date expected");
    }
    return value;
}
