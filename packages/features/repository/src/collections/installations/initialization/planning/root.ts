import { resourcePublisher } from "@bernouy/ulvia-contracts/protocol";
import { isCanonicalSemVer } from "@bernouy/ulvia-contracts/compatibility";
import { parseCollectionNamespace } from "../../../core/namespace";
import { invalid } from "../../../core/errors";
import { identifier, keys, record, string } from "../../../core/values";
import type { InitializationRoot } from "../interfaces";

export function initializationRoot(value: unknown): InitializationRoot {
    const source = record(value, "$.root");
    keys(source, ["publisherId", "collectionId", "version", "digest", "bootstrapId"], "$.root");
    const collectionId = parseCollectionNamespace(source.collectionId, "$.root.collectionId");
    const version = string(source.version, 128, "$.root.version");
    const digest = string(source.digest, 71, "$.root.digest");
    if (
        resourcePublisher(collectionId) !== source.publisherId ||
        !isCanonicalSemVer(version) ||
        !/^sha256:[0-9a-f]{64}$/u.test(digest)
    ) {
        invalid("must use an exact bootstrap release in its owning namespace", "$.root");
    }
    return {
        publisherId: resourcePublisher(collectionId),
        collectionId,
        version,
        digest: digest as `sha256:${string}`,
        bootstrapId: identifier(source.bootstrapId, "$.root.bootstrapId"),
    };
}
