import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { gatewayAuditAppendInvalidinputErrorSchema } from "repository/application/installations/schemas/common/errors";
export const initializationListInputSchema = z.strictObject({
    "cursor": contractString({ "maxLength": 256 }).optional(),
    "locale": contractString({ "maxLength": 64 }).optional(),
});
export const initializationListOutputSchema = z.strictObject({
    "items": z
        .array(
            z.strictObject({
                "root": z.strictObject({
                    "publisherId": contractString({ "maxLength": 96 }),
                    "collectionId": contractString({ "maxLength": 193 }),
                    "version": contractString({ "maxLength": 64 }),
                    "digest": contractString({ "maxLength": 71 }),
                    "bootstrapId": contractString({ "maxLength": 96 }),
                }),
                "label": contractString({ "maxLength": 16384 }),
                "description": contractString({ "maxLength": 16384 }),
                "pageCount": z.int().min(0).max(9007199254740991),
                "includeCount": z.int().min(0).max(9007199254740991),
            }),
        )
        .max(64),
    "cursor": contractString({ "maxLength": 256 }),
});
export const initializationListErrors = {
    NOT_FOUND: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    REVISION_CONFLICT: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    UPGRADE_IN_PROGRESS: { retryable: true, output: gatewayAuditAppendInvalidinputErrorSchema },
    INVALID_INPUT: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: gatewayAuditAppendInvalidinputErrorSchema },
    FORBIDDEN: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    RELEASE_MISMATCH: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
};
