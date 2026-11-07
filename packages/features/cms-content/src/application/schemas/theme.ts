import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const themeActivateInputSchema = z.strictObject({
    expectedRevision: z
        .int()
        .min(0)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
    themeId: contractString({ minLength: 1, maxLength: 96 }),
});

export const themeActivateOutputSchema = z
    .strictObject({
        revision: z.int().min(0).max(9007199254740991),
        activeThemeId: contractString({ maxLength: 96 }),
    })
    .readonly();

export const themeTokenResetInputSchema = z.strictObject({
    expectedRevision: z
        .int()
        .min(0)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
    themeId: contractString({ minLength: 1, maxLength: 96 }),
    mode: contractString({ enum: ["light", "dark"], maxLength: 5 }),
    tokenId: contractString({ minLength: 1, maxLength: 512 }),
});

export const themeTokenValueSchema = z
    .strictObject({
        revision: z.int().min(0).max(9007199254740991),
        activeThemeId: contractString({ maxLength: 96 }),
        themeId: contractString({ maxLength: 96 }),
        mode: contractString({ enum: ["light", "dark"], maxLength: 5 }),
        tokenId: contractString({ maxLength: 512 }),
        value: contractString({ maxLength: 4096 }),
        overridden: z.boolean(),
    })
    .readonly();

export const themeTokenSaveInputSchema = z.strictObject({
    expectedRevision: z
        .int()
        .min(0)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
    themeId: contractString({ minLength: 1, maxLength: 96 }),
    mode: contractString({ enum: ["light", "dark"], maxLength: 5 }),
    tokenId: contractString({ minLength: 1, maxLength: 512 }),
    value: contractString({ minLength: 1, maxLength: 4096 }),
});

export const themeGetInputSchema = z.strictObject({
    collectionId: contractString({ minLength: 1, maxLength: 193 }),
    profileId: contractString({ maxLength: 96 }).optional(),
    mode: contractString({ enum: ["light", "dark"], maxLength: 5 }).optional(),
    tokenId: contractString({ maxLength: 512 }).optional(),
    search: contractString({ maxLength: 300 }).optional(),
});

export const themeGetOutputSchema = z
    .strictObject({
        revision: z.int().min(0).max(9007199254740991),
        collectionId: contractString({ maxLength: 193 }),
        activeThemeId: contractString({ maxLength: 96 }),
        profiles: z
            .array(
                z
                    .strictObject({
                        id: contractString({ maxLength: 96 }),
                        name: contractString({ maxLength: 300 }),
                        active: z.boolean(),
                    })
                    .readonly(),
            )
            .max(128)
            .readonly(),
        profileId: contractString({ maxLength: 96 }),
        profileActive: z.boolean(),
        mode: contractString({ enum: ["light", "dark"], maxLength: 5 }),
        search: contractString({ maxLength: 300 }),
        sourceFound: z.boolean(),
        sourceLabel: contractString({ maxLength: 300 }),
        supportsModes: z.boolean(),
        tokens: z
            .array(
                z
                    .strictObject({
                        id: contractString({ maxLength: 96 }),
                        label: contractString({ maxLength: 300 }),
                        description: contractString({ maxLength: 2000 }),
                        variable: contractString({ maxLength: 96 }),
                        type: contractString({
                            enum: ["color", "font-family", "length", "number", "shadow", "value"],
                            maxLength: 11,
                        }),
                        value: contractString({ maxLength: 4096 }),
                        overridden: z.boolean(),
                        categoryId: contractString({ maxLength: 96 }),
                        categoryLabel: contractString({ maxLength: 300 }),
                    })
                    .readonly(),
            )
            .max(4096)
            .readonly(),
        hasToken: z.boolean(),
        token: z
            .strictObject({
                id: contractString({ maxLength: 96 }),
                label: contractString({ maxLength: 300 }),
                description: contractString({ maxLength: 2000 }),
                variable: contractString({ maxLength: 96 }),
                type: contractString({
                    enum: ["color", "font-family", "length", "number", "shadow", "value"],
                    maxLength: 11,
                }),
                value: contractString({ maxLength: 4096 }),
                overridden: z.boolean(),
                categoryId: contractString({ maxLength: 96 }),
                categoryLabel: contractString({ maxLength: 300 }),
            })
            .readonly(),
    })
    .readonly();
