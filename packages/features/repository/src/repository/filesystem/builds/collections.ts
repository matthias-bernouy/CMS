import { acquireFilesystemLease } from "../core/lock";
import { admitCollectionReleaseJson } from "repository/collections/core/admission/admitCollectionRelease";
import { join } from "node:path";
import type { ReleaseCatalogue } from "repository/contracts/interfaces/ReleaseCatalogue";
import type { PublicationEnvelope, RepositoryPublicationResult } from "../../publication/types";
import { compileCollectionSources } from "../../authoring/preparations/source/compile";
import { FilesystemRepositorySourceStore } from "../../sources/filesystem";
import { RepositoryRequestError } from "../../core/errors";
import { LocalCollectionRepository } from "../artifacts/collections";
import { parseCollectionReleaseJson } from "repository/collections/core/parsing/parseCollectionRelease";
import { snapshotCollectionAssets, verifyCollectionAssets } from "repository/collections/core/admission/assets";
import { DEFAULT_COLLECTION_LIMITS } from "repository/collections/core/limits";

/** The caller holds the Repository write fence and, for remote writes, the namespace fence. */
export async function publishCollectionBundle(
    root: string,
    envelope: PublicationEnvelope,
    contracts: ReleaseCatalogue,
): Promise<RepositoryPublicationResult> {
    const repository = new LocalCollectionRepository(root);
    if (envelope.sourceJson === undefined) {
        // Exact historical replays only verify immutable bytes, independent of current dependency yanks.
        const release = parseCollectionReleaseJson(envelope.canonicalJson);
        const existing = await repository.getMetadata(release.publisherId, release.collectionId, release.version);
        if (!existing || existing.canonicalJson !== envelope.canonicalJson) {
            throw new RepositoryRequestError("REJECTED", "New collection publications require editable sources");
        }
        const assets = snapshotCollectionAssets(existing.release.assets, envelope.assets, DEFAULT_COLLECTION_LIMITS);
        await verifyCollectionAssets(existing.release.assets, assets);
        return { kind: "collection", release: existing.release, digest: existing.digest, added: false };
    }
    const built = await buildCollectionBundle(root, envelope, contracts);
    return publishBuiltCollection(root, built, contracts);
}

export async function buildCollectionBundle(
    root: string,
    envelope: PublicationEnvelope,
    contracts: ReleaseCatalogue | (() => Promise<ReleaseCatalogue>),
) {
    if (envelope.kind !== "collection" || envelope.sourceJson === undefined) {
        throw new RepositoryRequestError("REJECTED", "A collection build requires editable sources");
    }
    const sourceJson = envelope.sourceJson;
    // No pending in-process catalogue loads: durable callers can retry a busy worker.
    const lease = await acquireFilesystemLease(join(root, ".collection-build-execution", ".write-lock"));
    try {
        const built = await compileCollectionSources(
            join(root, ".collection-builds"),
            sourceJson,
            envelope.assets,
            typeof contracts === "function" ? await contracts() : contracts,
        );
        const artifact = built.admission;
        if (artifact.canonicalJson !== envelope.canonicalJson) {
            throw new RepositoryRequestError(
                "REJECTED",
                "Repository build differs from the reviewed collection release",
            );
        }
        return built;
    } finally {
        await lease.release();
    }
}

/** Finalization rechecks catalogue admission under the Repository and namespace fences. */
export async function publishBuiltCollection(
    root: string,
    built: Awaited<ReturnType<typeof buildCollectionBundle>>,
    contracts: ReleaseCatalogue,
    signal?: AbortSignal,
): Promise<RepositoryPublicationResult> {
    signal?.throwIfAborted();
    const artifact = await admitCollectionReleaseJson(built.admission.canonicalJson, built.admission.assets, {
        contracts,
    });
    const repository = new LocalCollectionRepository(root);
    // Evolution and immutable conflicts are checked before the source write; the release marker is last.
    const added = await repository.store(artifact, async () => {
        signal?.throwIfAborted();
        await new FilesystemRepositorySourceStore(root).put(
            artifact.release.publisherId,
            artifact.release.collectionId,
            artifact.release.version,
            { sourceJson: built.sourceJson, releaseDigest: artifact.digest },
        );
        signal?.throwIfAborted();
    });
    return { kind: "collection", release: artifact.release, digest: artifact.digest, added };
}
