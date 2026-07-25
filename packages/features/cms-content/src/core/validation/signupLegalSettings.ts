import { ContentValidationError } from "cms-content/core/validation/errors";
import type { SignupLegalDocumentSettings } from "cms-content/interfaces/settings";

const MAX_DOCUMENTS = 16;
const MAX_KEY_LENGTH = 100;
const MAX_LABEL_LENGTH = 200;
const MAX_CONSENT_LENGTH = 2_000;
const MAX_PAGE_ID_LENGTH = 512;

export function validateSignupLegalDocuments(documents: SignupLegalDocumentSettings[]): SignupLegalDocumentSettings[] {
    if (!Array.isArray(documents) || documents.length > MAX_DOCUMENTS) {
        throw new ContentValidationError(
            "auth.signupLegalDocuments",
            `must be an array containing at most ${MAX_DOCUMENTS} documents.`,
        );
    }

    const keys = new Set<string>();
    return documents.map((document, index) => {
        const field = `auth.signupLegalDocuments.${index}`;
        if (!document || typeof document !== "object" || Array.isArray(document)) {
            throw new ContentValidationError(field, "must be an object.");
        }
        const normalized = {
            key: requiredString(document.key, `${field}.key`, MAX_KEY_LENGTH),
            label: requiredString(document.label, `${field}.label`, MAX_LABEL_LENGTH),
            consentText: requiredString(document.consentText, `${field}.consentText`, MAX_CONSENT_LENGTH),
            pageId: requiredString(document.pageId, `${field}.pageId`, MAX_PAGE_ID_LENGTH),
            enabled: document.enabled,
        };
        if (typeof normalized.enabled !== "boolean") {
            throw new ContentValidationError(`${field}.enabled`, "must be a boolean.");
        }
        if (keys.has(normalized.key)) {
            throw new ContentValidationError(`${field}.key`, "must be unique.");
        }
        keys.add(normalized.key);
        return normalized;
    });
}

function requiredString(value: unknown, field: string, maximum: number): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new ContentValidationError(field, "is required.");
    }
    const normalized = value.trim();
    if (normalized.length > maximum) {
        throw new ContentValidationError(field, `must contain at most ${maximum} characters.`);
    }
    return normalized;
}
