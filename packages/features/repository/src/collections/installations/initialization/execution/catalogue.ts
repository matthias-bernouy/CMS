import { compareSemVer, releaseChannel, satisfiesVersionRange } from "@bernouy/ulvia-contracts/compatibility";
import { canonicalIJsonBytes } from "@bernouy/ulvia-contracts/protocol";
import { verifyStoredCollectionRelease } from "../../../core/admission/collectionArtifact";
import type { VerifiedCollectionReleaseMetadata } from "../../../interfaces/CollectionAdmission";
import type { CollectionRepositoryEntry, CollectionRepositorySource } from "../../../sources/interfaces";
import type { InitializationRoot } from "../interfaces";
import { DEFAULT_INITIALIZATION_LIMITS as LIMITS } from "../limits";
import { initializationRoot } from "../planning/root";
import { initializationError } from "./state";

export async function initializationCatalogue(source: CollectionRepositorySource) {
    const entries = await source.list();
    if (entries.length > 1024) {
        throw initializationError("Initialization catalogue is too large");
    }
    return entries;
}

/** Exact includes and bounded ordinary dependency resolution, without loading any asset bytes. */
export async function resolveInitializationGraph(source: CollectionRepositorySource, requested: unknown) {
    const root = initializationRoot(requested);
    const catalogue = await initializationCatalogue(source);
    const loaded = new Map<string, VerifiedCollectionReleaseMetadata>();
    let metadataBytes = 0;
    const visit = async (entry: CollectionRepositoryEntry, recipeId?: string): Promise<void> => {
        let metadata = loaded.get(entry.collectionId);
        if (metadata && metadata.digest !== entry.digest) {
            throw initializationError("Conflicting exact initialization releases", 409);
        }
        if (!metadata) {
            if (loaded.size >= LIMITS.maxCollections) {
                throw initializationError("Initialization collection limit exceeded");
            }
            const input = await source.getMetadata(entry);
            metadataBytes += canonicalIJsonBytes(input, 64).byteLength;
            if (metadataBytes > LIMITS.maxMetadataBytes) {
                throw initializationError("Initialization metadata limit exceeded");
            }
            metadata = await verifyStoredCollectionRelease(input, entry.digest);
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
                const candidate = catalogue
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
                await visit(exact(include), include.bootstrapId);
            }
        }
    };
    const exact = (pin: InitializationRoot) => {
        const entry = catalogue.find(
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
    await visit(exact(root), root.bootstrapId);
    return { root, metadata: [...loaded.values()] };
}
