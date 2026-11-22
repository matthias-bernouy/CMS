import { validationReasons } from "forms/application/schemas/issues";
import type { ValidationIssue, ValidationReason } from "forms/application/schemas/issues";

export const idValid = (id: string) => /^[a-z][a-z0-9_-]{0,63}$/.test(id);
export class FormsValidationError extends Error {
    readonly issue: ValidationIssue;

    constructor(reason: ValidationReason, fieldId?: string) {
        super("Invalid forms data");
        this.name = "FormsValidationError";
        const safeReason = validationReasons.includes(reason) ? reason : "MALFORMED";
        this.issue =
            typeof fieldId === "string" && idValid(fieldId) ? { reason: safeReason, fieldId } : { reason: safeReason };
    }
}
export function fail(reason: ValidationReason, fieldId?: string): never {
    throw new FormsValidationError(reason, fieldId);
}
