import type { FormDraft } from "forms/application/schemas/authoring";
import { FormsValidationError } from "forms/core/validation";
export type TemplatePart = { readonly literal: string } | { readonly token: string };
export function templateTokens(draft: FormDraft): ReadonlySet<string> {
    return new Set([
        "form.title",
        "submission.id",
        "submission.receivedAt",
        ...draft.fields.map((field) => `answers.${field.id}`),
    ]);
}
/** The single closed grammar shared by publication validation and composition. */
export function parseTemplate(template: string, allowed: ReadonlySet<string>): TemplatePart[] {
    const parts: TemplatePart[] = [];
    let offset = 0;
    for (const match of template.matchAll(/\{\{([^{}]+)\}\}/g)) {
        const literal = template.slice(offset, match.index);
        if (/[{}]/.test(literal) || !allowed.has(match[1]!)) {
            throw new FormsValidationError("MALFORMED");
        }
        parts.push({ literal }, { token: match[1]! });
        offset = match.index + match[0].length;
    }
    const literal = template.slice(offset);
    if (/[{}]/.test(literal)) {
        throw new FormsValidationError("MALFORMED");
    }
    parts.push({ literal });
    return parts;
}
