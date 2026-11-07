import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { gatewayAuditAppendInvalidinputErrorSchema } from "repository/application/installations/schemas/common/errors";
export const initializationPlanInputSchema = z.strictObject({
    "root": z
        .strictObject({
            "publisherId": contractString({ "maxLength": 96 }),
            "collectionId": contractString({ "maxLength": 193 }),
            "version": contractString({ "maxLength": 64 }),
            "digest": contractString({ "maxLength": 71 }),
            "bootstrapId": contractString({ "maxLength": 96 }),
        })
        .nullable(),
    "locale": contractString({ "maxLength": 64 }).optional(),
});
export const initializationPlanOutputSchema = z.strictObject({
    "planDigest": contractString({ "maxLength": 71 }),
    "reviewJson": contractString({ "maxLength": 1048576 }),
});
export const initializationPlanErrors = {
    NOT_FOUND: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    REVISION_CONFLICT: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    UPGRADE_IN_PROGRESS: { retryable: true, output: gatewayAuditAppendInvalidinputErrorSchema },
    INVALID_INPUT: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: gatewayAuditAppendInvalidinputErrorSchema },
    FORBIDDEN: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    RELEASE_MISMATCH: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
};
