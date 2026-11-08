import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const listOperationsInputSchema = z.strictObject({
    cursor: contractString({ maxLength: 256 }).optional(),
    limit: z.int().min(1).max(100).optional(),
});

export const listOperationsOutputSchema = z.strictObject({
    items: z
        .array(
            z.strictObject({
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
            }),
        )
        .max(100)
        .readonly(),
    nextCursor: contractString({ maxLength: 256 }).optional(),
});
