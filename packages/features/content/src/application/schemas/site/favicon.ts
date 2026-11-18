import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const faviconSettingsSchema = z
    .strictObject({
        revision: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
        favicon: contractString({ maxLength: 4096 }),
    })
    .readonly();
export const faviconUpdateInputSchema = z.strictObject({
    expectedRevision: z
        .int()
        .min(0)
        .max(Number.MAX_SAFE_INTEGER - 1),
    favicon: contractString({ maxLength: 4096 })
        .nullable()
        .describe(
            "Permanent public Files URL or root-relative path. HTTP(S) URLs are accepted without credentials. Null or an empty string restores the default favicon. This operation does not publish files or probe remote URLs.",
        ),
});
