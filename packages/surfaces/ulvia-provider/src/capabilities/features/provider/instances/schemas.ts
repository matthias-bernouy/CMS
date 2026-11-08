import { z, contractString } from "@bernouy/ulvia-sdk";

export const cmsInstanceSchema = z.strictObject({
    id: contractString({ maxLength: 96 }),
    label: contractString({ maxLength: 160 }),
    lifecycleState: contractString({ enum: ["running", "maintenance", "stopped"], maxLength: 16 }),
    availability: contractString({ enum: ["ready", "unavailable"], maxLength: 16 }),
    coreVersion: contractString({ maxLength: 64 }),
    observedAt: contractString({ format: "date-time", maxLength: 40 }).optional(),
    contracts: z
        .array(
            z.strictObject({
                contractId: contractString({ maxLength: 193 }),
                version: contractString({ maxLength: 64 }),
                digest: contractString({ maxLength: 71 }),
            }),
        )
        .max(256),
});
export const listCmsInstancesInputSchema = z.strictObject({
    cursor: contractString({ maxLength: 256 }).optional(),
    limit: z.int().min(1).max(50).optional(),
});
export const cmsInstancePageSchema = z.strictObject({
    items: z.array(cmsInstanceSchema).max(50),
    nextCursor: contractString({ maxLength: 256 }).optional(),
});
export const unavailableInstanceSchema = z.strictObject({
    message: contractString({ minLength: 1, maxLength: 2048 }),
});
