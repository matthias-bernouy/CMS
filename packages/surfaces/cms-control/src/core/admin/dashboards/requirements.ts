import type {
    CollectionCapabilityRequirement,
    CollectionRelease,
    CollectionView,
} from "@bernouy/cms-repository/collections";
import type { DashboardNavigationItem } from "@bernouy/cms-dashboards";
import type { ControlCms } from "cms-control/ControlCms";

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

/** Compile site grants for every capability-bearing view before a dashboard becomes reachable. */
export async function activateDashboardViewExecutions(
    cms: ControlCms,
    navigation: readonly DashboardNavigationItem[],
): Promise<void> {
    const collections = cms.config.collections;
    const authority = cms.config.capabilityGateway?.viewExecutions;
    if (!collections) {
        throw new Error("Collection runtime is unavailable");
    }
    const snapshot = await collections.store.snapshot(collections.siteId);
    const releases = snapshot.collections.map(({ release }) => release);
    for (const use of new Set(collectUses(navigation))) {
        const [collectionId, viewId] = use.split(":");
        const installation = snapshot.collections.find((item) => item.collectionId === collectionId);
        const view = installation?.release.views?.find((item) => item.id === viewId);
        if (!installation || !view) {
            throw new Error(`Dashboard view ${use} is no longer installed`);
        }
        const requirements = requirementsForView(releases, view);
        if (!requirements.length) {
            continue;
        }
        if (!authority) {
            throw new Error(`Execution planning is unavailable for ${use}`);
        }
        await authority.activate({
            consumer: {
                siteId: collections.siteId,
                publisherId: installation.release.publisherId,
                collectionId: installation.collectionId,
                collectionVersion: installation.release.version,
                collectionDigest: installation.digest,
                viewId: view.id,
                viewGeneration: view.generation ?? 1,
            },
            requirements,
        });
    }
}

function collectUses(items: readonly DashboardNavigationItem[]): string[] {
    return items.flatMap((item) => [...(item.use ? [item.use] : []), ...collectUses(item.children ?? [])]);
}
