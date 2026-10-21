import type { CollectionAssetDefinition } from "cms-repository/collections/interfaces/CollectionAssets";
import { isSha256Digest } from "@bernouy/binary-media";
import { invalid } from "cms-repository/collections/core/errors";
import type { CollectionLimits } from "cms-repository/collections/core/limits";
import { array, integer, keys, ordinal, record, string, unique } from "cms-repository/collections/core/values";

const MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;

export function parseAssets(value: unknown, limits: Readonly<CollectionLimits>): readonly CollectionAssetDefinition[] {
    let totalBytes = 0;
    const assets = array(value, limits.maxAssets, "$.assets").map((item, index): CollectionAssetDefinition => {
        const path = `$.assets[${index}]`;
        const source = record(item, path);
        keys(source, ["id", "generation", "mediaType", "byteLength", "digest", "profiles"], path);
        const id = parseAssetId(source.id, `${path}.id`);
        const generation =
            source.generation === undefined
                ? 1
                : integer(source.generation, 1, Number.MAX_SAFE_INTEGER, `${path}.generation`);
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
        if (!isSha256Digest(digest)) {
            invalid("must be a lowercase SHA-256 digest", `${path}.digest`);
        }
        const profiles = array(source.profiles ?? [], 1, `${path}.profiles`).map((profile, profileIndex) => {
            if (profile !== "inline-svg") {
                invalid("unsupported asset profile", `${path}.profiles[${profileIndex}]`);
            }
            return "inline-svg" as const;
        });
        unique(profiles, `${path}.profiles`);
        if (profiles.length && mediaType !== "image/svg+xml") {
            invalid("inline-svg profile requires image/svg+xml", `${path}.profiles`);
        }
        return Object.freeze({
            id,
            generation,
            mediaType,
            byteLength,
            digest,
            ...(profiles.length ? { profiles } : {}),
        });
    });
    unique(
        assets.map((asset) => asset.id),
        "$.assets",
    );
    return Object.freeze(assets.sort((left, right) => ordinal(left.id, right.id)));
}

export function parseAssetId(value: unknown, path: string): string {
    const id = string(value, 512, path);
    if (
        id.startsWith("/") ||
        id.includes("\\") ||
        id.split("/").some((segment) => !/^[a-z0-9][a-z0-9._-]*$/u.test(segment) || segment === "." || segment === "..")
    ) {
        invalid("must be a normalized lowercase asset path", path);
    }
    return id;
}
