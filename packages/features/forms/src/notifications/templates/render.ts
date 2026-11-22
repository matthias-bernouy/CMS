import { lossless } from "forms/core/inputBounds";
import type { FormField } from "forms/application/schemas/fields";
import type { FormAnswer } from "forms/application/schemas/public";
import { FormsValidationError } from "forms/core/validation";
import { isNotificationContent, notificationLimits } from "forms/notifications/bounds";
import type { FormsNotificationComposer } from "forms/notifications/interfaces/FormsDelivery";
import { validateTemplates } from "forms/notifications/templates";
import { parseTemplate, templateTokens } from "forms/notifications/templates/tokens";

class BoundedText {
    private readonly chunks: string[] = [];
    private size = 0;
    private trailingHighSurrogate = false;
    constructor(private readonly subject: boolean) {}
    append(value: string): void {
        let size = this.subject ? value.length : new TextEncoder().encode(value).length;
        let trailing = this.trailingHighSurrogate;
        if (!this.subject && value.length) {
            const first = value.charCodeAt(0);
            if (trailing && first >= 0xdc00 && first <= 0xdfff) {
                size -= 2;
            }
            const last = value.charCodeAt(value.length - 1);
            trailing = last >= 0xd800 && last <= 0xdbff;
        }
        const limit = this.subject ? notificationLimits.subjectUnits : notificationLimits.textBytes;
        // A trailing surrogate may pair with the next chunk; settle its bytes before joining.
        const settledSize = this.size + size - (trailing ? 3 : 0);
        if (settledSize > limit || (this.subject && /[\r\n]/.test(value))) {
            throw new FormsValidationError("MALFORMED");
        }
        this.size += size;
        this.trailingHighSurrogate = trailing;
        this.chunks.push(value);
    }
    finish(): string {
        const limit = this.subject ? notificationLimits.subjectUnits : notificationLimits.textBytes;
        if (this.size > limit) {
            throw new FormsValidationError("MALFORMED");
        }
        return this.chunks.join("");
    }
}

function formatAnswer(field: FormField, answer: FormAnswer | undefined): string {
    if (!answer) {
        return "";
    }
    switch (field.kind) {
        case "number":
            return answer.number === undefined ? "" : String(answer.number);
        case "checkbox":
        case "consent":
            return answer.boolean === undefined ? "" : String(answer.boolean);
        case "single-choice":
        case "multiple-choice": {
            const selected = new Set(answer.optionIds);
            const output = new BoundedText(false);
            let first = true;
            for (const option of field.options ?? []) {
                if (selected.has(option.id)) {
                    if (!first) {
                        output.append(", ");
                    }
                    output.append(option.label);
                    first = false;
                }
            }
            return output.finish();
        }
        default:
            return answer.text ?? "";
    }
}
/** Render only published configuration; inserted values are literal and never parsed again. */
export const composeNotification: FormsNotificationComposer = (draft, input, id, receivedAt) => {
    if (!lossless(draft) || !lossless(input)) {
        throw new FormsValidationError("MALFORMED");
    }
    validateTemplates(draft);
    const answers = new Map(input.answers.map((answer) => [answer.fieldId, answer]));
    const values = new Map<string, string>([
        ["form.title", draft.title],
        ["submission.id", id],
        ["submission.receivedAt", receivedAt],
    ]);
    for (const field of draft.fields) {
        values.set(`answers.${field.id}`, formatAnswer(field, answers.get(field.id)));
    }
    const allowed = templateTokens(draft);
    const render = (source: string, subject: boolean) => {
        const output = new BoundedText(subject);
        for (const part of parseTemplate(source, allowed)) {
            output.append("literal" in part ? part.literal : values.get(part.token)!);
        }
        return output;
    };
    const subject = render(draft.notification.subjectTemplate, true).finish();
    const body = render(draft.notification.textTemplate, false);
    if (draft.notification.includeAnswers && draft.fields.length) {
        body.append("\n\n");
        for (const [index, field] of draft.fields.entries()) {
            if (index) {
                body.append("\n");
            }
            body.append(field.label);
            body.append(": ");
            body.append(values.get(`answers.${field.id}`)!);
        }
    }
    const content = { subject, text: body.finish() };
    if (!isNotificationContent(content)) {
        throw new FormsValidationError("MALFORMED");
    }
    return Object.freeze(content);
};
