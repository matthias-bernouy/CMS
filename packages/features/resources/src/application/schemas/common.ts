import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const emptySchema = z.strictObject({});
export const digestSchema = contractString({ minLength: 71, maxLength: 71 });
export const localeSchema = contractString({ minLength: 2, maxLength: 64 });
export const reviewJsonSchema = contractString({ minLength: 2, maxLength: 1048576 });
const resourceFailureSchema = z.strictObject({ message: contractString({ maxLength: 512 }) });
export const initializationErrors = {
    NOT_FOUND: { retryable: false, output: resourceFailureSchema },
    FORBIDDEN: { retryable: false, output: resourceFailureSchema },
    INVALID_INPUT: { retryable: false, output: resourceFailureSchema },
    REVISION_CONFLICT: { retryable: false, output: resourceFailureSchema },
    INITIALIZATION_BUSY: { retryable: true, output: resourceFailureSchema },
    CORE_UNAVAILABLE: { retryable: true, output: resourceFailureSchema },
};
export const initializationErrorStatuses = {
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    INVALID_INPUT: 422,
    REVISION_CONFLICT: 409,
    INITIALIZATION_BUSY: 423,
    CORE_UNAVAILABLE: 503,
} as const;

export const initializationApplyErrors = {
    ...initializationErrors,
    IDEMPOTENCY_CONFLICT: { retryable: false, output: resourceFailureSchema },
    IDEMPOTENCY_KEY_REQUIRED: { retryable: false, output: resourceFailureSchema },
    PROVIDER_SHUTTING_DOWN: { retryable: true, output: resourceFailureSchema },
};
