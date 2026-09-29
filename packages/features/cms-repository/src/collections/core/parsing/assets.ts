import type { CollectionAssetDefinition } from "cms-repository/collections/interfaces/CollectionAssets";
import { invalid } from "cms-repository/collections/core/errors";
import type { CollectionLimits } from "cms-repository/collections/core/limits";
import {
    array,
    identifier,
    integer,
    keys,
    ordinal,
    record,
    string,
    unique,
} from "cms-repository/collections/core/values";

const MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;

export function parseAssets(value: unknown, limits: Readonly<CollectionLimits>): readonly CollectionAssetDefinition[] {
    let totalBytes = 0;
    const assets = array(value, limits.maxAssets, "$.assets").map((item, index): CollectionAssetDefinition => {
        const path = `$.assets[${index}]`;
        const source = record(item, path);
        keys(source, ["id", "mediaType", "byteLength", "digest"], path);
        const id = identifier(source.id, `${path}.id`);
        const mediaType = string(source.mediaType, 255, `${path}.mediaType`);
        if (!MEDIA_TYPE.test(mediaType)) {
            invalid("must be a concrete lowercase media type without parameters", `${path}.mediaType`);
        }
        const byteLength = integer(source.byteLength, 0, limits.maxAssetBytes, `${path}.byteLength`);
        if (byteLength > limits.maxBundleBytes - totalBytes) {
            invalid("declared assets exceed the bundle byte limit", path);
        }
        totalBytes += byteLength;
        const digest = string(source.digest, 71, `${path}.digest`);
        if (!SHA256.test(digest)) {
            invalid("must be a lowercase SHA-256 digest", `${path}.digest`);
        }
        return Object.freeze({ id, mediaType, byteLength, digest: digest as `sha256:${string}` });
    });
    unique(
        assets.map((asset) => asset.id),
        "$.assets",
    );
    return Object.freeze(assets.sort((left, right) => ordinal(left.id, right.id)));
}
