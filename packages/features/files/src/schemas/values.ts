import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";

export const fileRepresentationSchema = z
    .strictObject({
        profile: contractString({ maxLength: 10, enum: ["thumbnail", "responsive"] }),
        width: z.int().min(1).max(16384),
        height: z.int().min(1).max(16384),
        mimeType: contractString({ maxLength: 64 }),
        url: contractString({ maxLength: 4096 }),
        path: contractString({ maxLength: 4096 }),
    })
    .readonly();

export const fileReferenceSchema = z
    .strictObject({
        namespaceId: contractString({ maxLength: 128 }),
        fileId: contractString({ maxLength: 128 }),
        generation: contractString({ maxLength: 128 }),
        name: contractString({ maxLength: 255 }),
        mimeType: contractString({ maxLength: 255 }),
        size: z.int().min(0).max(10737418240),
        visibility: contractString({ maxLength: 7, enum: ["private", "public"] }),
        url: contractString({ maxLength: 4096 }),
        path: contractString({ maxLength: 4096 }),
        width: z.int().min(1).max(16384).nullable().optional(),
        height: z.int().min(1).max(16384).nullable().optional(),
        variants: z.array(fileRepresentationSchema).max(10).readonly().optional(),
    })
    .readonly();

export const namespaceMetadataSchema = z
    .strictObject({
        id: contractString({ maxLength: 128 }),
        name: contractString({ maxLength: 160 }),
        defaultVisibility: contractString({ maxLength: 7, enum: ["private", "public"] }),
        createdAt: contractString({ maxLength: 64 }),
        quota: z
            .strictObject({
                maxBytes: z.int().min(1),
                maxFiles: z.int().min(1),
            })
            .readonly(),
    })
    .readonly();

export const namespaceRecordSchema = z
    .strictObject({
        id: contractString({ maxLength: 128 }),
        name: contractString({ maxLength: 160 }),
        defaultVisibility: contractString({ maxLength: 7, enum: ["private", "public"] }),
        createdAt: contractString({ maxLength: 64 }),
        createdBy: z
            .strictObject({
                kind: contractString({ maxLength: 13, enum: ["administrator", "provider", "system"] }),
                id: contractString({ maxLength: 256 }),
            })
            .readonly(),
        quota: z
            .strictObject({
                maxBytes: z.int().min(1).max(9007199254740991),
                maxFiles: z.int().min(1).max(9007199254740991),
            })
            .readonly(),
    })
    .readonly();

export const uploadReceiptSchema = z
    .strictObject({
        uploadId: contractString({ maxLength: 128 }),
        uploadToken: contractString({ maxLength: 512, minLength: 20, sensitive: true }),
        expiresAt: contractString({ maxLength: 64 }),
        maxBytes: z.int().min(1),
    })
    .readonly();

export const namespacePermissionSchema = contractString({
    maxLength: 32,
    enum: ["files.read", "files.write", "files.delete", "files.sign", "files.publish", "namespace.manage"],
});
