import { publicationRefusalSchema } from "./errors/models";
import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { publishInputSchema, publishCollectionOutputSchema } from "./publication";
export const publicationOperationInputSchema = publishInputSchema.extend({
    operationId: contractString({ minLength: 1, maxLength: 36, format: "uuid" }),
});
export const publicationOperationOutputSchema = z.strictObject({
    operationId: contractString({ minLength: 1, maxLength: 36, format: "uuid" }),
    status: contractString({ enum: ["queued", "running", "succeeded", "failed"], maxLength: 16 }),
    result: publishCollectionOutputSchema.optional(),
    errorOutput: publicationRefusalSchema.optional(),
    errorCode: contractString({ minLength: 1, maxLength: 96 }).optional(),
});
