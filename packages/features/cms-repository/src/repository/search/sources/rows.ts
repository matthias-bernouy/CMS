import type { CollectionRelease } from "cms-repository/collections/interfaces/CollectionRelease";
import { resolveCollectionTranslation } from "cms-repository/collections/core/texts/translationCatalogue";
import type { ContractRelease } from "@bernouy/ulvia-contracts";
import type { ProviderManifest } from "@bernouy/ulvia-providers";
import type { RepositorySearchRow, RepositoryResourceReference } from "../interfaces";

export function searchRow(
    reference: RepositoryResourceReference,
    name: string,
    description: string,
    categories: readonly string[],
    contractIds: readonly string[],
    content = "",
    blocId?: string,
): RepositorySearchRow {
    return {
        reference,
        ...(blocId ? { blocId } : {}),
        name: name.slice(0, 512).toWellFormed(),
        description: description.slice(0, 1600).toWellFormed(),
        categories: categories.slice(0, 32).map((category) => category.slice(0, 200).toWellFormed()),
        contractIds: [...new Set(contractIds)].slice(0, 128),
        text: `${blocId ?? reference.id}\n${name}\n${name}\n${description}\n${categories.join(" ")}\n${contractIds.join(" ")}\n${content}`
            .slice(0, 262144)
            .toWellFormed(),
    };
}
export function collectionRows(release: CollectionRelease, digest: string): RepositorySearchRow[] {
    const reference = {
        kind: "collection" as const,
        publisherId: release.publisherId,
        id: release.collectionId,
        version: release.version,
        digest,
    };
    const translated = (key: string) => resolveCollectionTranslation(release, key);
    const blocs = release.blocs.filter((bloc) => bloc.catalogue !== "hidden");
    return [
        searchRow(
            reference,
            translated(release.name),
            release.description ? translated(release.description) : "",
            [],
            release.blocs.flatMap((bloc) => bloc.requires.map((requirement) => requirement.contractId)),
            blocs.map((bloc) => translated(bloc.label)).join(" "),
        ),
        ...blocs.map((bloc) =>
            searchRow(
                reference,
                translated(bloc.label),
                translated(bloc.description),
                bloc.categories.map(translated),
                bloc.requires.map((requirement) => requirement.contractId),
                "",
                bloc.id,
            ),
        ),
    ];
}
export function contractRow(release: ContractRelease, digest: string): RepositorySearchRow {
    return searchRow(
        {
            kind: "contract",
            publisherId: release.publisherId,
            id: release.contractId,
            version: release.version,
            digest,
        },
        release.name,
        release.description ?? "",
        release.catalogue?.categories ?? [],
        [release.contractId],
        `${release.capabilities.map((capability) => capability.id).join(" ")}\n${release.capabilities.map((capability) => capability.description).join("\n")}`,
    );
}
export function providerRow(
    manifest: ProviderManifest,
    digest: string,
    implementedDescriptions = "",
): RepositorySearchRow {
    return searchRow(
        {
            kind: "provider-manifest",
            publisherId: manifest.provenance.publisherId,
            id: manifest.providerId,
            version: manifest.version,
            digest,
        },
        manifest.name,
        "",
        [],
        manifest.implementations.map((implementation) => implementation.contractId),
        implementedDescriptions,
    );
}
