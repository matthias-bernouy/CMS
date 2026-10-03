import { compareSemVer } from "cms-repository/exports/contracts/compatibility";
import type { CollectionInstallation, CollectionMigrationReplacement, CollectionStorage } from "../../interfaces/store";
import { assertCollectionResourceIsolation } from "../resourceIsolation";
import { validateStoredCollectionInstallation, writeCollectionSiteState } from "../siteState";

export async function replaceCollectionsAfterMigration(
    storage: CollectionStorage,
    siteId: string,
    replacements: readonly CollectionMigrationReplacement[],
    expectedRevision: number,
): Promise<void> {
    if (
        replacements.length === 0 ||
        new Set(replacements.map((item) => item.collectionId)).size !== replacements.length
    ) {
        throw new TypeError("A migration needs unique collection replacements");
    }
    const state = await storage.readSite(siteId);
    const byId = new Map(replacements.map((replacement) => [replacement.collectionId, replacement]));
    const next = await Promise.all(
        state.installations.map(async (installation) => {
            const replacement = byId.get(installation.collectionId);
            if (!replacement) {
                return installation;
            }
            const [previous, target] = await Promise.all([
                storage.getRelease(installation.digest),
                storage.getRelease(replacement.digest),
            ]);
            if (!previous || !target || target.release.collectionId !== installation.collectionId) {
                throw new Error("Migration release artifact is missing or inconsistent");
            }
            if (
                previous.release.publisherId !== target.release.publisherId ||
                compareSemVer(target.release.version, previous.release.version) <= 0
            ) {
                throw Object.assign(new Error("Migration requires a newer release from the same publisher"), {
                    status: 409,
                });
            }
            byId.delete(installation.collectionId);
            return validateStoredCollectionInstallation(replacement, target.release);
        }),
    );
    if (byId.size > 0) {
        throw Object.assign(new Error(`Collection is not installed: ${[...byId.keys()].join(", ")}`), { status: 404 });
    }
    await validateGraph(storage, next);
    await writeCollectionSiteState(storage, siteId, state.revision, expectedRevision, {
        revision: expectedRevision + 1,
        installations: next,
    });
}

export async function restoreCollectionsAfterMigration(
    storage: CollectionStorage,
    siteId: string,
    installations: readonly CollectionInstallation[],
    expectedRevision: number,
): Promise<void> {
    const state = await storage.readSite(siteId);
    const restored = installations.map((installation) => structuredClone(installation));
    await validateGraph(storage, restored);
    await writeCollectionSiteState(storage, siteId, state.revision, expectedRevision, {
        revision: expectedRevision + 1,
        installations: restored,
    });
}

async function validateGraph(storage: CollectionStorage, installations: readonly CollectionInstallation[]) {
    const releases = await Promise.all(
        installations.map(async (installation) => {
            const artifact = await storage.getRelease(installation.digest);
            if (!artifact || artifact.release.collectionId !== installation.collectionId) {
                throw new Error("Installed collection artifact is missing or inconsistent");
            }
            validateStoredCollectionInstallation(installation, artifact.release);
            return artifact.release;
        }),
    );
    assertCollectionResourceIsolation(releases);
}
