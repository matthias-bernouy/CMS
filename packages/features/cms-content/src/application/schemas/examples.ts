import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const examplesGetInputSchema = z.strictObject({
    collectionId: contractString({ minLength: 1, maxLength: 193 }),
    exampleId: contractString({ minLength: 1, maxLength: 96 }),
});

export const examplesGetOutputSchema = z
    .strictObject({
        collectionId: contractString({ maxLength: 193 }),
        id: contractString({ maxLength: 96 }),
        document: z
            .strictObject({
                html: contractString({ maxLength: 1048576 }),
            })
            .readonly(),
    })
    .readonly();

export const examplesListInputSchema = z.strictObject({
    collectionId: contractString({ maxLength: 193 }),
    locale: contractString({ maxLength: 64 }),
    offset: z.int().min(0).max(9007199254740991).optional(),
    limit: z.int().min(1).max(100).optional(),
    cursor: contractString({ maxLength: 16 }).optional(),
});

export const examplesListOutputSchema = z
    .strictObject({
        revision: z.int().min(0).max(9007199254740991),
        collectionId: contractString({ maxLength: 193 }),
        items: z
            .array(
                z
                    .strictObject({
                        id: contractString({ maxLength: 96 }),
                        label: contractString({ maxLength: 4096 }),
                        description: contractString({ maxLength: 4096 }),
                        previews: z
                            .array(
                                z
                                    .strictObject({
                                        id: contractString({ maxLength: 96 }),
                                        frame: z
                                            .strictObject({
                                                width: z.int().min(1).max(4096),
                                                height: z.int().min(1).max(4096),
                                            })
                                            .readonly(),
                                    })
                                    .readonly(),
                            )
                            .max(16)
                            .readonly(),
                    })
                    .readonly(),
            )
            .max(100)
            .readonly(),
        total: z.int().min(0).max(9007199254740991),
        offset: z.int().min(0).max(9007199254740991),
        limit: z.int().min(1).max(100),
        locale: contractString({ maxLength: 64 }),
        nextCursor: contractString({ maxLength: 16 }),
    })
    .readonly();
