import { z } from "zod";
import { contractString, contractBinary } from "@bernouy/ulvia-sdk";

export const completeUploadInputSchema = z.strictObject({
    namespaceId: contractString({ maxLength: 128 }),
    namespaceKey: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
    uploadId: contractString({ maxLength: 128 }),
});

export const createUploadInputSchema = z.strictObject({
    namespaceId: contractString({ maxLength: 128 }),
    namespaceKey: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
    filename: contractString({ maxLength: 255, minLength: 1 }),
    size: z.int().min(0).max(10737418240),
    contentType: contractString({ maxLength: 255 }).nullable().optional(),
    visibility: contractString({ maxLength: 7, enum: ["private", "public"] }).optional(),
    imageProfile: contractString({ maxLength: 10, enum: ["thumbnail", "responsive"] })
        .nullable()
        .optional(),
    fileId: contractString({ maxLength: 128 }).nullable().optional(),
});

export const writeUploadInputSchema = z.strictObject({
    uploadId: contractString({ maxLength: 128 }),
    uploadToken: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
    bytes: contractBinary({ maxBytes: 10737418240 }),
});
