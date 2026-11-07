import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const localizationTextSaveInputSchema = z.strictObject({
    collectionId: contractString({ minLength: 1, maxLength: 193 }),
    expectedRevision: z
        .int()
        .min(0)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
    locale: contractString({ minLength: 1, maxLength: 64 }),
    textId: contractString({ minLength: 1, maxLength: 96 }),
    value: contractString({ maxLength: 65536 }),
});

export const localizationTextSaveOutputSchema = z
    .strictObject({
        revision: z.int().min(0).max(9007199254740991),
        collectionId: contractString({ maxLength: 193 }),
        textId: contractString({ maxLength: 96 }),
        locale: contractString({ maxLength: 64 }),
        overridden: z.boolean(),
    })
    .readonly();

export const localizationUpdateInputSchema = z.strictObject({
    expectedRevision: z
        .int()
        .min(0)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
    language: contractString({ minLength: 1, maxLength: 64 }),
    additionalLanguages: z
        .array(contractString({ minLength: 1, maxLength: 64 }))
        .max(32)
        .readonly(),
    activeLanguages: z
        .array(contractString({ minLength: 1, maxLength: 64 }))
        .max(32)
        .readonly(),
});

export const localizationSettingsSchema = z
    .strictObject({
        revision: z.int().min(0).max(9007199254740991),
        language: contractString({ maxLength: 64 }),
        additionalLanguages: z
            .array(contractString({ maxLength: 64 }))
            .max(32)
            .readonly(),
        activeLanguages: z
            .array(contractString({ maxLength: 64 }))
            .max(32)
            .readonly(),
    })
    .readonly();

export const localizationTextsGetInputSchema = z.strictObject({
    collectionId: contractString({ minLength: 1, maxLength: 193 }),
    locale: contractString({ maxLength: 64 }).optional(),
    group: contractString({ maxLength: 300 }).optional(),
    search: contractString({ maxLength: 300 }).optional(),
});

export const localizationTextsGetOutputSchema = z
    .strictObject({
        revision: z.int().min(0).max(9007199254740991),
        collectionId: contractString({ maxLength: 193 }),
        locale: contractString({ maxLength: 64 }),
        locales: z
            .array(contractString({ maxLength: 64 }))
            .max(64)
            .readonly(),
        group: contractString({ maxLength: 300 }),
        groups: z
            .array(
                z
                    .strictObject({
                        id: contractString({ maxLength: 300 }),
                        count: z.int().min(0).max(4096),
                    })
                    .readonly(),
            )
            .max(4096)
            .readonly(),
        search: contractString({ maxLength: 300 }),
        items: z
            .array(
                z
                    .strictObject({
                        id: contractString({ maxLength: 96 }),
                        label: contractString({ maxLength: 300 }),
                        description: contractString({ maxLength: 2000 }),
                        category: contractString({ maxLength: 300 }),
                        group: contractString({ maxLength: 300 }),
                        sourceValue: contractString({ maxLength: 65536 }),
                        overrideValue: contractString({ maxLength: 65536 }),
                    })
                    .readonly(),
            )
            .max(4096)
            .readonly(),
    })
    .readonly();
