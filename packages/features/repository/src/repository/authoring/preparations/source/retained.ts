import { canonicalSourceSnapshot, parseSourceSnapshot } from "../../snapshot";
import type { AuthoringSourceSnapshot } from "../../snapshot";
import type { RepositoryArtifactKind } from "../../../publication/types";
import { AUTHORING_SOURCE_LIMITS } from "./limits";

type SourceRelease = Readonly<{
    kind: RepositoryArtifactKind;
    publisherId: string;
    id: string;
    version: string;
    digest: string;
}>;

/** Replace local asset references with exact release pins without changing authored file contents. */
export function retainedSourceSnapshot(snapshot: AuthoringSourceSnapshot, release: SourceRelease) {
    const sourceJson = canonicalSourceSnapshot({
        files: snapshot.files,
        assets: snapshot.assets.map(({ path }) => ({
            path,
            publisherId: release.publisherId,
            ...(release.kind === "collection" ? { collectionId: release.id } : { contractId: release.id }),
            version: release.version,
            releaseDigest: release.digest,
            assetId: path.slice(release.kind === "collection" ? 7 : 9),
        })),
    });
    if (Buffer.byteLength(sourceJson) > AUTHORING_SOURCE_LIMITS.snapshotBytes) {
        throw new Error("Retained sources exceed 8 MiB");
    }
    parseSourceSnapshot(sourceJson, release.kind);
    return sourceJson;
}
