import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const messageErrorSchema = z
    .strictObject({
        message: contractString({ minLength: 1, maxLength: 2048 }),
    })
    .readonly();

export const publicationRefusalSchema = z
    .strictObject({
        message: contractString({ minLength: 1, maxLength: 2048 }),
        publicationCode: contractString({
            maxLength: 32,
            enum: [
                "immutable_conflict",
                "identity_changed",
                "version_order",
                "stable_resource",
                "major_required",
                "minor_required",
            ],
        }).optional(),
        publicationResource: z
            .strictObject({
                kind: contractString({
                    maxLength: 16,
                    enum: ["bloc", "theme-token", "configuration", "text", "asset", "state"],
                }),
                id: contractString({ maxLength: 512 }),
            })
            .readonly()
            .optional(),
        publicationState: contractString({ maxLength: 15, enum: ["sources-pending", "unknown"] }).optional(),
        preparationId: contractString({ maxLength: 36 }).optional(),
        digest: contractString({ maxLength: 71 }).optional(),
    })
    .readonly();

export const publicationRecoverySchema = z
    .strictObject({
        message: contractString({ minLength: 1, maxLength: 2048 }),
        publicationState: contractString({ maxLength: 15, enum: ["sources-pending", "unknown"] }).optional(),
        preparationId: contractString({ maxLength: 36 }).optional(),
        digest: contractString({ maxLength: 71 }).optional(),
    })
    .readonly();
