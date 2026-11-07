import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { gatewayAuditAppendInvalidinputErrorSchema } from "repository/application/installations/schemas/common/errors";
export const initializationApplyInputSchema = z.strictObject({
    "root": z
        .strictObject({
            "publisherId": contractString({ "maxLength": 96 }),
            "collectionId": contractString({ "maxLength": 193 }),
            "version": contractString({ "maxLength": 64 }),
            "digest": contractString({ "maxLength": 71 }),
            "bootstrapId": contractString({ "maxLength": 96 }),
        })
        .nullable(),
    "planDigest": contractString({ "maxLength": 71 }),
    "locale": contractString({ "maxLength": 64 }).optional(),
});
export const initializationApplyOutputSchema = z.strictObject({
    "status": contractString({ "enum": ["unavailable", "pending", "running", "completed"], "maxLength": 16 }),
    "revision": z.int().min(0).max(9007199254740991),
    "completedPages": z.int().min(0).max(9007199254740991),
    "totalPages": z.int().min(0).max(9007199254740991),
    "planDigest": contractString({ "maxLength": 71 }),
    "rootJson": contractString({ "maxLength": 2048 }),
    "locale": contractString({ "maxLength": 64 }),
    "redirectPath": contractString({ "maxLength": 2048 }),
});
export const initializationApplyErrors = {
    NOT_FOUND: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    REVISION_CONFLICT: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    UPGRADE_IN_PROGRESS: { retryable: true, output: gatewayAuditAppendInvalidinputErrorSchema },
    INVALID_INPUT: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: gatewayAuditAppendInvalidinputErrorSchema },
    FORBIDDEN: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    RELEASE_MISMATCH: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    IDEMPOTENCY_CONFLICT: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    IDEMPOTENCY_KEY_REQUIRED: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    PROVIDER_SHUTTING_DOWN: { retryable: true, output: gatewayAuditAppendInvalidinputErrorSchema },
};
