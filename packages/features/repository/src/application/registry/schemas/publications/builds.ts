import { publicationCommitRejectedErrorSchema } from "../errors/models";
import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { publicationAbortInputSchema, publicationCommitOutputSchema } from "./uploads";

export const publicationBuildStatusInputSchema = publicationAbortInputSchema.extend({
    operationId: contractString({ minLength: 1, maxLength: 36, format: "uuid" }),
});
export const publicationBuildStatusOutputSchema = z.strictObject({
    operationId: contractString({ minLength: 1, maxLength: 36, format: "uuid" }),
    status: contractString({ enum: ["queued", "running", "succeeded", "failed"], maxLength: 16 }),
    result: publicationCommitOutputSchema.optional(),
    errorOutput: publicationCommitRejectedErrorSchema.optional(),
    errorCode: contractString({ minLength: 1, maxLength: 96 }).optional(),
});
