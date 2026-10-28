import type { CollectionCapabilityRequirement, CollectionRelease } from "../../interfaces/CollectionRelease";

export function documentRequirements(
    releases: readonly CollectionRelease[],
    document: { readonly uses: readonly string[]; readonly requires: readonly CollectionCapabilityRequirement[] },
): readonly CollectionCapabilityRequirement[] {
    const blocs = new Map(releases.flatMap((release) => release.blocs.map((bloc) => [bloc.id, bloc] as const)));
    const requirements = [...document.requires];
    const seen = new Set<string>();
    const pending = [...document.uses];
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
