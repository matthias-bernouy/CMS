import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { fileReferenceSchema } from "./values";

export const signRepresentationsInputSchema = z.strictObject({
    namespaceId: contractString({ maxLength: 128 }),
    namespaceKey: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
    fileId: contractString({ maxLength: 128 }),
    generation: contractString({ maxLength: 128 }),
    expiresIn: z.int().min(1).max(86400),
});

export const signRepresentationsOutputSchema = z
    .strictObject({
        expiresAt: contractString({ maxLength: 64 }),
        representations: z
            .array(
                z
                    .strictObject({
                        profile: contractString({ maxLength: 10, enum: ["thumbnail", "responsive"] }),
                        width: z.int().min(1).max(16384),
                        height: z.int().min(1).max(16384),
                        mimeType: contractString({ maxLength: 64 }),
                        url: contractString({ maxLength: 4096 }),
                    })
                    .readonly(),
            )
            .max(10)
            .readonly(),
    })
    .readonly();

export const listRepresentationsInputSchema = z.strictObject({
    fileId: contractString({ maxLength: 128 }),
    generation: contractString({ maxLength: 128 }),
    access: contractString({ maxLength: 2048, sensitive: true }).optional(),
    namespaceKey: contractString({ maxLength: 512, minLength: 20, sensitive: true }).optional(),
});

export const listRepresentationsOutputSchema = z
    .strictObject({
        original: fileReferenceSchema,
        representations: z
            .array(
                z
                    .strictObject({
                        profile: contractString({ maxLength: 10, enum: ["thumbnail", "responsive"] }),
                        width: z.int().min(1).max(16384),
                        height: z.int().min(1).max(16384),
                        mimeType: contractString({ maxLength: 64 }),
                        url: contractString({ maxLength: 4096 }),
                        path: contractString({ maxLength: 4096 }),
                    })
                    .readonly(),
            )
            .max(10)
            .readonly(),
    })
    .readonly();

export const readRepresentationInputSchema = z.strictObject({
    fileId: contractString({ maxLength: 128 }),
    generation: contractString({ maxLength: 128 }),
    profile: contractString({ maxLength: 10, enum: ["thumbnail", "responsive"] }),
    width: z.int().min(1).max(16384),
    access: contractString({ maxLength: 2048, sensitive: true }).optional(),
    range: contractString({ maxLength: 128 }).optional(),
    ifRange: contractString({ maxLength: 160 }).optional(),
});
