import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { gatewayAuditAppendInvalidinputErrorSchema } from "repository/application/installations/schemas/common/errors";
export const getCollectionReleaseInputSchema = z.strictObject({
    "repositoryId": contractString({ "maxLength": 96 }),
    "publisherId": contractString({ "maxLength": 96 }),
    "collectionId": contractString({ "maxLength": 193 }),
    "version": contractString({ "maxLength": 64 }),
    "digest": contractString({ "maxLength": 71 }),
});
export const getCollectionReleaseOutputSchema = z.strictObject({
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
    "javaScriptBlocs": z
        .array(contractString({ "maxLength": 96 }))
        .max(1024)
        .readonly(),
    "frameBlocCount": z.int().min(0).max(1024),
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
    "externalFrameOrigins": z
        .array(contractString({ "maxLength": 2048 }))
        .max(32)
        .readonly(),
    "scriptsWithSameOrigin": z.boolean(),
    "action": contractString({ "maxLength": 7, "enum": ["install", "upgrade", "current", "older"] }),
    "channel": contractString({ "enum": ["stable", "beta"], "maxLength": 6 }),
});
export const getCollectionReleaseErrors = {
    INVALID_INPUT: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: gatewayAuditAppendInvalidinputErrorSchema },
    NOT_FOUND: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
    RELEASE_MISMATCH: { retryable: false, output: gatewayAuditAppendInvalidinputErrorSchema },
};
