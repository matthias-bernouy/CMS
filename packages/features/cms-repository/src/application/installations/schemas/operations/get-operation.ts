import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { gatewayAuditAppendInvalidinputErrorSchema } from "cms-repository/application/installations/schemas/common/errors";
export const getOperationInputSchema = z.strictObject({
    operationId: contractString({ format: "uuid", maxLength: 36 }),
});

export const getOperationOutputSchema = z.strictObject({
    operationId: contractString({ format: "uuid", maxLength: 36 }),
    capabilityId: contractString({
        enum: [
            "apply-collection-upgrade",
            "resume-collection-upgrade",
            "apply-contract-upgrade",
            "resume-contract-upgrade",
        ],
        maxLength: 32,
    }),
    status: contractString({ enum: ["queued", "running", "succeeded", "failed"], maxLength: 9 }),
    revision: z.int().min(1).max(9007199254740991),
    createdAt: contractString({ format: "date-time", maxLength: 40 }),
    updatedAt: contractString({ format: "date-time", maxLength: 40 }),
    errorCode: contractString({ maxLength: 64 }).optional(),
    result: z
        .strictObject({
            upgradeId: contractString({ maxLength: 71 }),
            status: contractString({ maxLength: 16, enum: ["prepared", "applying", "completed", "cancelled"] }),
            collectionRevision: z.int().min(0).max(9007199254740991).optional(),
            selectionRevision: z.int().min(0).max(9007199254740991).optional(),
        })
        .optional(),
    errorOutput: gatewayAuditAppendInvalidinputErrorSchema.optional(),
});
