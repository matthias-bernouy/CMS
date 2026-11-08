import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const connectionStatusSchema = z
    .strictObject({
        configured: z.boolean(),
        repositoryUrl: contractString({ minLength: 1, maxLength: 2048 }),
        repositoryId: contractString({ minLength: 1, maxLength: 128 }).nullable(),
    })
    .readonly();

export const configureConnectionInputSchema = z.strictObject({
    token: contractString({ minLength: 47, maxLength: 47, sensitive: true }),
});
