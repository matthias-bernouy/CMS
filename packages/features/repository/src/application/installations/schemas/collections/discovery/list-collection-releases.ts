import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { gatewayAuditAppendInvalidinputErrorSchema } from "repository/application/installations/schemas/common/errors";
export const listCollectionReleasesInputSchema = z.strictObject({
    "repositoryId": contractString({ "maxLength": 96 }),
    "publisherId": contractString({ "maxLength": 96 }),
    "collectionId": contractString({ "maxLength": 193 }),
    "limit": z.int().min(1).max(25).optional(),
    "cursor": contractString({ "minLength": 1, "maxLength": 4096 }).optional(),
    "channel": contractString({ "enum": ["stable", "beta", "all"], "maxLength": 6 }).optional(),
});
export const listCollectionReleasesOutputSchema = z.strictObject({
    "revision": z.int().min(0).max(9007199254740991),
    "releases": z
        .array(
            z.strictObject({
                "repositoryId": contractString({ "maxLength": 96 }),
                "publisherId": contractString({ "maxLength": 96 }),
                "collectionId": contractString({ "maxLength": 193 }),
                "version": contractString({ "maxLength": 64 }),
                "digest": contractString({ "maxLength": 71 }),
                "name": contractString({ "maxLength": 128 }),
                "description": contractString({ "maxLength": 4096 }),
                "blocCount": z.int().min(0).max(1024),
                "hasTheme": z.boolean(),
                "browserRisk": contractString({ "maxLength": 6, "enum": ["none", "review", "high"] }),
                "browserRiskDigest": contractString({ "maxLength": 71 }),
                "javaScriptBlocCount": z.int().min(0).max(1024),
                "frameBlocCount": z.int().min(0).max(1024),
                "externalFrameOrigins": z
                    .array(contractString({ "maxLength": 2048 }))
                    .max(32)
                    .readonly(),
                "scriptsWithSameOrigin": z.boolean(),
                "action": contractString({ "maxLength": 7, "enum": ["install", "upgrade", "current", "older"] }),
                "channel": contractString({ "enum": ["stable", "beta"], "maxLength": 6 }),
                "javaScriptBlocs": z
                    .array(contractString({ "maxLength": 96 }))
                    .max(1024)
                    .readonly(),
                "frameBlocs": z
                    .array(
                        z.strictObject({
                            "id": contractString({ "maxLength": 96 }),
                            "origins": z
                                .array(contractString({ "maxLength": 2048 }))
                                .max(32)
                                .readonly(),
                            "sandbox": z
                                .array(contractString({ "maxLength": 17 }))
                                .max(6)
                                .readonly(),
                        }),
                    )
                    .max(1024)
                    .readonly(),
                "installedVersion": contractString({ "minLength": 1, "maxLength": 128 }).optional(),
            }),
        )
        .max(25)
        .readonly(),
    "channel": contractString({ "enum": ["stable", "beta", "all"], "maxLength": 6 }),
    "nextCursor": contractString({ "minLength": 0, "maxLength": 4096 }),
    "repositoryId": contractString({ "minLength": 1, "maxLength": 96 }),
    "publisherId": contractString({ "minLength": 1, "maxLength": 96 }),
    "collectionId": contractString({ "minLength": 1, "maxLength": 193 }),
});
export const listCollectionReleasesErrors = {
    INVALID_INPUT: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: gatewayAuditAppendInvalidinputErrorSchema },
    NOT_FOUND: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    RELEASE_MISMATCH: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
};
