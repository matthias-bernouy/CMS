import { capabilitiesFor, contractString, z } from "@bernouy/ulvia-sdk";
import type { EmailTemplates } from "email-templates/core/EmailTemplates";

export interface EmailTemplateServices {
    readonly emailTemplates: Pick<
        EmailTemplates,
        "create" | "get" | "list" | "updateDraft" | "publish" | "archive" | "getVersion" | "preview" | "render"
    >;
}
export const defineCapability = capabilitiesFor<EmailTemplateServices>();
const payload = z.strictObject({ message: contractString({ minLength: 1, maxLength: 256 }) });
export const errors = {
    INVALID_INPUT: { retryable: false, output: payload },
    NOT_FOUND: { retryable: false, output: payload },
    REVISION_CONFLICT: { retryable: false, output: payload },
    CAPACITY_EXCEEDED: { retryable: false, output: payload },
    ARCHIVED: { retryable: false, output: payload },
    CORE_UNAVAILABLE: { retryable: true, output: payload },
};
export const response = {
    successStatuses: [200],
    contentTypes: ["application/json"],
    errorStatuses: {
        INVALID_INPUT: 422,
        NOT_FOUND: 404,
        REVISION_CONFLICT: 409,
        CAPACITY_EXCEEDED: 409,
        ARCHIVED: 409,
        CORE_UNAVAILABLE: 503,
    },
};
