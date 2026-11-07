import { CollectionValidationError } from "@bernouy/repository/collections";
import type {
    CollectionRepositoryEntry,
    CollectionRepositorySource,
    CollectionVerifier,
} from "@bernouy/repository/collections/sources";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import { requiredText } from "../support";
import { verifiedCatalogueEntry } from "./catalogue";
import type { CollectionSourceCaches } from "./cache";

/** Pure immutable evidence only; site actions and permissions are never cached here. */
export class CollectionDiscoveryMetadata {
    constructor(
        private readonly sources: ReadonlyMap<string, CollectionRepositorySource>,
        private readonly verifier: CollectionVerifier,
        private readonly caches: CollectionSourceCaches,
    ) {}
    async page(entries: readonly CollectionRepositoryEntry[], signal?: AbortSignal) {
        if (entries.length > 25) {
            throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
        }
        const verified = [];
        let bytes = 0;
        for (const entry of entries) {
            signal?.throwIfAborted();
            const metadata = await this.get(entry, signal);
            bytes += Buffer.byteLength(JSON.stringify(metadata));
            if (bytes > 1024 * 1024) {
                throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
            }
            verified.push(metadata);
        }
        return verified;
    }
    async get(input: Readonly<Record<string, unknown>>, signal?: AbortSignal) {
        const source = this.source(requiredText(input.repositoryId));
        const reference = {
            publisherId: requiredText(input.publisherId),
            collectionId: requiredText(input.collectionId),
            version: requiredText(input.version),
            digest: requiredText(input.digest),
        };
        const key = `${source.id}\0${reference.publisherId}\0${reference.collectionId}\0${reference.version}\0${reference.digest}`;
        return this.caches.metadata.load(
            key,
            async (sharedSignal) => {
                const value = await source.getMetadata(reference, sharedSignal);
                let artifact;
                try {
                    artifact = await this.verifier.metadata(value, reference.digest, sharedSignal);
                } catch (error) {
                    if (sharedSignal.aborted) {
                        throw error;
                    }
                    throw new ProviderCapabilityDispatchError(
                        error instanceof CollectionValidationError ? "RELEASE_MISMATCH" : "CORE_UNAVAILABLE",
                        error instanceof CollectionValidationError ? 409 : 503,
                    );
                }
                if (
                    artifact.release.collectionId !== reference.collectionId ||
                    artifact.release.publisherId !== reference.publisherId ||
                    artifact.release.version !== reference.version
                ) {
                    throw new ProviderCapabilityDispatchError("RELEASE_MISMATCH", 409);
                }
                return verifiedCatalogueEntry(source.id, artifact);
            },
            signal,
        );
    }

    source(id: string) {
        const source = this.sources.get(id);
        if (!source) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        return source;
    }
}
