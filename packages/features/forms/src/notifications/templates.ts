import type { FormDraft } from "forms/application/schemas/authoring";
import { FormsValidationError } from "forms/core/validation";
import { parseTemplate, templateTokens } from "forms/notifications/templates/tokens";

export function validateTemplates(draft: FormDraft): void {
    const { subjectTemplate, textTemplate, enabled, includeAnswers } = draft.notification;
    const allowed = templateTokens(draft);
    for (const template of [subjectTemplate, textTemplate]) {
        parseTemplate(template, allowed);
    }
    if (
        /[\r\n]/.test(subjectTemplate) ||
        (enabled && (!subjectTemplate.trim() || (!textTemplate.trim() && !(includeAnswers && draft.fields.length))))
    ) {
        throw new FormsValidationError("MALFORMED");
    }
}
