import { z } from "zod";
import { contractString, contractBinary } from "@bernouy/ulvia-sdk";
import { fileReferenceSchema, fileRepresentationSchema } from "./values";

export const fileCredentialsSchema = z.strictObject({
    namespaceId: contractString({ maxLength: 128 }),
    namespaceKey: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
    fileId: contractString({ maxLength: 128 }),
});

export const signFileInputSchema = z.strictObject({
    namespaceId: contractString({ maxLength: 128 }),
    namespaceKey: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
    fileId: contractString({ maxLength: 128 }),
    generation: contractString({ maxLength: 128 }),
    operation: contractString({ maxLength: 4, enum: ["read"] }),
    expiresIn: z.int().min(1).max(86400),
});

export const signFileOutputSchema = z
    .strictObject({
        url: contractString({ maxLength: 4096 }),
        expiresAt: contractString({ maxLength: 64 }),
    })
    .readonly();

export const updateFileInputSchema = z.strictObject({
    namespaceId: contractString({ maxLength: 128 }),
    namespaceKey: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
    fileId: contractString({ maxLength: 128 }),
    name: contractString({ maxLength: 255, minLength: 1 }),
});

export const listFilesInputSchema = z.strictObject({
    namespaceId: contractString({ maxLength: 128 }),
    namespaceKey: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
    offset: z.int().min(0).optional(),
    limit: z.int().min(1).max(100).optional(),
});

export const listFilesOutputSchema = z
    .strictObject({
        items: z.array(fileReferenceSchema).max(100).readonly(),
        offset: z.int().min(0),
        limit: z.int().min(1),
    })
    .readonly();

export const readFileInputSchema = z.strictObject({
    fileId: contractString({ maxLength: 128 }),
    generation: contractString({ maxLength: 128 }),
    access: contractString({ maxLength: 2048, sensitive: true }).optional(),
    range: contractString({ maxLength: 128 }).optional(),
    ifRange: contractString({ maxLength: 160 }).optional(),
});

export const readFileOutputSchema = contractBinary({ maxBytes: 10737418240 });

// Business references contain dimensions only when known and currently emit WebP derivatives.
export const fileReferenceValueSchema = fileReferenceSchema
    .unwrap()
    .extend({
        width: z.int().min(1).max(16384).optional(),
        height: z.int().min(1).max(16384).optional(),
        variants: z
            .array(
                fileRepresentationSchema
                    .unwrap()
                    .extend({ mimeType: z.literal("image/webp") })
                    .readonly(),
            )
            .max(10)
            .readonly()
            .optional(),
    })
    .readonly();
