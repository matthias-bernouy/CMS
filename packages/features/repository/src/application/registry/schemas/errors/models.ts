import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const namespaceClaimRejectedErrorSchema = z
    .strictObject({
        message: contractString({ minLength: 1, maxLength: 2048 }),
    })
    .readonly();

export const publicationCommitRejectedErrorSchema = z
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
    })
    .readonly();
