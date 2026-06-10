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
