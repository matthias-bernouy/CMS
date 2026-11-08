import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const inspectActorInputSchema = z.strictObject({
    subjectId: contractString({ minLength: 1, maxLength: 256, sensitive: true }),
});

export const actorSnapshotSchema = z
    .strictObject({
        state: contractString({ enum: ["anonymous", "authenticated"], maxLength: 13 }),
        subjectId: contractString({ maxLength: 200 }).optional(),
        administrator: z.boolean().optional(),
        authorizationRevision: z.int().min(0).max(9007199254740991).optional(),
    })
    .readonly();
