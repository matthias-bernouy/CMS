import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { siteBlocSchema, siteBlocRevisionInputSchema } from "./base";
import { SITE_BLOC_DOCUMENT_LIMIT } from "content/blocs/core/validation/snapshot/budget";

const source = contractString({ minLength: 1, maxLength: SITE_BLOC_DOCUMENT_LIMIT }).describe(
    "JSON SiteBlocSnapshot preserving structure, slots and defaults. Maximum 4 MiB UTF-8. New writes support 16,384 nodes and 64 levels; existing snapshots remain readable within the byte limit.",
);
export const siteBlocIdentitySchema = z
    .strictObject({
        ...siteBlocSchema.unwrap().shape,
        groupId: contractString({ maxLength: 200 }).nullable(),
        definitionId: contractString({ minLength: 1, maxLength: 200 }),
    })
    .readonly();
export const siteBlocDocumentSchema = z
    .strictObject({
        ...siteBlocIdentitySchema.unwrap().shape,
        draftJson: source,
        publishedJson: source.nullable(),
    })
    .readonly();
export const siteBlocUpdateInputSchema = z.strictObject({
    ...siteBlocRevisionInputSchema.shape,
    definitionId: contractString({ minLength: 1, maxLength: 200 }),
    draftJson: source,
});
export const siteBlocDeleteInputSchema = z.strictObject({
    ...siteBlocRevisionInputSchema.shape,
    definitionId: contractString({ minLength: 1, maxLength: 200 }).describe(
        "Identity returned by site-blocs.read; prevents deleting a replacement created under the same tag.",
    ),
});
export const siteBlocConsumerSchema = z
    .strictObject({
        kind: contractString({ enum: ["page", "bloc"], maxLength: 4 }),
        id: contractString({ minLength: 1, maxLength: 200 }),
    })
    .readonly();
export const siteBlocReferencedSchema = z
    .strictObject({
        message: contractString({ minLength: 1, maxLength: 2048 }),
        references: z.array(siteBlocConsumerSchema).max(16).readonly(),
        truncated: z.boolean(),
    })
    .readonly();
export const siteBlocDeleteOutputSchema = z
    .strictObject({
        tag: contractString({ minLength: 1, maxLength: 200 }),
        deleted: z.boolean(),
    })
    .readonly();
