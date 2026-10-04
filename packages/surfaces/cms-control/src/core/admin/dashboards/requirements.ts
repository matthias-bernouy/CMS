import type {
    CollectionCapabilityRequirement,
    CollectionRelease,
    CollectionView,
} from "@bernouy/cms-repository/collections";

/** Resolve the authority needed by one view, including every transitively used bloc. */
export function collectionViewRequirements(
    releases: readonly CollectionRelease[],
    collectionId: string,
    viewId: string,
): readonly CollectionCapabilityRequirement[] {
    const view = releases
        .find((release) => release.collectionId === collectionId)
        ?.views?.find(({ id }) => id === viewId);
    return view ? requirementsForView(releases, view) : [];
}

export function requirementsForView(
    releases: readonly CollectionRelease[],
    view: Pick<CollectionView, "uses" | "requires">,
): readonly CollectionCapabilityRequirement[] {
    const blocs = new Map(releases.flatMap((release) => release.blocs.map((bloc) => [bloc.id, bloc] as const)));
    const requirements = [...view.requires];
    const seen = new Set<string>();
    const pending = [...view.uses];
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
    return [...new Map(requirements.map((item) => [`${item.contractId}\0${item.capabilityId}`, item])).values()].sort(
        (left, right) =>
            left.contractId.localeCompare(right.contractId) || left.capabilityId.localeCompare(right.capabilityId),
    );
}
