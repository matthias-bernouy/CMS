import type { TTemplate } from "cms-content/interfaces/templates";
import { ContentValidationError } from "cms-content/core/errors";
import { isValidResourceIdentifier } from "cms-content/core/validation/predicates";
import {
    validateLabel,
    validateOptionalText,
    validateCategory,
    validateContent,
    validateId,
} from "cms-content/core/validation/fields";

/** Template identifier: kebab-case. */
export function validateTemplateIdentifier(value: string): string {
    if (value.length === 0) {
        throw new ContentValidationError("identifier", "required");
    }
    if (!isValidResourceIdentifier(value)) {
        throw new ContentValidationError("identifier", "use kebab-case (lowercase letters, digits, single dashes)");
    }
    return value;
}

export function validateTemplateCreate(template: Partial<Omit<TTemplate, "id">>): Omit<TTemplate, "id"> {
    return {
        identifier: validateTemplateIdentifier(requiredString(template.identifier, "identifier")),
        name: validateLabel("name", requiredString(template.name, "name"), 50),
        description: validateOptionalText("description", requiredString(template.description, "description"), 200),
        content: validateContent(requiredString(template.content, "content")),
        category: validateCategory(requiredString(template.category, "category")),
        createdAt: validateDate(template.createdAt, "createdAt"),
    };
}

/**
 * Validate + normalize a template patch. Only present fields are checked;
 * returned fields are normalized. Throws `ContentValidationError`.
 */
export function validateTemplatePatch(template: Partial<TTemplate>): Partial<TTemplate> {
    const out: Partial<TTemplate> = { ...template };
    if (template.id !== undefined) {
        out.id = validateId(template.id);
    }
    if (template.identifier !== undefined) {
        out.identifier = validateTemplateIdentifier(template.identifier);
    }
    if (template.name !== undefined) {
        out.name = validateLabel("name", template.name, 50);
    }
    if (template.description !== undefined) {
        out.description = validateOptionalText("description", template.description, 200);
    }
    if (template.category !== undefined) {
        out.category = validateCategory(template.category);
    }
    if (template.content !== undefined) {
        out.content = validateContent(template.content);
    }
    return out;
}

function requiredString(value: unknown, field: string): string {
    if (typeof value !== "string") {
        throw new ContentValidationError(field, "required");
    }
    return value;
}

function validateDate(value: unknown, field: string): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        throw new ContentValidationError(field, "valid Date expected");
    }
    return value;
}
