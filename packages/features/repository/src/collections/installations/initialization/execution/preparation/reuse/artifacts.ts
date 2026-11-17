import type {
    AdmittedCollectionRelease,
    VerifiedCollectionReleaseMetadata,
} from "repository/collections/interfaces/CollectionAdmission";
import type { CollectionVerifier } from "repository/collections/sources/verification";
import type { CollectionRepositoryReference } from "repository/collections/sources/interfaces";
import { DEFAULT_COLLECTION_LIMITS, normalizeCollectionLimits } from "repository/collections/core/limits";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";

type Entry = { metadata: VerifiedCollectionReleaseMetadata; artifact?: AdmittedCollectionRelease; bytes: number };

/** Instance-local immutable evidence. Publication availability and execution authority are never cached here. */
export class InitializationArtifacts {
    private readonly entries = new Map<string, Entry>();
    private bytes = 0;
    private policy: unknown[] = [];
    generation = 0;
    private readonly defaultLimits = canonicalizeIJson(normalizeCollectionLimits(DEFAULT_COLLECTION_LIMITS));

    constructor(
        private readonly maxBytes = 8 * 1024 * 1024,
        private readonly maxEntries = 4,
    ) {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxEntries) || maxEntries < 1) {
            throw new TypeError("Invalid initialization artifact retention limit");
        }
    }

    stats() {
        return { entries: this.entries.size, bytes: this.bytes };
    }

    verifier(base: CollectionVerifier): CollectionVerifier {
        const policy = [base, base.metadata, base.metadataJson, base.artifact, base.assets, base.evolution];
        if (policy.some((value, index) => value !== this.policy[index])) {
            this.entries.clear();
            this.bytes = 0;
            this.policy = policy;
            this.generation++;
        }
        return {
            metadataJson: (value, digest, signal, limits) => base.metadataJson(value, digest, signal, limits),
            artifact: (value, assets, digest, signal, limits) => base.artifact(value, assets, digest, signal, limits),
            evolution: (previous, next, signal) => base.evolution(previous, next, signal),
            ...(base.assets
                ? { assets: (...args: Parameters<NonNullable<CollectionVerifier["assets"]>>) => base.assets!(...args) }
                : {}),
            ...this.metadataVerifier(base),
        };
    }

    private metadataVerifier(base: CollectionVerifier): Pick<CollectionVerifier, "metadata"> {
        return {
            metadata: async (value, digest, signal, limits) => {
                signal?.throwIfAborted();
                const reusable =
                    limits === undefined || canonicalizeIJson(normalizeCollectionLimits(limits)) === this.defaultLimits;
                const cached = typeof digest === "string" && reusable ? this.entries.get(digest) : undefined;
                if (cached && cached.metadata.release === value) {
                    return cached.metadata;
                }
                const verified = await base.metadata(value, digest, signal, limits);
                signal?.throwIfAborted();
                if (!reusable) {
                    return verified;
                }
                if (cached?.metadata.canonicalJson === verified.canonicalJson) {
                    return cached.metadata;
                }
                this.put({ metadata: verified, bytes: new TextEncoder().encode(verified.canonicalJson).byteLength });
                return verified;
            },
        };
    }

    get(reference: CollectionRepositoryReference): Entry | undefined {
        const entry = this.entries.get(reference.digest);
        if (
            !entry ||
            entry.metadata.release.publisherId !== reference.publisherId ||
            entry.metadata.release.collectionId !== reference.collectionId ||
            entry.metadata.release.version !== reference.version
        ) {
            return undefined;
        }
        this.entries.delete(reference.digest);
        this.entries.set(reference.digest, entry);
        return entry;
    }

    remember(artifact: AdmittedCollectionRelease) {
        const { assets: _assets, ...metadata } = artifact;
        this.put({
            metadata: Object.freeze(metadata),
            artifact,
            bytes:
                new TextEncoder().encode(artifact.canonicalJson).byteLength +
                artifact.assets.reduce((sum, asset) => sum + asset.bytes.size, 0),
        });
    }

    private put(entry: Entry) {
        if (entry.bytes > this.maxBytes) {
            return;
        }
        const previous = this.entries.get(entry.metadata.digest);
        if (previous) {
            this.bytes -= previous.bytes;
            this.entries.delete(entry.metadata.digest);
        }
        while (
            this.entries.size &&
            (this.entries.size >= this.maxEntries || this.bytes + entry.bytes > this.maxBytes)
        ) {
            const oldest = this.entries.keys().next().value!;
            this.bytes -= this.entries.get(oldest)!.bytes;
            this.entries.delete(oldest);
        }
        this.entries.set(entry.metadata.digest, entry);
        this.bytes += entry.bytes;
    }
}
