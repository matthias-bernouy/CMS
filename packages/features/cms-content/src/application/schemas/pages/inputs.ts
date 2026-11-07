import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const pagesCreateInputSchema = z.strictObject({
    path: contractString({ minLength: 1, maxLength: 2048 }),
    title: contractString({ minLength: 1, maxLength: 70 }),
    content: contractString({ maxLength: 1048576 }).optional(),
});

export const pageRevisionInputSchema = z.strictObject({
    id: contractString({ minLength: 1, maxLength: 200 }),
    expectedRevision: z
        .int()
        .min(1)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
});

export const pagesPublishInputSchema = z.strictObject({
    id: contractString({ minLength: 1, maxLength: 200 }),
    visible: z.boolean(),
    expectedRevision: z
        .int()
        .min(1)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
});

export const pagesRenameInputSchema = z.strictObject({
    id: contractString({ minLength: 1, maxLength: 200 }),
    title: contractString({ minLength: 1, maxLength: 70 }),
    expectedRevision: z
        .int()
        .min(1)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
});

export const pagesUpdateRouteInputSchema = z.strictObject({
    id: contractString({ minLength: 1, maxLength: 200 }),
    expectedRevision: z
        .int()
        .min(1)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
    language: contractString({ minLength: 1, maxLength: 35 }),
    path: contractString({ maxLength: 2048 }),
});

export const pagesUpdateSeoInputSchema = z.strictObject({
    id: contractString({ minLength: 1, maxLength: 200 }),
    expectedRevision: z
        .int()
        .min(1)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
    language: contractString({ minLength: 1, maxLength: 35 }),
    title: contractString({ maxLength: 70 }).optional(),
    description: contractString({ maxLength: 200 }).optional(),
});

export const pagesUpdateInputSchema = z.strictObject({
    id: contractString({ minLength: 1, maxLength: 200 }),
    expectedRevision: z
        .int()
        .min(1)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
    title: contractString({ minLength: 1, maxLength: 70 }).optional(),
    description: contractString({ maxLength: 200 }).optional(),
    content: contractString({ maxLength: 1048576 }).optional(),
    tags: z
        .array(contractString({ maxLength: 64 }))
        .max(64)
        .readonly()
        .optional(),
});

export const pageIdInputSchema = z.strictObject({
    id: contractString({ minLength: 1, maxLength: 200 }),
});

export const pagesListInputSchema = z.strictObject({
    cursor: contractString({ maxLength: 256 }).optional(),
    limit: z.int().min(1).max(100).optional(),
    query: contractString({ maxLength: 120 }).optional(),
    visibility: contractString({ maxLength: 9, enum: ["all", "published", "draft"] }).optional(),
});
