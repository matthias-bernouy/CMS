import { compareSemVer } from "cms-repository/exports/contracts/compatibility";
import { parseCollectionTextOverrides } from "../../../core/texts/parseCollectionTexts";
import type { CollectionStorage } from "../../interfaces/store";
import { assertInstallableCollectionResources } from "../resourceIsolation";
import { validateStoredCollectionInstallation, writeCollectionSiteState } from "../siteState";
import { assertCompatibleCollectionUpgrade } from "../upgradeCompatibility";

export async function upgradeCollection(
    storage: CollectionStorage,
    siteId: string,
    digest: string,
    expectedRevision: number,
    repositoryId: string,
): Promise<void> {
    const artifact = await storage.getRelease(digest);
    if (!artifact) {
        throw Object.assign(new Error("Unknown collection release"), { status: 404 });
    }
    const state = await storage.readSite(siteId);
    const previous = state.installations.find((item) => item.collectionId === artifact.release.collectionId);
    if (!previous) {
        throw Object.assign(new Error("Collection is not installed"), { status: 404 });
    }
    const old = await storage.getRelease(previous.digest);
    if (
        !old ||
        old.release.publisherId !== artifact.release.publisherId ||
        compareSemVer(artifact.release.version, old.release.version) <= 0
    ) {
        throw Object.assign(new Error("Upgrade requires a newer release from the same publisher"), { status: 409 });
    }
    assertCompatibleCollectionUpgrade(old.release, artifact.release);
    await assertInstallableCollectionResources(
        storage,
        state.installations.filter((item) => item !== previous),
        artifact.release,
    );
    const textOverrides = parseCollectionTextOverrides(previous.textOverrides, artifact.release.texts ?? []);
    const configuration = old.release.configuration
        ? structuredClone(previous.configuration)
        : structuredClone(artifact.release.configuration?.defaults ?? {});
    const replacement = validateStoredCollectionInstallation(
        { ...previous, digest, repositoryId, configuration, textOverrides },
        artifact.release,
    );
    await writeCollectionSiteState(storage, siteId, state.revision, expectedRevision, {
        revision: expectedRevision + 1,
        installations: state.installations.map((item) => (item === previous ? replacement : item)),
    });
}
