import type { ContractFixtureAssetDefinition } from "../../interfaces/ContractRelease";
import { isReleaseDigest } from "../admission/digest";
import { ReleaseValidationError } from "../protocol/errors";
import type { ReleaseLimits } from "../protocol/limits";
import { expectArray, expectRecord, expectSafeInteger, expectString, rejectUnknownKeys } from "../protocol/values";
import { MEDIA_TYPE_PATTERN } from "../schema/context";
import { parseIdentifier } from "./identifiers";

export function parseFixtureAssets(
    value: unknown,
    limits: Readonly<ReleaseLimits>,
): readonly ContractFixtureAssetDefinition[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const source = expectArray(value, "$.fixtureAssets", "invalid_contract");
    if (source.length > limits.maxFixtureAssets) {
        throw new ReleaseValidationError("invalid_contract", "too many fixture assets", "$.fixtureAssets");
    }
    let totalBytes = 0;
    const assets = source.map((item, index) => {
        const path = `$.fixtureAssets[${index}]`;
        const record = expectRecord(item, path, "invalid_contract");
        rejectUnknownKeys(record, ["id", "mediaType", "byteLength", "digest"], path, "invalid_contract");
        const byteLength = expectSafeInteger(record.byteLength, `${path}.byteLength`, "invalid_contract");
        if (byteLength < 0 || byteLength > limits.maxBinaryBytes) {
            throw new ReleaseValidationError("invalid_contract", "fixture asset exceeds binary byte limit", path);
        }
        totalBytes += byteLength;
        if (totalBytes > limits.maxBinaryBytes) {
            throw new ReleaseValidationError("invalid_contract", "total fixture assets exceed binary byte limit", path);
        }
        const mediaType = expectString(record.mediaType, `${path}.mediaType`, "invalid_contract", 255);
        if (!MEDIA_TYPE_PATTERN.test(mediaType)) {
            throw new ReleaseValidationError("invalid_contract", "invalid lowercase media type", `${path}.mediaType`);
        }
        const digest = expectString(record.digest, `${path}.digest`, "invalid_contract", 71);
        if (!isReleaseDigest(digest)) {
            throw new ReleaseValidationError("invalid_contract", "invalid SHA-256 digest", `${path}.digest`);
        }
        return { id: parseIdentifier(record.id, `${path}.id`), mediaType, byteLength, digest };
    });
    if (new Set(assets.map((asset) => asset.id)).size !== assets.length) {
        throw new ReleaseValidationError("invalid_contract", "duplicate fixture asset IDs", "$.fixtureAssets");
    }
    return assets.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
