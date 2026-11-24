import { contractString, z } from "@bernouy/ulvia-sdk";
import { revisionSchema, uuidSchema } from "forms/application/schemas/authoring";

export const submissionStatusSchema = contractString({
    enum: ["new", "read", "processed", "spam"] as const,
    maxLength: 9,
});
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

const timestamp = contractString({ minLength: 24, maxLength: 24 });
const cursor = contractString({ minLength: 1, maxLength: 2048 });
export const submissionListInputSchema = z.strictObject({
    formId: uuidSchema,
    from: timestamp.optional(),
    to: timestamp.optional(),
    status: submissionStatusSchema.optional(),
    limit: z.int().min(1).max(100),
    after: cursor.optional(),
});
const submissionSummarySchema = z.strictObject({
    id: uuidSchema,
    formVersion: revisionSchema,
    receivedAt: timestamp,
    status: submissionStatusSchema,
});
export const submissionListOutputSchema = z.strictObject({
    submissions: z.array(submissionSummarySchema).max(100),
    next: cursor.optional(),
});
export const submissionStatusInputSchema = z.strictObject({
    receiptId: uuidSchema,
    expectedRevision: revisionSchema,
    status: submissionStatusSchema,
});
export const submissionDeleteInputSchema = z.strictObject({ receiptId: uuidSchema });
export const submissionChangeAckSchema = z.strictObject({ receiptId: uuidSchema, revision: revisionSchema });
export const submissionDeleteAckSchema = z.strictObject({
    receiptId: uuidSchema,
    deleted: z.boolean(),
});
export type SubmissionStatusInput = z.infer<typeof submissionStatusInputSchema>;
export type SubmissionListInputDto = z.infer<typeof submissionListInputSchema>;
