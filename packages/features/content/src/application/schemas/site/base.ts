import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const siteBlocSchema = z
    .strictObject({
        tag: contractString({ maxLength: 200 }),
        name: contractString({ maxLength: 120 }),
        group: contractString({ maxLength: 120 }),
        description: contractString({ maxLength: 500 }),
        lifecycle: contractString({ enum: ["active", "archived"], maxLength: 8 }),
        draftRevision: z.int().min(1).max(9007199254740991),
        publishedRevision: z.int().min(1).max(9007199254740991).nullable(),
        createdAt: contractString({ format: "date-time", maxLength: 40 }),
        updatedAt: contractString({ format: "date-time", maxLength: 40 }),
    })
    .readonly();

export const siteUpdateInputSchema = z.strictObject({
    expectedRevision: z
        .int()
        .min(0)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
    name: contractString({ minLength: 1, maxLength: 160 }).optional(),
    host: contractString({ maxLength: 2048 }).optional(),
    visible: z.boolean().optional(),
    notFound: z
        .strictObject({
            pageId: contractString({ minLength: 1, maxLength: 200 }),
        })
        .readonly()
        .nullable()
        .describe("Page rendered for missing content (404). Omit to preserve the current selection; null clears it.")
        .optional(),
    forbidden: z
        .strictObject({
            pageId: contractString({ minLength: 1, maxLength: 200 }),
        })
        .readonly()
        .nullable()
        .describe(
            "Page rendered when an authenticated visitor is denied access (403). Omit to preserve the current selection; null clears it.",
        )
        .optional(),
    serverError: z
        .strictObject({
            pageId: contractString({ minLength: 1, maxLength: 200 }),
        })
        .readonly()
        .nullable()
        .describe(
            "Page rendered for server errors (500 or 503). Omit to preserve the current selection; null clears it.",
        )
        .optional(),
    login: z
        .strictObject({
            pageId: contractString({ minLength: 1, maxLength: 200 }),
        })
        .readonly()
        .nullable()
        .describe(
            "Public login Page used for anonymous visitors who need to authenticate. Omit to preserve the current selection; null clears it.",
        )
        .optional(),
});

export const siteSettingsSchema = z
    .strictObject({
        revision: z.int().min(0).max(9007199254740991),
        name: contractString({ maxLength: 160 }),
        host: contractString({ maxLength: 2048 }),
        visible: z.boolean(),
        notFound: z
            .strictObject({
                pageId: contractString({ minLength: 1, maxLength: 200 }),
            })
            .readonly()
            .nullable()
            .describe("Page rendered for missing content (404). Null means no Page is selected."),
        forbidden: z
            .strictObject({
                pageId: contractString({ minLength: 1, maxLength: 200 }),
            })
            .readonly()
            .nullable()
            .describe(
                "Page rendered when an authenticated visitor is denied access (403). Null means no Page is selected.",
            ),
        serverError: z
            .strictObject({
                pageId: contractString({ minLength: 1, maxLength: 200 }),
            })
            .readonly()
            .nullable()
            .describe("Page rendered for server errors (500 or 503). Null means no Page is selected."),
        login: z
            .strictObject({
                pageId: contractString({ minLength: 1, maxLength: 200 }),
            })
            .readonly()
            .nullable()
            .describe(
                "Public login Page used for anonymous visitors who need to authenticate. Null means no Page is selected.",
            ),
    })
    .readonly();

export const siteBlocRevisionInputSchema = z.strictObject({
    tag: contractString({ minLength: 1, maxLength: 200 }),
    revision: z
        .int()
        .min(1)
        .max(9007199254740991)
        .describe("Current revision returned by the corresponding read operation. Read again after a conflict."),
});

export const siteBlocsCreateInputSchema = z.strictObject({
    tag: contractString({ minLength: 6, maxLength: 200 }),
    name: contractString({ minLength: 1, maxLength: 120 }),
    group: contractString({ minLength: 1, maxLength: 120 }),
    content: contractString({ minLength: 1, maxLength: 1048576 }),
    description: contractString({ maxLength: 500 }).optional(),
    groupId: contractString({ maxLength: 200 }).optional(),
});

export const siteBlocsGetInputSchema = z.strictObject({
    tag: contractString({ minLength: 1, maxLength: 200 }),
});

export const siteBlocsListOutputSchema = z
    .strictObject({
        items: z.array(siteBlocSchema).max(1000).readonly(),
    })
    .readonly();
