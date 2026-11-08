import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const updateCollectionConfigurationInputSchema = z.strictObject({
    collectionId: contractString({ minLength: 1, maxLength: 193 }),
    expectedRevision: z
        .int()
        .min(0)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
    configurationJson: contractString({ maxLength: 1048576 }),
});
