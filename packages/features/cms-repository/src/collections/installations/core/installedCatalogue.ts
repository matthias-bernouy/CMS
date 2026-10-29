import type { CollectionStorage, InstalledCollectionSummary } from "../interfaces/store";
import { validateStoredCollectionInstallation } from "./siteState";

/** Reads current installation state and narrow release summaries, without revalidating example documents. */
export async function listInstalledCollections(storage: CollectionStorage, siteId: string) {
    const state = await storage.readSite(siteId);
    const summaries = new Map(
        (await storage.getReleaseSummaries(state.installations.map((i) => i.digest))).map((summary) => [
            summary.digest,
            summary,
        ]),
    );
    const items: InstalledCollectionSummary[] = state.installations.map((installation) => {
        const summary = summaries.get(installation.digest);
        if (!summary || summary.collectionId !== installation.collectionId) {
            throw new Error("Installed collection artifact is missing or inconsistent");
        }
        return { ...summary, ...(installation.repositoryId ? { repositoryId: installation.repositoryId } : {}) };
    });
    return { revision: state.revision, items };
}

/** Detailed reads validate mutable values against their exact release, without auditing unrelated examples. */
export async function readInstalledCollection(storage: CollectionStorage, siteId: string, collectionId: string) {
    const state = await storage.readSite(siteId);
    const installation = state.installations.find((item) => item.collectionId === collectionId);
    if (!installation) {
        return null;
    }
    const artifact = await storage.getReleaseMetadata(installation.digest);
    if (!artifact || artifact.release.collectionId !== installation.collectionId) {
        throw new Error("Installed collection artifact is missing or inconsistent");
    }
    return {
        revision: state.revision,
        collection: {
            ...validateStoredCollectionInstallation(installation, artifact.release),
            release: artifact.release,
        },
    };
}
