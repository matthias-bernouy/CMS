import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { ResourceTextSource } from "resources/artifacts/archive/schemas";
import { ResourceArchiveError } from "resources/artifacts/archive/errors";

/** Reserve bounded space for ordinary site overrides as well as seeded defaults. */
export function validateResourceTextSource(source: ResourceTextSource): void {
    if (
        Buffer.byteLength(canonicalizeIJson(source)) > 256 * 1024 ||
        new Set(source.texts.map((text) => text.id)).size !== source.texts.length
    ) {
        throw new ResourceArchiveError("Resource text defaults exceed their limit or duplicate an identity");
    }
    for (const text of source.texts) {
        if (!Object.hasOwn(text.values, source.locale) || Object.keys(text.values).length > 32) {
            throw new ResourceArchiveError("Texts require their default locale and at most 32 locales");
        }
    }
}
