import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { captureLocaleSchema } from "@bernouy/content/captures";
const dependencySchema = z.strictObject({
    publisherId: contractString({ minLength: 1, maxLength: 96 }),
    collectionId: contractString({ minLength: 1, maxLength: 193 }),
    version: contractString({ minLength: 1, maxLength: 128 }),
    digest: contractString({ minLength: 71, maxLength: 71 }),
});
export type CaptureDependencyReference = z.output<typeof dependencySchema>;
export const preparationCaptureSchema = z.strictObject({
    preparationId: contractString({ format: "uuid", maxLength: 36 }),
    expectedDigest: contractString({ minLength: 71, maxLength: 71 }),
    exampleId: contractString({ minLength: 1, maxLength: 96 }),
    previewId: contractString({ minLength: 1, maxLength: 96 }),
    locale: captureLocaleSchema,
    themeMode: contractString({ enum: ["light", "dark"], maxLength: 5 }),
    dependencies: z.array(dependencySchema).max(32),
});
export type PreparationCaptureInput = z.output<typeof preparationCaptureSchema>;
