import type {
    CollectionRepositoryEntry,
    CollectionRepositorySource,
} from "@bernouy/cms-repository/collections/sources";
import {
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
    verifyStoredCollectionRelease,
    verifyStoredCollectionArtifact,
    type AdmittedCollectionRelease,
} from "@bernouy/cms-repository/collections";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import type { CmsCollectionDependencies } from "../../../ports";
import { CollectionSourceCache } from "./cache";
import { verifiedCatalogueEntry, releaseAction } from "./catalogue";
import { parseReference, sameRelease } from "./references";

const MAX_CATALOGUE_RELEASES = 1024;
type CatalogueEntry = ReturnType<typeof verifiedCatalogueEntry>;

export class CollectionSources {
    private readonly byId: ReadonlyMap<string, CollectionRepositorySource>;
    private readonly metadata = new CollectionSourceCache<CatalogueEntry>(
        256,
        4 * 1024 * 1024,
        (value) => JSON.stringify(value).length * 2,
    );
    private readonly admitted = new CollectionSourceCache<AdmittedCollectionRelease>(
        8,
        32 * 1024 * 1024,
        (value) => value.canonicalJson.length * 2 + value.assets.reduce((sum, asset) => sum + asset.bytes.size, 0),
    );

    constructor(
        private readonly store: CmsCollectionDependencies["collections"],
        sources: readonly CollectionRepositorySource[],
    ) {
        this.byId = new Map(sources.map((source) => [source.id, source]));
        if (this.byId.size !== sources.length) {
            throw new TypeError("Collection repository source IDs must be unique");
        }
    }

    async catalogue(siteId: string) {
        const [snapshot, listedReleases] = await Promise.all([
            this.store.listInstalled(siteId),
            Promise.all([...this.byId.values()].map((source) => source.list())).then((items) => items.flat()),
        ]);
        if (listedReleases.length > MAX_CATALOGUE_RELEASES) {
            throw new ProviderCapabilityDispatchError("CATALOGUE_TOO_LARGE", 422);
        }
        const releases: CatalogueEntry[] = [];
        for (const listed of listedReleases) {
            const source = this.byId.get(listed.repositoryId);
            if (!source) {
                throw new ProviderCapabilityDispatchError("RELEASE_MISMATCH", 409);
            }
            releases.push(
                await this.metadata.load(releaseKey(source, listed), async () => {
                    const input = await source.getMetadata(listed);
                    let artifact;
                    try {
                        artifact = await verifyStoredCollectionRelease(input, listed.digest);
                    } catch {
                        throw new ProviderCapabilityDispatchError("RELEASE_MISMATCH", 409);
                    }
                    assertSameRelease(artifact, listed);
                    return verifiedCatalogueEntry(source.id, artifact);
                }),
            );
        }
        const installed = new Map(snapshot.items.map((item) => [item.collectionId, item]));
        return {
            revision: snapshot.revision,
            repositories: [...this.byId.keys()],
            releases: releases.map((release) => ({
                ...structuredClone(release),
                action: releaseAction(release, installed.get(release.collectionId)),
            })),
            installed: snapshot.items.map(
                ({ collectionId, digest, repositoryId, publisherId, version, configurable }) => ({
                    collectionId,
                    publisherId,
                    version,
                    digest,
                    configurable,
                    ...(repositoryId ? { repositoryId } : {}),
                }),
            ),
        };
    }

    async stage(value: unknown): Promise<readonly { digest: string; repositoryId: string }[]> {
        return Promise.all(
            (await this.prepare(value)).map(async ({ target, artifact }) => {
                await this.store.importAdmittedRelease(artifact);
                return target;
            }),
        );
    }

    async prepare(value: unknown) {
        if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
            throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
        }
        const references = value.map(parseReference);
        const catalogues = new Map<string, ReturnType<CollectionRepositorySource["list"]>>();
        const results = new Array<{
            target: { digest: string; repositoryId: string };
            artifact: AdmittedCollectionRelease;
        }>(references.length);
        let next = 0;
        await Promise.all(
            Array.from({ length: Math.min(4, references.length) }, async () => {
                while (next < references.length) {
                    const index = next++;
                    const reference = references[index]!;
                    const source = this.byId.get(reference.repositoryId);
                    if (!source) {
                        throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
                    }
                    let catalogue = catalogues.get(source.id);
                    if (!catalogue) {
                        catalogue = source.list();
                        catalogues.set(source.id, catalogue);
                    }
                    const listed = (await catalogue).find((entry) => sameRelease(entry, reference));
                    if (!listed) {
                        throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
                    }
                    const artifact = await this.admitted.load(releaseKey(source, listed), async () => {
                        const bundle = await source.get(listed);
                        const admitted = await verifyStoredCollectionArtifact(
                            bundle.release,
                            bundle.assets,
                            listed.digest,
                        );
                        assertSameRelease(admitted, listed);
                        return admitted;
                    });
                    await this.store.validateReleaseRequirements(artifact);
                    const risk = collectionBrowserRiskDigest(collectionBrowserRisk(artifact.release));
                    if (risk !== reference.approvedBrowserRiskDigest) {
                        throw new ProviderCapabilityDispatchError("BROWSER_CAPABILITIES_APPROVAL_REQUIRED", 409);
                    }
                    results[index] = { target: { digest: artifact.digest, repositoryId: source.id }, artifact };
                }
            }),
        );
        return results;
    }
}

function releaseKey(source: CollectionRepositorySource, listed: CollectionRepositoryEntry): string {
    return `${source.id}\0${listed.publisherId}\0${listed.collectionId}\0${listed.version}\0${listed.digest}`;
}

function assertSameRelease(
    artifact: { release: AdmittedCollectionRelease["release"]; digest: string },
    listed: CollectionRepositoryEntry,
): void {
    if (!sameRelease({ ...artifact.release, digest: artifact.digest }, listed)) {
        throw new ProviderCapabilityDispatchError("RELEASE_MISMATCH", 409);
    }
}
