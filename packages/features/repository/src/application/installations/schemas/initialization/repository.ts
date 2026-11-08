import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const repositorySettingsInputSchema = z.strictObject({});
export const repositorySettingsOutputSchema = z.strictObject({
    revision: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
    url: contractString({ minLength: 1, maxLength: 2048 }),
    configured: z.boolean(),
    repositoryEnabled: z.boolean(),
    creationStatus: contractString({ enum: ["none", "queued", "running", "succeeded", "failed"], maxLength: 9 }),
    errorMessage: contractString({ maxLength: 2048 }),
});
export const configureRepositoryInputSchema = z.strictObject({
    expectedRevision: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
    url: contractString({ minLength: 1, maxLength: 2048 }),
});
export const createRepositoryInputSchema = z.strictObject({
    expectedRevision: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
});
