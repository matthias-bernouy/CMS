import type { CollectionCapabilityRequirement, CollectionRelease } from "../../interfaces/CollectionRelease";
import type { CollectionPage } from "../../interfaces/CollectionPage";

/** Resolve one installed Page's direct and transitive Bloc requirements. */
export function collectionPageRequirements(
    releases: readonly CollectionRelease[],
    collectionId: string,
    pageId: string,
): readonly CollectionCapabilityRequirement[] {
    const page = releases
        .find((release) => release.collectionId === collectionId)
        ?.pages?.find(({ id }) => id === pageId);
    return page ? pageRequirements(releases, page) : [];
}

export function pageRequirements(
    releases: readonly CollectionRelease[],
    page: Pick<CollectionPage, "uses" | "requires">,
): readonly CollectionCapabilityRequirement[] {
    const blocs = new Map(releases.flatMap((release) => release.blocs.map((bloc) => [bloc.id, bloc] as const)));
    const requirements = [...page.requires];
    const seen = new Set<string>();
    const pending = [...page.uses];
    while (pending.length) {
        const id = pending.pop()!;
        if (seen.has(id)) {
            continue;
        }
        seen.add(id);
        const bloc = blocs.get(id);
        if (!bloc) {
            continue;
        }
        requirements.push(...bloc.requires);
        pending.push(...bloc.uses);
    }
    return [
        ...new Map(
            requirements.map((item) => [`${item.contractId}\0${item.capabilityId}\0${item.versionRange}`, item]),
        ).values(),
    ].sort(
        (left, right) =>
            left.contractId.localeCompare(right.contractId) ||
            left.capabilityId.localeCompare(right.capabilityId) ||
            left.versionRange.localeCompare(right.versionRange),
    );
}
