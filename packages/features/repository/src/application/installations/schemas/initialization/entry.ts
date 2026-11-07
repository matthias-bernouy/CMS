import { z } from "zod";
import { gatewayAuditAppendInvalidinputErrorSchema } from "repository/application/installations/schemas/common/errors";
export const initializationEntryInputSchema = z.strictObject({});
export const initializationEntryOutputSchema = z.strictObject({
    "pending": z.boolean(),
});
export const initializationEntryErrors = {
    NOT_FOUND: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    REVISION_CONFLICT: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    UPGRADE_IN_PROGRESS: { retryable: true, output: gatewayAuditAppendInvalidinputErrorSchema },
    INVALID_INPUT: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: gatewayAuditAppendInvalidinputErrorSchema },
    FORBIDDEN: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    RELEASE_MISMATCH: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
};
