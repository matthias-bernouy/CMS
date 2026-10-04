import { compareSemVer } from "cms-repository/exports/contracts/compatibility";
import { describeCollectionResources } from "../../../core/admission/resourceDescriptors";
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
    const artifact = await storage.getReleaseMetadata(digest);
    if (!artifact) {
        throw Object.assign(new Error("Unknown collection release"), { status: 404 });
    }
    const state = await storage.readSite(siteId);
    const previous = state.installations.find((item) => item.collectionId === artifact.release.collectionId);
    if (!previous) {
        throw Object.assign(new Error("Collection is not installed"), { status: 404 });
    }
    const old = await storage.getReleaseMetadata(previous.digest);
    if (
        !old ||
        old.release.publisherId !== artifact.release.publisherId ||
        compareSemVer(artifact.release.version, old.release.version) <= 0
    ) {
        throw Object.assign(new Error("Upgrade requires a newer release from the same publisher"), { status: 409 });
    }
    if ((old.release.dataGeneration ?? 1) !== (artifact.release.dataGeneration ?? 1)) {
        throw Object.assign(new Error("Collection data generation changed; use the migration workflow"), {
            status: 409,
        });
    }
    await assertResourceGenerationsUnchanged(old.release, artifact.release);
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

async function assertResourceGenerationsUnchanged(
    previous: Parameters<typeof describeCollectionResources>[0],
    next: Parameters<typeof describeCollectionResources>[0],
): Promise<void> {
    const [oldResources, nextResources] = await Promise.all([
        describeCollectionResources(previous),
        describeCollectionResources(next),
    ]);
    const nextByKey = new Map(nextResources.map((resource) => [`${resource.kind}:${resource.id}`, resource]));
    const changed = oldResources.find((resource) => {
        const replacement = nextByKey.get(`${resource.kind}:${resource.id}`);
        return replacement && replacement.generation !== resource.generation;
    });
    if (changed) {
        throw Object.assign(
            new Error(
                `Collection resource generation changed for ${changed.kind} ${changed.id}; use the migration workflow`,
            ),
            { status: 409 },
        );
    }
}
