import type { TTemplate } from "cms-content/interfaces/templates";
import { ContentValidationError } from "cms-content/core/errors";
import { isValidSnippetIdentifier } from "cms-content/core/validation/predicates";
import { validateLabel, validateOptionalText, validateCategory, validateContent, validateId } from "cms-content/core/validation/fields";

/** Template identifier: same kebab-case rule as snippets. */
export function validateTemplateIdentifier(value: string): string {
    if (value.length === 0) throw new ContentValidationError("identifier", "required");
    if (!isValidSnippetIdentifier(value)) {
        throw new ContentValidationError("identifier", "use kebab-case (lowercase letters, digits, single dashes)");
    }
    return value;
}

/**
 * Validate + normalize a template patch. Only present fields are checked;
 * returned fields are normalized. Throws `ContentValidationError`.
 */
export function validateTemplatePatch(template: Partial<TTemplate>): Partial<TTemplate> {
    const out: Partial<TTemplate> = { ...template };
    if (template.id          !== undefined) out.id          = validateId(template.id);
    if (template.identifier  !== undefined) out.identifier  = validateTemplateIdentifier(template.identifier);
    if (template.name        !== undefined) out.name        = validateLabel("name", template.name, 50);
    if (template.description !== undefined) out.description = validateOptionalText("description", template.description, 200);
    if (template.category    !== undefined) out.category    = validateCategory(template.category);
    if (template.content     !== undefined) out.content     = validateContent(template.content);
    return out;
}
