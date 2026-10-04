import { validateSchemaValue } from "cms-repository/exports/contracts/schema";
import type { CollectionStorage } from "../../interfaces/store";
import { writeCollectionSiteState } from "../siteState";

export async function saveCollectionConfiguration(
    storage: CollectionStorage,
    siteId: string,
    collectionId: string,
    expectedRevision: number,
    value: unknown,
): Promise<void> {
    const state = await storage.readSite(siteId);
    const installation = state.installations.find((item) => item.collectionId === collectionId);
    if (!installation) {
        throw Object.assign(new Error("Collection is not installed"), { status: 404 });
    }
    const artifact = await storage.getReleaseMetadata(installation.digest);
    if (!artifact) {
        throw new Error("Missing release");
    }
    if (!artifact.release.configuration) {
        throw Object.assign(new Error("Collection does not declare configuration"), { status: 409 });
    }
    const configuration = structuredClone(value) as Readonly<Record<string, unknown>>;
    try {
        validateSchemaValue(artifact.release.configuration.schema, configuration);
    } catch (error) {
        throw new TypeError(
            `Invalid collection configuration: ${error instanceof Error ? error.message : "schema mismatch"}`,
        );
    }
    await writeCollectionSiteState(storage, siteId, state.revision, expectedRevision, {
        revision: expectedRevision + 1,
        installations: state.installations.map((item) =>
            item.collectionId === collectionId ? { ...item, configuration } : item,
        ),
    });
}

export async function uninstallCollection(
    storage: CollectionStorage,
    siteId: string,
    collectionId: string,
    expectedRevision: number,
): Promise<void> {
    const state = await storage.readSite(siteId);
    if (!state.installations.some((item) => item.collectionId === collectionId)) {
        throw Object.assign(new Error("Collection is not installed"), { status: 404 });
    }
    const releases = await Promise.all(
        state.installations.map(async (installation) => {
            const artifact = await storage.getReleaseMetadata(installation.digest);
            if (!artifact || artifact.release.collectionId !== installation.collectionId) {
                throw new Error("Installed collection artifact is missing or inconsistent");
            }
            return artifact.release;
        }),
    );
    const dependents = releases
        .filter((release) => release.dependencies?.some((dependency) => dependency.collectionId === collectionId))
        .map((release) => release.collectionId)
        .sort();
    if (dependents.length > 0) {
        throw Object.assign(new Error(`Collection is required by installed collections: ${dependents.join(", ")}`), {
            status: 409,
        });
    }
    await writeCollectionSiteState(storage, siteId, state.revision, expectedRevision, {
        revision: expectedRevision + 1,
        installations: state.installations.filter((item) => item.collectionId !== collectionId),
    });
}
