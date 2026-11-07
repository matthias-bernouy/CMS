import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { fileReferenceSchema, namespaceRecordSchema } from "./values";

export const completeWorkspaceUploadInputSchema = z.strictObject({
    uploadId: contractString({ maxLength: 128 }),
});

export const createWorkspaceUploadInputSchema = z.strictObject({
    filename: contractString({ minLength: 1, maxLength: 255 }),
    size: z.int().min(0).max(10737418240),
    contentType: contractString({ maxLength: 255 }).nullable().optional(),
    visibility: contractString({ maxLength: 7, enum: ["private", "public"] }).optional(),
    imageProfile: contractString({ maxLength: 10, enum: ["thumbnail", "responsive"] })
        .nullable()
        .optional(),
    fileId: contractString({ maxLength: 128 }).nullable().optional(),
});

export const createWorkspaceUploadOutputSchema = z
    .strictObject({
        uploadId: contractString({ maxLength: 128 }),
        uploadToken: contractString({ minLength: 20, maxLength: 512, sensitive: true }),
        expiresAt: contractString({ maxLength: 64 }),
        maxBytes: z.int().min(1),
        uploadUrl: contractString({
            format: "uri",
            maxLength: 4096,
            description: "Send raw bytes with PUT to this URL using the MCP bearer and the returned Upload-Token.",
        }).optional(),
    })
    .readonly();

export const deleteWorkspaceFileInputSchema = z.strictObject({
    fileId: contractString({ maxLength: 128 }),
});

export const setWorkspaceFileVisibilityInputSchema = z.strictObject({
    fileId: contractString({ maxLength: 128 }),
    visibility: contractString({ maxLength: 7, enum: ["private", "public"] }),
});

export const signWorkspaceFileInputSchema = z.strictObject({
    fileId: contractString({ maxLength: 128 }),
    generation: contractString({ maxLength: 128 }),
    expiresIn: z.int().min(1).max(3600),
});

export const updateWorkspaceFileInputSchema = z.strictObject({
    fileId: contractString({ maxLength: 128 }),
    name: contractString({ minLength: 1, maxLength: 255 }),
});

export const getWorkspaceInputSchema = z.strictObject({
    offset: z.int().min(0).optional(),
    limit: z.int().min(1).max(100).optional(),
});

export const getWorkspaceOutputSchema = z
    .strictObject({
        namespace: namespaceRecordSchema,
        items: z.array(fileReferenceSchema).max(100).readonly(),
        offset: z.int().min(0),
        limit: z.int().min(1).max(100),
    })
    .readonly();
