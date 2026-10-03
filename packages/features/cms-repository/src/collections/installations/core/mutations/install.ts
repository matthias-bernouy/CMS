import { assertCollectionResourceIsolation } from "../resourceIsolation";
import { writeCollectionSiteState } from "../siteState";
import type { CollectionInstallRequest, CollectionStorage } from "../../interfaces/store";

/** Install one exact dependency graph atomically; request order is irrelevant. */
export async function installCollections(
    storage: CollectionStorage,
    siteId: string,
    requests: readonly CollectionInstallRequest[],
    expectedRevision: number,
): Promise<void> {
    if (requests.length === 0) {
        throw new TypeError("At least one collection release is required");
    }
    if (requests.length > 256) {
        throw new TypeError("Collection install plan exceeds its resource limit");
    }
    const artifacts = await Promise.all(
        requests.map(async (request) => {
            const artifact = await storage.getRelease(request.digest);
            if (!artifact) {
                throw Object.assign(new Error("Unknown collection release"), { status: 404 });
            }
            return { artifact, repositoryId: request.repositoryId };
        }),
    );
    const state = await storage.readSite(siteId);
    const candidateIds = artifacts.map(({ artifact }) => artifact.release.collectionId);
    if (new Set(candidateIds).size !== candidateIds.length) {
        throw Object.assign(new Error("Collection install plan contains duplicate collection IDs"), { status: 409 });
    }
    if (candidateIds.some((id) => state.installations.some((item) => item.collectionId === id))) {
        throw Object.assign(new Error("Collection is already installed; upgrades require a separate workflow"), {
            status: 409,
        });
    }
    const installedReleases = await Promise.all(
        state.installations.map(async (installation) => {
            const installed = await storage.getRelease(installation.digest);
            if (!installed || installed.release.collectionId !== installation.collectionId) {
                throw new Error("Installed collection artifact is missing or inconsistent");
            }
            return installed.release;
        }),
    );
    assertCollectionResourceIsolation([...installedReleases, ...artifacts.map(({ artifact }) => artifact.release)]);
    await writeCollectionSiteState(storage, siteId, state.revision, expectedRevision, {
        revision: expectedRevision + 1,
        installations: [
            ...state.installations,
            ...artifacts.map(({ artifact, repositoryId }) => ({
                collectionId: artifact.release.collectionId,
                digest: artifact.digest,
                ...(repositoryId ? { repositoryId } : {}),
                configuration: structuredClone(artifact.release.configuration?.defaults ?? {}),
                textOverrides: {},
            })),
        ],
    });
}
