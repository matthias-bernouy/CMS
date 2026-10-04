import type { CollectionCapabilityRequirement, CollectionRelease } from "../../interfaces/CollectionRelease";
import type { CollectionView } from "../../interfaces/CollectionView";

/** Resolve one installed view's direct and transitive bloc requirements. */
export function collectionViewRequirements(
    releases: readonly CollectionRelease[],
    collectionId: string,
    viewId: string,
): readonly CollectionCapabilityRequirement[] {
    const view = releases
        .find((release) => release.collectionId === collectionId)
        ?.views?.find(({ id }) => id === viewId);
    return view ? viewRequirements(releases, view) : [];
}

export function viewRequirements(
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
