import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { contentDiagnosticSchema } from "content/application/schemas/common";
export const pageDetailsSchema = z
    .strictObject({
        id: contractString({ maxLength: 200 }),
        revision: z.int().min(1).max(9007199254740991),
        path: contractString({ maxLength: 2048 }),
        title: contractString({ minLength: 1, maxLength: 70 }),
        description: contractString({ maxLength: 200 }),
        content: contractString({ maxLength: 1048576 }),
        tags: z
            .array(contractString({ maxLength: 64 }))
            .max(64)
            .readonly(),
        visible: z.boolean(),
        diagnostics: z.array(contentDiagnosticSchema).max(16).readonly().optional(),
    })
    .readonly();

export const pageEditingDetailsSchema = z
    .strictObject({
        id: contractString({ maxLength: 200 }),
        revision: z.int().min(1).max(9007199254740991),
        path: contractString({ maxLength: 2048 }),
        title: contractString({ minLength: 1, maxLength: 70 }),
        description: contractString({ maxLength: 200 }),
        content: contractString({ maxLength: 1048576 }),
        tags: z
            .array(contractString({ maxLength: 64 }))
            .max(64)
            .readonly(),
        visible: z.boolean(),
        routes: z
            .array(
                z
                    .strictObject({
                        language: contractString({ maxLength: 35 }),
                        path: contractString({ maxLength: 2048 }),
                        primary: z.boolean(),
                    })
                    .readonly(),
            )
            .max(32)
            .readonly(),
        seoEntries: z
            .array(
                z
                    .strictObject({
                        language: contractString({ maxLength: 35 }),
                        title: contractString({ maxLength: 70 }),
                        description: contractString({ maxLength: 200 }),
                    })
                    .readonly(),
            )
            .max(32)
            .readonly(),
    })
    .readonly();

export const pageRouteDetailsSchema = z
    .strictObject({
        id: contractString({ maxLength: 200 }),
        revision: z.int().min(1).max(9007199254740991),
        path: contractString({ maxLength: 2048 }),
        routes: z
            .array(
                z
                    .strictObject({
                        language: contractString({ maxLength: 35 }),
                        path: contractString({ maxLength: 2048 }),
                        primary: z.boolean(),
                    })
                    .readonly(),
            )
            .max(32)
            .readonly(),
    })
    .readonly();

export const pageSeoDetailsSchema = z
    .strictObject({
        id: contractString({ maxLength: 200 }),
        revision: z.int().min(1).max(9007199254740991),
        seoEntries: z
            .array(
                z
                    .strictObject({
                        language: contractString({ maxLength: 35 }),
                        title: contractString({ maxLength: 70 }),
                        description: contractString({ maxLength: 200 }),
                    })
                    .readonly(),
            )
            .max(32)
            .readonly(),
    })
    .readonly();

export const editorCatalogueSchema = z
    .strictObject({
        items: z
            .array(
                z
                    .strictObject({
                        id: contractString({ maxLength: 128 }),
                        name: contractString({ maxLength: 300 }),
                        group: contractString({ maxLength: 300 }),
                        description: contractString({ maxLength: 2000 }),
                        kind: contractString({ enum: ["component", "composition"], maxLength: 11 }),
                        ownership: contractString({ enum: ["code-managed", "site-builder"], maxLength: 12 }),
                        order: z.int().min(0).max(9007199254740991),
                        defaultContent: contractString({ maxLength: 1048576 }),
                        authoringJson: contractString({ maxLength: 1048576 }),
                    })
                    .readonly(),
            )
            .max(1024)
            .readonly(),
    })
    .readonly();

export const pagesDeleteOutputSchema = z
    .strictObject({
        id: contractString({ maxLength: 200 }),
        deleted: z.boolean(),
    })
    .readonly();

export const pagesRenameOutputSchema = z
    .strictObject({
        id: contractString({ maxLength: 200 }),
        revision: z.int().min(1).max(9007199254740991),
        path: contractString({ maxLength: 2048 }),
        title: contractString({ minLength: 1, maxLength: 70 }),
        visible: z.boolean(),
    })
    .readonly();

export const pagesListOutputSchema = z
    .strictObject({
        items: z
            .array(
                z
                    .strictObject({
                        id: contractString({ maxLength: 200 }),
                        path: contractString({ maxLength: 2048 }),
                        title: contractString({ minLength: 1, maxLength: 70 }),
                        visible: z.boolean(),
                    })
                    .readonly(),
            )
            .max(100)
            .readonly(),
        nextCursor: contractString({ maxLength: 256 }).optional(),
    })
    .readonly();
