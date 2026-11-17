import { compareSemVer, releaseChannel, satisfiesVersionRange } from "@bernouy/ulvia-contracts/compatibility";
import { canonicalIJsonBytes } from "@bernouy/ulvia-contracts/protocol";
import { inlineCollectionVerifier } from "repository/collections/sources/verification";
import type { CollectionVerifier } from "repository/collections/sources/verification";
import type { VerifiedCollectionReleaseMetadata } from "repository/collections/interfaces/CollectionAdmission";
import type { CollectionRepositoryEntry, CollectionRepositorySource } from "repository/collections/sources/interfaces";
import type { InitializationRoot } from "repository/collections/installations/initialization/interfaces";
import { DEFAULT_INITIALIZATION_LIMITS as LIMITS } from "repository/collections/installations/initialization/limits";
import { initializationRoot } from "repository/collections/installations/initialization/planning/root";
import { initializationError } from "repository/collections/installations/initialization/execution/state";

async function initializationCatalogue(source: CollectionRepositorySource, signal?: AbortSignal) {
    const entries = await source.list(signal);
    if (entries.length > 1024) {
        throw initializationError("Initialization catalogue is too large");
    }
    return entries;
}

/** Exact includes and bounded ordinary dependency resolution, without loading any asset bytes. */
export async function resolveInitializationGraph(
    source: CollectionRepositorySource,
    requested: unknown,
    signal?: AbortSignal,
    verifier: CollectionVerifier = inlineCollectionVerifier,
) {
    signal?.throwIfAborted();
    const root = initializationRoot(requested);
    let listed: Promise<CollectionRepositoryEntry[]> | undefined;
    const catalogue = () => (listed ??= initializationCatalogue(source, signal));
    const loaded = new Map<string, VerifiedCollectionReleaseMetadata>();
    let metadataBytes = 0;
    const visit = async (entry: CollectionRepositoryEntry, recipeId?: string): Promise<void> => {
        signal?.throwIfAborted();
        let metadata = loaded.get(entry.collectionId);
        if (metadata && metadata.digest !== entry.digest) {
            throw initializationError("Conflicting exact initialization releases", 409);
        }
        if (!metadata) {
            if (loaded.size >= LIMITS.maxCollections) {
                throw initializationError("Initialization collection limit exceeded");
            }
            const input = await source.getMetadata(entry, signal);
            metadataBytes += canonicalIJsonBytes(input, 64).byteLength;
            if (metadataBytes > LIMITS.maxMetadataBytes) {
                throw initializationError("Initialization metadata limit exceeded");
            }
            metadata = await verifier.metadata(input, entry.digest, signal);
            if (
                metadata.release.collectionId !== entry.collectionId ||
                metadata.release.version !== entry.version ||
                metadata.release.publisherId !== entry.publisherId
            ) {
                throw initializationError("Initialization release mismatch", 409);
            }
            loaded.set(entry.collectionId, metadata);
            for (const dependency of metadata.release.dependencies ?? []) {
                const existing = loaded.get(dependency.collectionId);
                const candidate = (await catalogue())
                    .filter(
                        (item) =>
                            item.collectionId === dependency.collectionId &&
                            item.publisherId === dependency.publisherId &&
                            releaseChannel(item.version) === "stable" &&
                            satisfiesVersionRange(item.version, dependency.versionRange) &&
                            (!existing || item.digest === existing.digest),
                    )
                    .sort((a, b) => compareSemVer(b.version, a.version))[0];
                if (!candidate) {
                    throw initializationError(`Unavailable collection dependency: ${dependency.collectionId}`);
                }
                await visit(candidate);
            }
        }
        if (recipeId !== undefined) {
            const recipeKey = `${entry.digest}\0${recipeId}`;
            if (recipes.has(recipeKey)) {
                return;
            }
            if (recipes.size >= LIMITS.maxRecipes) {
                throw initializationError("Initialization recipe limit exceeded");
            }
            recipes.add(recipeKey);
            const recipe = metadata.release.bootstraps?.find(({ id }) => id === recipeId);
            if (!recipe) {
                throw initializationError("The requested bootstrap recipe is unavailable");
            }
            for (const include of recipe.includes) {
                await visit(await exact(include), include.bootstrapId);
            }
        }
    };
    const exact = async (pin: InitializationRoot) => {
        signal?.throwIfAborted();
        const page = source.page
            ? await source.page(
                  {
                      mode: "history",
                      channel: "all",
                      publisherId: pin.publisherId,
                      collectionId: pin.collectionId,
                      version: pin.version,
                      limit: 1,
                  },
                  signal,
              )
            : undefined;
        if (page?.nextCursor || (page && page.entries.length > 1)) {
            throw initializationError("Exact bootstrap catalogue response exceeds its scope");
        }
        const entry = (page?.entries ?? (await catalogue())).find(
            (item) =>
                item.publisherId === pin.publisherId &&
                item.collectionId === pin.collectionId &&
                item.version === pin.version &&
                item.digest === pin.digest,
        );
        if (!entry) {
            throw initializationError("The exact bootstrap release is unavailable", 404);
        }
        return entry;
    };
    const recipes = new Set<string>();
    await visit(await exact(root), root.bootstrapId);
    return { root, metadata: [...loaded.values()] };
}
