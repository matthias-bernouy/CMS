import { capabilitiesFor, contractString, z } from "@bernouy/ulvia-sdk";
import { validationIssueSchema } from "forms/application/schemas/issues";
import type { FormsServices } from "forms/interfaces/services";
export const defineCapability = capabilitiesFor<FormsServices>();
const output = z.strictObject({
    message: contractString({ minLength: 1, maxLength: 500 }),
    issue: validationIssueSchema.optional(),
});
export const errors = {
    INVALID_INPUT: { retryable: false, output },
    FORM_NOT_FOUND: { retryable: false, output },
    REVISION_CONFLICT: { retryable: false, output },
    IDEMPOTENCY_CONFLICT: { retryable: false, output },
    FORM_CLOSED: { retryable: false, output },
    VERSION_CONFLICT: { retryable: false, output },
    SUBMISSION_NOT_ALLOWED: { retryable: false, output },
    SUBMISSION_GONE: { retryable: false, output },
    EMAILER_UNAVAILABLE: { retryable: false, output },
    RATE_LIMITED: { retryable: true, output },
    CORE_UNAVAILABLE: { retryable: true, output },
};
const errorStatuses = {
    INVALID_INPUT: 422,
    FORM_NOT_FOUND: 404,
    REVISION_CONFLICT: 409,
    IDEMPOTENCY_CONFLICT: 409,
    FORM_CLOSED: 409,
    VERSION_CONFLICT: 409,
    SUBMISSION_NOT_ALLOWED: 403,
    SUBMISSION_GONE: 410,
    EMAILER_UNAVAILABLE: 409,
    RATE_LIMITED: 429,
    CORE_UNAVAILABLE: 503,
};
const response = { successStatuses: [200], contentTypes: ["application/json"], errorStatuses };
export const query = { effect: "query", execution: "sync", sensitive: true } as const;
export const command = { effect: "command", execution: "sync", sensitive: true, idempotency: "natural" } as const;
export const mcp = { id: "mcp", transport: "mcp" } as const;
export const http = (method: "POST" | "QUERY" | "PUT" | "DELETE", path: string) =>
    ({ id: "http", transport: "http", method, path, input: { body: true }, response }) as const;
