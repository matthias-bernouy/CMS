import { RepositoryDiscoveryError } from "../core/errors";
import { CollectionValidationError } from "repository/collections/core/errors";
import { ReleaseValidationError } from "@bernouy/ulvia-contracts";
import { ProviderManifestValidationError } from "@bernouy/ulvia-providers";
import { verifyStoredCollectionRelease } from "repository/collections/core/admission/collectionArtifact";
import { verifyStoredContractReleaseJson } from "@bernouy/ulvia-contracts";
import { verifyStoredProviderManifestJson } from "@bernouy/ulvia-providers";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import type { RepositoryDiscoverySource, RepositoryResourceReference } from "repository/repository/search/interfaces";

export async function readResourceContent(
    source: RepositoryDiscoverySource,
    reference: RepositoryResourceReference,
    blocId?: string,
    exampleId?: string,
): Promise<string> {
    const bytes = await source.read(reference);
    try {
        let payload: unknown;
        if (reference.kind === "collection") {
            const artifact = await verifyStoredCollectionRelease(
                parseStrictJson(bytes, 8 * 1024 * 1024, 64),
                reference.digest,
            );
            const release = artifact.release;
            if (
                release.publisherId !== reference.publisherId ||
                release.collectionId !== reference.id ||
                release.version !== reference.version
            ) {
                throw new RepositoryDiscoveryError("RELEASE_MISMATCH");
            }
            payload = blocId
                ? release.blocs.find((bloc) => bloc.id === blocId)
                : exampleId
                  ? release.examples?.find((example) => example.id === exampleId)
                  : {
                        ...release,
                        blocs: release.blocs.map(({ markup: _markup, ...bloc }) => ({
                            id: bloc.id,
                            label: bloc.label,
                            description: bloc.description,
                            categories: bloc.categories,
                            catalogue: bloc.catalogue ?? "listed",
                            defaultExample: bloc.defaultExample,
                            requires: bloc.requires,
                        })),
                    };
        } else if (reference.kind === "contract") {
            const artifact = await verifyStoredContractReleaseJson(bytes, reference.digest as `sha256:${string}`);
            if (
                artifact.release.publisherId !== reference.publisherId ||
                artifact.release.contractId !== reference.id ||
                artifact.release.version !== reference.version
            ) {
                throw new RepositoryDiscoveryError("RELEASE_MISMATCH");
            }
            payload = artifact.release;
        } else {
            const artifact = await verifyStoredProviderManifestJson(bytes, reference.digest as `sha256:${string}`);
            if (
                artifact.manifest.provenance.publisherId !== reference.publisherId ||
                artifact.manifest.providerId !== reference.id ||
                artifact.manifest.version !== reference.version
            ) {
                throw new RepositoryDiscoveryError("RELEASE_MISMATCH");
            }
            payload = artifact.manifest;
        }
        if (!payload) {
            throw new RepositoryDiscoveryError("NOT_FOUND");
        }
        const content = JSON.stringify(payload, null, 2);
        if (content.length > 8388608) {
            throw new RepositoryDiscoveryError("CATALOGUE_TOO_LARGE");
        }
        return content;
    } catch (error) {
        if (
            error instanceof CollectionValidationError ||
            error instanceof ReleaseValidationError ||
            error instanceof ProviderManifestValidationError ||
            error instanceof TypeError
        ) {
            throw new RepositoryDiscoveryError("RELEASE_MISMATCH");
        }
        throw error;
    }
}
