import type { ContentCapabilityRequirement } from "@bernouy/content";
import { validateCapabilityRequirements } from "@bernouy/content";
import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { isValidRegisteredPagePath } from "@bernouy/content/page-path";
import { isResourceId } from "@bernouy/ulvia-contracts/protocol";

const namespaceSchema = contractString({ minLength: 3, maxLength: 193 }).refine(isResourceId);
export const localeSchema = contractString({ minLength: 2, maxLength: 64 }).refine((value) => {
    try {
        return Intl.getCanonicalLocales(value)[0] === value;
    } catch {
        return false;
    }
});
const staticText = contractString({ maxLength: 65536 }).refine((value) => !/[{}]/u.test(value));
export const textSourceSchema = z.strictObject({
    namespace: namespaceSchema,
    locale: localeSchema,
    texts: z
        .array(
            z.strictObject({
                id: contractString({ minLength: 1, maxLength: 96 }).refine((value) => /^[a-z][a-z0-9-]*$/u.test(value)),
                category: contractString({ minLength: 1, maxLength: 256 }),
                group: contractString({ minLength: 1, maxLength: 256 }),
                label: contractString({ minLength: 1, maxLength: 512 }),
                description: contractString({ maxLength: 4096 }).optional(),
                values: z.record(localeSchema, staticText),
            }),
        )
        .max(4096),
});
export const assetSchema = z.strictObject({
    namespace: namespaceSchema,
    id: contractString({ minLength: 1, maxLength: 512 }).refine((value) =>
        value.split("/").every((part) => /^[a-z0-9][a-z0-9._-]*$/u.test(part) && part !== "." && part !== ".."),
    ),
    entry: contractString({ minLength: 1, maxLength: 1024 }),
    mediaType: contractString({ minLength: 1, maxLength: 127 }).refine((value) =>
        /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(value),
    ),
    byteLength: z
        .int()
        .min(0)
        .max(16 * 1024 * 1024),
    digest: contractString({ minLength: 71, maxLength: 71 }).refine((value) => /^sha256:[0-9a-f]{64}$/u.test(value)),
    profiles: z.array(z.literal("inline-svg")).max(1).optional(),
});
const pageSchema = z.strictObject({
    path: contractString({ minLength: 1, maxLength: 2048 }).refine(isValidRegisteredPagePath),
    title: contractString({ minLength: 1, maxLength: 512 }),
    description: contractString({ maxLength: 4096 }),
    html: contractString({ maxLength: 1024 * 1024 }),
    visible: z.boolean(),
    indexing: z.boolean(),
    systemRole: z.literal("login").optional(),
    requires: z
        .array(z.unknown())
        .max(128)
        .transform((value): readonly ContentCapabilityRequirement[] => validateCapabilityRequirements(value)!)
        .optional(),
});

/** Content owns the nested artifact formats and their semantic validators. */
export const archiveSchema = z.strictObject({
    format: z.literal("ulvia-resources/v1"),
    blocs: z.array(z.unknown()).max(512),
    theme: z.unknown(),
    texts: z.array(textSourceSchema).max(32),
    assets: z.array(assetSchema).max(512),
    pages: z.array(pageSchema).max(256),
});
export type ResourceTextSource = z.infer<typeof textSourceSchema>;
export type ResourceAsset = z.infer<typeof assetSchema>;
export type ResourcePage = z.infer<typeof pageSchema>;
