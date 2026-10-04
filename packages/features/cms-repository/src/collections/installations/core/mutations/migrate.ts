import { compareSemVer } from "cms-repository/exports/contracts/compatibility";
import { isDeepStrictEqual } from "node:util";
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
                storage.getReleaseMetadata(installation.digest),
                storage.getReleaseMetadata(replacement.digest),
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
    replacements: readonly CollectionMigrationReplacement[],
    expectedRevision: number,
): Promise<void> {
    const state = await storage.readSite(siteId);
    const originals = new Map(installations.map((installation) => [installation.collectionId, installation]));
    const targets = new Map(replacements.map((replacement) => [replacement.collectionId, replacement]));
    if (!targets.size || targets.size !== replacements.length) {
        throw new TypeError("A rollback needs unique collection replacements");
    }
    const restored = state.installations.map((installation) => {
        const target = targets.get(installation.collectionId);
        if (!target) {
            return installation;
        }
        const original = originals.get(installation.collectionId);
        if (!original) {
            throw new Error(`Missing original collection installation: ${installation.collectionId}`);
        }
        if (!isDeepStrictEqual(installation, target) && !isDeepStrictEqual(installation, original)) {
            throw Object.assign(new Error(`Collection changed after migration: ${installation.collectionId}`), {
                status: 409,
            });
        }
        targets.delete(installation.collectionId);
        return structuredClone(original);
    });
    if (targets.size) {
        throw Object.assign(new Error(`Collection is no longer installed: ${[...targets.keys()].join(", ")}`), {
            status: 409,
        });
    }
    await validateGraph(storage, restored);
    await writeCollectionSiteState(storage, siteId, state.revision, expectedRevision, {
        revision: expectedRevision + 1,
        installations: restored,
    });
}

async function validateGraph(storage: CollectionStorage, installations: readonly CollectionInstallation[]) {
    const releases = await Promise.all(
        installations.map(async (installation) => {
            const artifact = await storage.getReleaseMetadata(installation.digest);
            if (!artifact || artifact.release.collectionId !== installation.collectionId) {
                throw new Error("Installed collection artifact is missing or inconsistent");
            }
            validateStoredCollectionInstallation(installation, artifact.release);
            return artifact.release;
        }),
    );
    assertCollectionResourceIsolation(releases);
}
