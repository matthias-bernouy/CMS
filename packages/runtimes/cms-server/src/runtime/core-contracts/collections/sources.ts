import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import { CoreCapabilityDispatchError } from "@bernouy/cms-content";
import type { CoreStores } from "../../stores/core";
import { requiredText } from "./support";

const MAX_CATALOGUE_RELEASES = 1024;

type ReleaseReference = {
    repositoryId: string;
    publisherId: string;
    collectionId: string;
    version: string;
    digest: string;
};

export class CollectionSources {
    private readonly byId: ReadonlyMap<string, CollectionRepositorySource>;

    constructor(
        private readonly store: CoreStores["collections"],
        sources: readonly CollectionRepositorySource[],
    ) {
        this.byId = new Map(sources.map((source) => [source.id, source]));
        if (this.byId.size !== sources.length) {
            throw new TypeError("Collection repository source IDs must be unique");
        }
    }

    async catalogue(siteId: string) {
        const [snapshot, releases] = await Promise.all([
            this.store.snapshot(siteId),
            Promise.all([...this.byId.values()].map((source) => source.list())).then((items) => items.flat()),
        ]);
        if (releases.length > MAX_CATALOGUE_RELEASES) {
            throw new CoreCapabilityDispatchError("CATALOGUE_TOO_LARGE", 422);
        }
        return {
            revision: snapshot.revision,
            repositories: [...this.byId.keys()],
            releases,
            installed: snapshot.collections.map(({ collectionId, digest, repositoryId, release }) => ({
                collectionId,
                publisherId: release.publisherId,
                version: release.version,
                digest,
                ...(repositoryId ? { repositoryId } : {}),
            })),
        };
    }

    async stage(value: unknown): Promise<readonly { digest: string; repositoryId: string }[]> {
        if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
            throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
        }
        const references = value.map(parseReference);
        const catalogues = new Map<string, Awaited<ReturnType<CollectionRepositorySource["list"]>>>();
        return Promise.all(
            references.map(async (reference) => {
                const source = this.byId.get(reference.repositoryId);
                if (!source) {
                    throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
                }
                let catalogue = catalogues.get(source.id);
                if (!catalogue) {
                    catalogue = await source.list();
                    catalogues.set(source.id, catalogue);
                }
                const listed = catalogue.find((entry) => sameRelease(entry, reference));
                if (!listed) {
                    throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
                }
                const bundle = await source.get(listed);
                const admitted = await this.store.importRelease(bundle.release, bundle.assets);
                if (!sameRelease({ ...admitted.release, digest: admitted.digest }, reference)) {
                    throw new CoreCapabilityDispatchError("RELEASE_MISMATCH", 409);
                }
                return { digest: admitted.digest, repositoryId: source.id };
            }),
        );
    }
}

function parseReference(value: unknown): ReleaseReference {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    const record = value as Record<string, unknown>;
    return {
        repositoryId: requiredText(record.repositoryId),
        publisherId: requiredText(record.publisherId),
        collectionId: requiredText(record.collectionId),
        version: requiredText(record.version),
        digest: requiredText(record.digest),
    };
}

function sameRelease(
    value: { publisherId: string; collectionId: string; version: string; digest: string },
    reference: ReleaseReference,
): boolean {
    return (
        value.publisherId === reference.publisherId &&
        value.collectionId === reference.collectionId &&
        value.version === reference.version &&
        value.digest === reference.digest
    );
}
