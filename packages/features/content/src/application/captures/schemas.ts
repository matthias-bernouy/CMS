import { z } from "zod";
import { contractBinary, contractString } from "@bernouy/ulvia-sdk";
export const captureOptionsSchema = z.strictObject({
    width: z.int().min(1).max(4096),
    height: z.int().min(1).max(4096),
    mode: contractString({ enum: ["viewport", "full-page", "element"], maxLength: 9 }),
    selector: contractString({ minLength: 1, maxLength: 512 }).optional(),
    themeMode: contractString({ enum: ["light", "dark"], maxLength: 5 }),
});
export const captureLocaleSchema = contractString({ minLength: 1, maxLength: 64 });
export const captureImageInputSchema = z.strictObject({ captureId: contractString({ format: "uuid", maxLength: 36 }) });
export const captureImageOutputSchema = contractBinary({ maxBytes: 4194304 });
const captureSourceSchema = z.strictObject({
    kind: contractString({ enum: ["page", "installed-example", "prepared-example"], maxLength: 17 }),
    id: contractString({ maxLength: 512 }),
    revision: contractString({ maxLength: 256 }),
    releaseDigest: contractString({ maxLength: 71 }).optional(),
    dependencies: z
        .array(z.strictObject({ id: contractString({ maxLength: 193 }), digest: contractString({ maxLength: 71 }) }))
        .max(128),
});
export const captureMetadataSchema = z.strictObject({
    captureId: contractString({ format: "uuid", maxLength: 36 }),
    expiresAt: z.int().min(0).max(9007199254740991),
    width: z.int().min(1).max(4096),
    height: z.int().min(1).max(16384),
    byteLength: z.int().min(1).max(4194304),
    digest: contractString({ maxLength: 71 }),
    documentDigest: contractString({ maxLength: 71 }),
    browserVersion: contractString({ maxLength: 128 }),
    locale: captureLocaleSchema,
    options: captureOptionsSchema,
    source: captureSourceSchema,
    diagnostics: z.array(contractString({ maxLength: 512 })).max(32),
});
export type CaptureSource = z.output<typeof captureSourceSchema>;
export type CaptureMetadata = z.output<typeof captureMetadataSchema>;
export const pageCaptureInputSchema = z.strictObject({
    id: contractString({ minLength: 1, maxLength: 200 }),
    expectedRevision: z.int().min(1).max(9007199254740991),
    locale: captureLocaleSchema,
    options: captureOptionsSchema,
});
export const exampleCaptureInputSchema = z.strictObject({
    collectionId: contractString({ minLength: 1, maxLength: 193 }),
    exampleId: contractString({ minLength: 1, maxLength: 96 }),
    previewId: contractString({ minLength: 1, maxLength: 96 }),
    locale: captureLocaleSchema,
    themeMode: contractString({ enum: ["light", "dark"], maxLength: 5 }),
});
export type PageCaptureInput = z.output<typeof pageCaptureInputSchema>;
export type ExampleCaptureInput = z.output<typeof exampleCaptureInputSchema>;
export const captureErrors = {
    INVALID_INPUT: { retryable: false, output: z.strictObject({ message: contractString({ maxLength: 2048 }) }) },
    NOT_FOUND: { retryable: false, output: z.strictObject({ message: contractString({ maxLength: 2048 }) }) },
    REVISION_CONFLICT: { retryable: true, output: z.strictObject({ message: contractString({ maxLength: 2048 }) }) },
    CORE_UNAVAILABLE: { retryable: true, output: z.strictObject({ message: contractString({ maxLength: 2048 }) }) },
};
