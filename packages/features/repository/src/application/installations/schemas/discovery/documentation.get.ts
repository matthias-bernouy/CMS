import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const documentationGetInputSchema = z.strictObject({
    reference: z.strictObject({
        contractId: contractString({ maxLength: 193 }),
        releaseDigest: contractString({ maxLength: 71 }),
        path: contractString({ maxLength: 256 }),
    }),
    offset: z.int().min(0).max(131072).optional(),
});

export const documentationGetOutputSchema = z.strictObject({
    reference: z.strictObject({
        contractId: contractString({ maxLength: 193 }),
        releaseDigest: contractString({ maxLength: 71 }),
        path: contractString({ maxLength: 256 }),
    }),
    version: contractString({ maxLength: 64 }),
    title: contractString({ maxLength: 200 }),
    content: contractString({ maxLength: 16384 }),
    offset: z.int().min(0).max(131072),
    nextOffset: z.int().min(0).max(131072).nullable(),
});
